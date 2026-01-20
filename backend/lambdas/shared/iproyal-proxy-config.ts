/**
 * IPRoyal Residential Proxy Configuration for Polymarket
 *
 * Routes requests through residential IPs in Dubai, UAE to bypass Cloudflare blocking.
 * UAE is not on Polymarket's restricted countries list.
 */

import axios from 'axios';
import type { AxiosProxyConfig } from 'axios';
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

/**
 * Configure axios to use IPRoyal residential proxy for Polymarket requests
 */
export function configureIPRoyalProxy(): void {
  const proxyUrl = `http://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;

  logger.info('Configuring IPRoyal residential proxy', {
    host: PROXY_CONFIG.host,
    port: PROXY_CONFIG.port,
    location: 'Dubai, UAE',
  });

  // Create proxy agent for HTTPS requests
  const proxyAgent = new HttpsProxyAgent(proxyUrl);

  // Configure axios defaults to use the proxy
  axios.defaults.proxy = false; // Disable axios built-in proxy to use httpAgent
  axios.defaults.httpsAgent = proxyAgent;
  axios.defaults.httpAgent = proxyAgent;

  // Add request interceptor for logging
  axios.interceptors.request.use(
    (config) => {
      if (isPolymarketRequest(config.url)) {
        logger.debug('Routing Polymarket request through IPRoyal proxy', {
          url: config.url,
          method: config.method,
        });
        // Ensure proxy agent is used
        config.httpsAgent = proxyAgent;
        config.httpAgent = proxyAgent;
        config.proxy = false; // Important: disable axios proxy to use agent
      }
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
      logger.debug('Received response through proxy', {
        url: response.config.url,
        status: response.status,
      });
      return response;
    },
    (error) => {
      if (error.response) {
        logger.error('Proxy request failed', {
          url: error.config?.url,
          status: error.response.status,
          statusText: error.response.statusText,
        });
      } else {
        logger.error('Proxy network error', {
          message: error.message,
        });
      }
      return Promise.reject(error);
    }
  );
}

/**
 * Check if a request is for Polymarket
 */
function isPolymarketRequest(url?: string): boolean {
  if (!url) return false;

  const polymarketDomains = [
    'clob.polymarket.com',
    'gamma-api.polymarket.com',
    'polymarket.com',
  ];

  return polymarketDomains.some(domain => url.includes(domain));
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