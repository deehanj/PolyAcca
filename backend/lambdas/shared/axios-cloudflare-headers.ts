/**
 * Cloudflare Bypass - Routes Polymarket requests through Bright Data residential proxy
 *
 * The @polymarket/clob-client uses axios internally. This patches the underlying
 * HTTP layer to route requests through Bright Data's residential proxy network
 * to bypass Cloudflare's datacenter IP blocking.
 */

import followRedirects from 'follow-redirects';
import { HttpsProxyAgent } from 'https-proxy-agent';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Bright Data proxy configuration from environment variables
const PROXY_USERNAME = process.env.BRIGHT_DATA_USERNAME ?? '';
const PROXY_PASSWORD = process.env.BRIGHT_DATA_PASSWORD ?? '';
const PROXY_HOST = process.env.BRIGHT_DATA_HOST ?? 'brd.superproxy.io';
const PROXY_PORT = process.env.BRIGHT_DATA_PORT ?? '33335';

// Create proxy agent if credentials are configured
const proxyUrl = PROXY_USERNAME && PROXY_PASSWORD
  ? `http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`
  : null;

const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

if (proxyAgent) {
  console.log('[bright-data-proxy] Residential proxy configured');
} else {
  console.log('[bright-data-proxy] No proxy configured, using direct connection');
}

const originalRequest = followRedirects.https.request;

(followRedirects.https as any).request = function (options: any, callback: any) {
  const host = options?.hostname || options?.host || '';

  // Use Bright Data proxy for all Polymarket requests
  if (proxyAgent && host.includes('polymarket.com')) {
    console.log(`[bright-data-proxy] Routing through residential proxy: ${options.method} https://${host}${options.path || '/'}`);
    options.agent = proxyAgent;
    options.headers = { ...options.headers, 'User-Agent': BROWSER_UA };
  } else if (host.includes('polymarket.com')) {
    // Even without proxy, use browser UA for Polymarket
    options.headers = { ...options.headers, 'User-Agent': BROWSER_UA };
  }

  return originalRequest.call(this, options, callback);
};

