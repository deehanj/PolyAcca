/**
 * Cloudflare Bypass Headers
 *
 * Patches follow-redirects module (used by axios) to override User-Agent.
 * Must be imported before any code that uses axios.
 */

import followRedirects from 'follow-redirects';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const originalRequest = followRedirects.https.request;

(followRedirects.https as any).request = function (options: any, callback: any) {
  if (options?.hostname?.includes('polymarket.com') || options?.host?.includes('polymarket.com')) {
    const oldUA = options.headers?.['User-Agent'] || options.headers?.['user-agent'];
    options.headers = options.headers || {};
    for (const key of Object.keys(options.headers)) {
      if (key.toLowerCase() === 'user-agent') {
        delete options.headers[key];
      }
    }
    options.headers['User-Agent'] = BROWSER_UA;
    console.log('[cloudflare-bypass] Patched User-Agent:', oldUA, '->', BROWSER_UA.slice(0, 30) + '...');
  }
  return originalRequest.call(this, options, callback);
};
