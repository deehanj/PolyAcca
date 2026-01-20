/**
 * Cloudflare Bypass - Routes Polymarket requests through Bright Data residential proxy
 *
 * The @polymarket/clob-client uses axios internally. This patches the underlying
 * HTTP layer to route requests through Bright Data's residential proxy network
 * to bypass Cloudflare's datacenter IP blocking.
 *
 * IMPORTANT: We manually handle the proxy connection instead of using HttpsProxyAgent
 * because axios instances created with axios.create() don't properly respect the agent.
 */

import followRedirects from 'follow-redirects';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Bright Data proxy configuration from environment variables
const PROXY_USERNAME = process.env.BRIGHT_DATA_USERNAME ?? '';
const PROXY_PASSWORD = process.env.BRIGHT_DATA_PASSWORD ?? '';
const PROXY_HOST = process.env.BRIGHT_DATA_HOST ?? 'brd.superproxy.io';
const PROXY_PORT = parseInt(process.env.BRIGHT_DATA_PORT ?? '33335');

const HAS_PROXY = PROXY_USERNAME && PROXY_PASSWORD;

if (HAS_PROXY) {
  console.log('[bright-data-proxy] Residential proxy configured:', PROXY_HOST);
} else {
  console.log('[bright-data-proxy] No proxy configured, using direct connection');
}

const originalRequest = followRedirects.https.request;

// Manually handle proxy CONNECT for HTTPS
(followRedirects.https as any).request = function (options: any, callback: any) {
  const targetHost = options?.hostname || options?.host || '';

  // Only proxy Polymarket requests
  if (!HAS_PROXY || !targetHost.includes('polymarket.com')) {
    // Just set User-Agent for non-proxied requests
    if (targetHost.includes('polymarket.com') && options.headers) {
      options.headers['User-Agent'] = BROWSER_UA;
    }
    return originalRequest.call(this, options, callback);
  }

  console.log(`[bright-data-proxy] Routing through residential proxy: ${options.method} https://${targetHost}${options.path || '/'}`);

  // Build the full target URL
  const targetPort = options.port || 443;
  const targetPath = options.path || '/';

  // Create CONNECT tunnel through proxy
  const connectOptions = {
    host: PROXY_HOST,
    port: PROXY_PORT,
    method: 'CONNECT',
    path: `${targetHost}:${targetPort}`,
    headers: {
      'Host': `${targetHost}:${targetPort}`,
      'Proxy-Authorization': 'Basic ' + Buffer.from(`${PROXY_USERNAME}:${PROXY_PASSWORD}`).toString('base64'),
      'User-Agent': BROWSER_UA,
    }
  };

  return http.request(connectOptions, (res) => {
    res.on('socket', (socket) => {
      // Tunnel established, now make the actual HTTPS request
      const tlsOptions = {
        socket: socket,
        servername: targetHost, // SNI
      };

      const tlsSocket = https.request({
        ...options,
        ...tlsOptions,
        host: targetHost,
        hostname: targetHost,
        port: targetPort,
        path: targetPath,
        headers: {
          ...options.headers,
          'User-Agent': BROWSER_UA, // Force browser UA
          'Host': targetHost,
        },
        // Don't use agent since we're handling the socket manually
        agent: false,
        createConnection: () => socket,
        rejectUnauthorized: false, // Accept Bright Data's certificate
      }, callback);

      // Forward the original request body if present
      return tlsSocket;
    });
  }).on('connect', (res: any, socket: any) => {
    if (res.statusCode !== 200) {
      console.error('[bright-data-proxy] Proxy CONNECT failed:', res.statusCode);
      callback(res);
      return;
    }

    // Tunnel established, make the actual request
    const tlsOptions = {
      socket: socket,
      servername: targetHost,
    };

    const targetReq = https.request({
      ...options,
      ...tlsOptions,
      host: targetHost,
      hostname: targetHost,
      port: targetPort,
      path: targetPath,
      headers: {
        ...options.headers,
        'User-Agent': BROWSER_UA,
        'Host': targetHost,
      },
      agent: false,
      createConnection: () => socket,
      rejectUnauthorized: false, // Accept Bright Data's certificate
    }, callback);

    return targetReq;
  }).on('error', (err: any) => {
    console.error('[bright-data-proxy] Proxy connection error:', err.message);
    // Fall back to direct connection
    return originalRequest.call(this, options, callback);
  }).end();
};

