/**
 * Axios Cloudflare Headers
 *
 * Adds browser-like headers to axios requests to prevent Cloudflare blocking.
 * Must be called early in Lambda initialization (before any HTTP clients are created).
 */

import axios from 'axios';

let interceptorInstalled = false;

/**
 * Browser-like headers that help bypass Cloudflare bot protection
 */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

/**
 * Install axios interceptor that adds browser-like headers to all requests.
 * This helps prevent Cloudflare from blocking Lambda requests.
 *
 * Safe to call multiple times - will only install once.
 */
export function installCloudflareBypassHeaders(): void {
  if (interceptorInstalled) {
    return;
  }

  axios.interceptors.request.use(
    (config) => {
      // Only modify headers for polymarket.com domains
      const url = config.url || '';
      if (url.includes('polymarket.com')) {
        // Merge browser headers, but don't override any that are explicitly set
        config.headers = config.headers || {};

        for (const [key, value] of Object.entries(BROWSER_HEADERS)) {
          // Only set if not already present
          if (!config.headers[key]) {
            config.headers[key] = value;
          }
        }
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  interceptorInstalled = true;
}
