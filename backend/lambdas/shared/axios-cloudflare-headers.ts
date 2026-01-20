/**
 * Cloudflare Bypass - Routes Polymarket order POST requests through Sydney Lambda
 *
 * The @polymarket/clob-client uses axios internally. This patches the underlying
 * HTTP layer to route POST /order requests through ap-southeast-2 to bypass
 * Cloudflare's geo-blocking of US datacenter IPs.
 */

import followRedirects from 'follow-redirects';
import { PassThrough } from 'stream';
import type http from 'http';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Sydney proxy config - initialized from environment
const ENV = process.env.ENVIRONMENT ?? 'dev';
const ACCOUNT = process.env.AWS_ACCOUNT_ID ?? '';
const PROXY_ARN = ACCOUNT ? `arn:aws:lambda:ap-southeast-2:${ACCOUNT}:function:polyacca-${ENV}-http-proxy` : '';
const lambdaClient = PROXY_ARN ? new LambdaClient({ region: 'ap-southeast-2' }) : null;

const originalRequest = followRedirects.https.request;

(followRedirects.https as any).request = function (options: any, callback: any) {
  const host = options?.hostname || options?.host || '';
  const path = options?.path || '';
  const method = (options?.method || 'GET').toUpperCase();

  // Route POST /order through Sydney proxy if configured
  if (lambdaClient && PROXY_ARN && host.includes('clob.polymarket.com') && path.includes('/order') && method === 'POST') {
    return createProxyRequest(options, callback);
  }

  // Patch User-Agent for all Polymarket requests
  if (host.includes('polymarket.com')) {
    options.headers = { ...options.headers, 'User-Agent': BROWSER_UA };
  }

  return originalRequest.call(this, options, callback);
};

function createProxyRequest(options: any, callback: (res: http.IncomingMessage) => void): http.ClientRequest {
  const req = new PassThrough() as any;
  const chunks: Buffer[] = [];

  req.write = (chunk: any) => { if (chunk) chunks.push(Buffer.from(chunk)); return true; };
  req.end = (chunk?: any) => {
    if (chunk) chunks.push(Buffer.from(chunk));

    const body = Buffer.concat(chunks).toString();
    const url = `https://${options.hostname || options.host}${options.path || '/'}`;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(options.headers || {})) {
      if (v != null) headers[k] = String(v);
    }

    console.log('[sydney-proxy] Routing:', url);

    lambdaClient!.send(new InvokeCommand({
      FunctionName: PROXY_ARN,
      Payload: Buffer.from(JSON.stringify({ url, method: 'POST', headers, body })),
    })).then(res => {
      const payload = res.Payload ? JSON.parse(Buffer.from(res.Payload).toString()) : { statusCode: 500, body: '{}' };
      console.log('[sydney-proxy] Response:', payload.statusCode);

      const fakeRes = new PassThrough() as unknown as http.IncomingMessage;
      fakeRes.statusCode = payload.statusCode;
      fakeRes.headers = payload.headers || {};
      setImmediate(() => { (fakeRes as any).push(payload.body); (fakeRes as any).push(null); });
      callback(fakeRes);
    }).catch(err => {
      console.error('[sydney-proxy] Error:', err.message);
      const fakeRes = new PassThrough() as unknown as http.IncomingMessage;
      fakeRes.statusCode = 500;
      fakeRes.headers = {};
      setImmediate(() => { (fakeRes as any).push(JSON.stringify({ error: err.message })); (fakeRes as any).push(null); });
      callback(fakeRes);
    });

    return req;
  };

  // No-ops for unused methods
  req.on = () => req;
  req.once = () => req;
  req.emit = () => true;
  req.setTimeout = () => req;
  req.setNoDelay = () => req;
  req.setSocketKeepAlive = () => req;
  req.abort = () => {};
  req.destroy = () => req;

  return req;
}
