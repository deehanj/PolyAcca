/**
 * Cloudflare Bypass Headers
 *
 * Patches Node.js https module to add browser-like headers to Polymarket requests.
 * Intercepts ALL outgoing HTTPS requests, including from nested dependencies.
 */

import https from 'https';
import http from 'http';

let installed = false;
const originalRequest = https.request;

const BROWSER_HEADERS: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
};

export function installCloudflareBypassHeaders(): void {
  if (installed) return;
  installed = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (https as any).request = function (...args: any[]): http.ClientRequest {
    const opts = typeof args[0] === 'object' && !(args[0] instanceof URL) ? args[0] : args[1] || {};
    const host = opts.hostname || opts.host || (typeof args[0] === 'string' ? args[0] : args[0]?.hostname) || '';

    if (host.includes('polymarket.com')) {
      opts.headers = { ...BROWSER_HEADERS, ...opts.headers, 'user-agent': BROWSER_HEADERS['user-agent'] };
      if (typeof args[0] === 'object' && !(args[0] instanceof URL)) {
        args[0] = opts;
      } else {
        args[1] = opts;
      }
    }

    return originalRequest.apply(https, args as Parameters<typeof https.request>);
  };
}
