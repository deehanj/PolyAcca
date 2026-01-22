/**
 * IPRoyal Residential Proxy Configuration for Polymarket
 *
 * Routes ALL requests through residential IPs in Dubai, UAE to bypass Cloudflare blocking.
 * UAE is not on Polymarket's restricted countries list.
 *
 * Uses a global proxy with whitelist approach - all requests go through proxy
 * EXCEPT for whitelisted domains (AWS, internal services, etc).
 */

import axios from 'axios';
import https from 'https';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createLogger } from './logger';

const logger = createLogger('iproyal-proxy');

// IPRoyal proxy configuration from environment or hardcoded
const PROXY_CONFIG = {
  host: process.env.IPROYAL_HOST || 'geo.iproyal.com',
  port: parseInt(process.env.IPROYAL_PORT || '12321'),
  username: process.env.IPROYAL_USERNAME || 'RzXTePEf4o5eJWpR',
  password: process.env.IPROYAL_PASSWORD || 'AzZISa7HXAcV26Mg_country-ae_city-dubai',
};

// Domains that should NOT use the proxy (whitelist)
const PROXY_BYPASS_DOMAINS = [
  // AWS Services
  'amazonaws.com',
  'aws.amazon.com',
  'dynamodb',
  'lambda',
  's3',
  'secretsmanager',
  'kms',
  'cloudfront',

  // Local/Internal
  'localhost',
  '127.0.0.1',
  '169.254', // AWS metadata service

  // Turnkey
  'api.turnkey.com',

  // Other blockchain RPCs (not Polymarket)
  'polygon-rpc.com',
  'alchemy.com',
  'infura.io',
];

/**
 * Check if a URL should bypass the proxy
 */
function shouldBypassProxy(url?: string): boolean {
  if (!url) return true; // No URL = bypass proxy

  // Check if any bypass domain is in the URL
  return PROXY_BYPASS_DOMAINS.some(domain => url.includes(domain));
}

/**
 * Configure global proxy for all HTTP/HTTPS requests
 * This ensures even the @polymarket/clob-client library uses the proxy
 */
export function configureIPRoyalProxy(): void {
  const proxyUrl = `http://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;

  logger.info('Configuring global IPRoyal residential proxy', {
    host: PROXY_CONFIG.host,
    port: PROXY_CONFIG.port,
    location: 'Dubai, UAE',
    mode: 'global-with-whitelist',
  });

  // Create proxy agent
  const proxyAgent = new HttpsProxyAgent(proxyUrl);

  // Store original agents
  const originalHttpAgent = http.globalAgent;
  const originalHttpsAgent = https.globalAgent;

  // Override global agents for Node.js http/https modules
  // This affects ALL HTTP clients including those created by third-party libraries
  http.globalAgent = proxyAgent as any;
  https.globalAgent = proxyAgent as any;

  // Configure axios defaults to use the proxy
  axios.defaults.proxy = false; // Disable axios built-in proxy to use httpAgent
  axios.defaults.httpsAgent = proxyAgent;
  axios.defaults.httpAgent = proxyAgent;

  // Add request interceptor to handle whitelisting
  axios.interceptors.request.use(
    (config) => {
      const url = config.url;

      if (shouldBypassProxy(url)) {
        // Use original agents for whitelisted domains
        logger.debug('Bypassing proxy for whitelisted domain', { url });
        config.httpsAgent = originalHttpsAgent;
        config.httpAgent = originalHttpAgent;
      } else {
        // Use proxy for everything else (including Polymarket)
        logger.debug('Routing request through IPRoyal proxy', {
          url,
          method: config.method,
        });
        config.httpsAgent = proxyAgent;
        config.httpAgent = proxyAgent;
      }

      config.proxy = false; // Always disable axios proxy to use agents
      return config;
    },
    (error) => {
      logger.error('Request interceptor error', error);
      return Promise.reject(error);
    }
  );

  // Add response interceptor for logging
  axios.interceptors.response.use(
    (response) => {
      const url = response.config.url;
      if (!shouldBypassProxy(url)) {
        logger.debug('Received proxied response', {
          url,
          status: response.status,
        });
      }
      return response;
    },
    (error) => {
      if (error.response) {
        logger.error('Request failed', {
          url: error.config?.url,
          status: error.response.status,
          statusText: error.response.statusText,
          proxied: !shouldBypassProxy(error.config?.url),
        });
      } else {
        logger.error('Network error', {
          message: error.message,
          url: error.config?.url,
          proxied: !shouldBypassProxy(error.config?.url),
        });
      }
      return Promise.reject(error);
    }
  );

  // Set environment variables for libraries that respect them
  process.env.HTTP_PROXY = proxyUrl;
  process.env.HTTPS_PROXY = proxyUrl;
  process.env.http_proxy = proxyUrl;
  process.env.https_proxy = proxyUrl;

  // Set NO_PROXY for whitelisted domains
  process.env.NO_PROXY = PROXY_BYPASS_DOMAINS.join(',');
  process.env.no_proxy = PROXY_BYPASS_DOMAINS.join(',');

  logger.info('Global proxy configuration complete', {
    globalAgentsOverridden: true,
    environmentVariablesSet: true,
    whitelistedDomains: PROXY_BYPASS_DOMAINS.length,
  });
}

/**
 * Get proxy configuration for axios
 * This can be used with individual axios instances if needed
 */
export function getIPRoyalProxyConfig(): { httpsAgent: any; httpAgent: any; proxy: false } {
  const proxyUrl = `http://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
  const proxyAgent = new HttpsProxyAgent(proxyUrl);

  return {
    httpsAgent: proxyAgent,
    httpAgent: proxyAgent,
    proxy: false, // Disable axios proxy to use agent
  };
}