# Node-level HTTP Proxy Patch Design

## Problem

Polymarket blocks AWS Lambda IPs via Cloudflare. James set up an IPRoyal residential proxy (Dubai IP) to bypass this, but the `@polymarket/clob-client` library's HTTP requests aren't going through the proxy.

The current approach (`iproyal-proxy-config.ts`) sets axios defaults and global HTTP agents, but the clob-client doesn't respect these settings.

## Solution

Patch Node's `http.request()` and `https.request()` at the lowest level. ALL HTTP libraries must eventually call these functions, so there's no way to bypass the proxy.

```
Your Code / clob-client / axios
           │
           ▼
    OUR PATCH (intercept)
           │
     ┌─────┴─────┐
     │           │
  Direct     Proxy
  (AWS)    (Polymarket)
```

## Implementation

### New file: `shared/proxy-patch.ts`

```typescript
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createLogger } from './logger';

const logger = createLogger('proxy-patch');

const PROXY_URL = `http://${process.env.IPROYAL_USERNAME || 'RzXTePEf4o5eJWpR'}:${process.env.IPROYAL_PASSWORD || 'AzZISa7HXAcV26Mg_country-ae_city-dubai'}@${process.env.IPROYAL_HOST || 'geo.iproyal.com'}:${process.env.IPROYAL_PORT || '12321'}`;

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

const PROXY_LIST = [
  'polymarket.com',
  'clob.polymarket.com',
  'gamma-api.polymarket.com',
];

let initialized = false;

function shouldProxy(host: string | undefined): boolean {
  if (!host) return false;
  if (BYPASS_LIST.some(domain => host.includes(domain))) return false;
  return PROXY_LIST.some(domain => host.includes(domain));
}

function getHost(options: any): string | undefined {
  if (typeof options === 'string') {
    try { return new URL(options).hostname; } catch { return undefined; }
  }
  return options?.hostname || options?.host;
}

export function applyProxyPatch(): void {
  if (initialized) return;
  initialized = true;

  const proxyAgent = new HttpsProxyAgent(PROXY_URL);
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;

  (https as any).request = function(options: any, callback?: any) {
    const host = getHost(options);
    if (shouldProxy(host)) {
      logger.debug('Proxying request', { host });
      if (typeof options === 'object') options.agent = proxyAgent;
    }
    return originalHttpsRequest.call(https, options, callback);
  };

  (http as any).request = function(options: any, callback?: any) {
    const host = getHost(options);
    if (shouldProxy(host)) {
      logger.debug('Proxying request', { host });
      if (typeof options === 'object') options.agent = proxyAgent;
    }
    return originalHttpRequest.call(http, options, callback);
  };

  logger.info('Proxy patch applied', { proxyHost: 'geo.iproyal.com', location: 'Dubai, UAE' });
}
```

### Integration in bet-executor

```typescript
// Change import
import { applyProxyPatch } from '../../shared/proxy-patch';

function initProxy(): void {
  applyProxyPatch();
}
```

## Files to Change

1. Create `backend/lambdas/shared/proxy-patch.ts`
2. Update `backend/lambdas/streams/bet-executor/index.ts` (change import)
3. Delete `backend/lambdas/shared/iproyal-proxy-config.ts` (after verification)

## Testing

1. Deploy and check CloudWatch for: `Proxying request { host: 'clob.polymarket.com' }`
2. Success = status 200/401 from Polymarket API
3. Failure = status 403 with Cloudflare HTML

## Key Differences from Previous Approach

| Previous (`iproyal-proxy-config.ts`) | New (`proxy-patch.ts`) |
|--------------------------------------|------------------------|
| Sets axios defaults | Patches Node itself |
| Libraries can bypass | Cannot be bypassed |
| Proxies everything except bypass list | Only proxies Polymarket domains |
| Complex interceptors | Simple function wrapper |
