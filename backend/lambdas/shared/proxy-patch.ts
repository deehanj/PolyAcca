/**
 * Node-level HTTP Proxy Patch
 *
 * Intercepts ALL http/https requests at the Node.js level.
 * Routes Polymarket traffic through IPRoyal Dubai residential proxy.
 * Everything else goes direct.
 *
 * This approach patches Node itself, so no library can bypass the proxy.
 */

import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createLogger } from './logger';

const logger = createLogger('proxy-patch');

// IPRoyal configuration
const PROXY_URL = `http://${process.env.IPROYAL_USERNAME || 'RzXTePEf4o5eJWpR'}:${process.env.IPROYAL_PASSWORD || 'AzZISa7HXAcV26Mg_country-ae_city-dubai'}@${process.env.IPROYAL_HOST || 'geo.iproyal.com'}:${process.env.IPROYAL_PORT || '12321'}`;

// Domains that go DIRECT (no proxy)
const BYPASS_LIST = [
  'amazonaws.com',
  'aws.amazon.com',
  'api.turnkey.com',
  'polygon-rpc.com',
  'alchemy.com',
  'infura.io',
  'localhost',
  '127.0.0.1',
  '169.254',
];

// Domains that MUST go through proxy
const PROXY_LIST = [
  'polymarket.com',
  'clob.polymarket.com',
  'gamma-api.polymarket.com',
];

let initialized = false;

/**
 * Check if a host should be proxied
 */
function shouldProxy(host: string | undefined): boolean {
  if (!host) return false;

  // Check bypass list first
  if (BYPASS_LIST.some((domain) => host.includes(domain))) {
    return false;
  }

  // Check if it's a Polymarket domain
  return PROXY_LIST.some((domain) => host.includes(domain));
}

/**
 * Extract hostname from request options
 */
function getHost(options: unknown): string | undefined {
  if (typeof options === 'string') {
    try {
      return new URL(options).hostname;
    } catch {
      return undefined;
    }
  }
  if (options && typeof options === 'object') {
    const opts = options as { hostname?: string; host?: string };
    return opts.hostname || opts.host;
  }
  return undefined;
}

/**
 * Apply the proxy patch to Node's http/https modules
 *
 * Safe to call multiple times - only applies once.
 */
export function applyProxyPatch(): void {
  if (initialized) return;
  initialized = true;

  const proxyAgent = new HttpsProxyAgent(PROXY_URL);

  // Store originals
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;

  // Patch https.request
  (https as unknown as { request: typeof https.request }).request = function (
    options: unknown,
    callback?: unknown
  ) {
    const host = getHost(options);

    if (shouldProxy(host)) {
      if (options && typeof options === 'object') {
        const opts = options as { path?: string; method?: string };
        if (opts.path?.includes('/order')) {
          logger.info('Proxying Polymarket order request', {
            host,
            path: opts.path,
            method: opts.method ?? 'GET',
            proxyHost: 'geo.iproyal.com',
          });
        } else {
          logger.debug('Proxying HTTPS request', { host });
        }
      } else {
        logger.debug('Proxying HTTPS request', { host });
      }
      if (options && typeof options === 'object') {
        (options as { agent?: unknown }).agent = proxyAgent;
      }
    }

    return originalHttpsRequest.call(
      https,
      options as Parameters<typeof https.request>[0],
      callback as Parameters<typeof https.request>[1]
    );
  } as typeof https.request;

  // Patch http.request
  (http as unknown as { request: typeof http.request }).request = function (
    options: unknown,
    callback?: unknown
  ) {
    const host = getHost(options);

    if (shouldProxy(host)) {
      if (options && typeof options === 'object') {
        const opts = options as { path?: string; method?: string };
        if (opts.path?.includes('/order')) {
          logger.info('Proxying Polymarket order request', {
            host,
            path: opts.path,
            method: opts.method ?? 'GET',
            proxyHost: 'geo.iproyal.com',
          });
        } else {
          logger.debug('Proxying HTTP request', { host });
        }
      } else {
        logger.debug('Proxying HTTP request', { host });
      }
      if (options && typeof options === 'object') {
        (options as { agent?: unknown }).agent = proxyAgent;
      }
    }

    return originalHttpRequest.call(
      http,
      options as Parameters<typeof http.request>[0],
      callback as Parameters<typeof http.request>[1]
    );
  } as typeof http.request;

  logger.info('Proxy patch applied', {
    proxyHost: 'geo.iproyal.com',
    location: 'Dubai, UAE',
    proxiedDomains: PROXY_LIST,
  });
}
