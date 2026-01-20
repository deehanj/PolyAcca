/**
 * Cloudflare Bypass - Routes Polymarket requests through Bright Data residential proxy
 *
 * Uses global-agent to configure proxy for all HTTP/HTTPS requests globally
 */

// @ts-ignore - no types available
import { bootstrap } from 'global-agent';

// Bright Data proxy configuration
const PROXY_USERNAME = process.env.BRIGHT_DATA_USERNAME ?? '';
const PROXY_PASSWORD = process.env.BRIGHT_DATA_PASSWORD ?? '';
const PROXY_HOST = process.env.BRIGHT_DATA_HOST ?? 'brd.superproxy.io';
const PROXY_PORT = process.env.BRIGHT_DATA_PORT ?? '33335';

if (PROXY_USERNAME && PROXY_PASSWORD) {
  // Configure global proxy for all HTTPS requests
  process.env.GLOBAL_AGENT_HTTP_PROXY = `http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`;
  process.env.GLOBAL_AGENT_HTTPS_PROXY = `http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`;

  // IMPORTANT: Exclude AWS services, Turnkey, and localhost from proxy
  // This ensures only Polymarket requests go through Bright Data
  process.env.GLOBAL_AGENT_NO_PROXY = [
    'localhost',
    '127.0.0.1',
    '169.254.169.254', // AWS metadata service
    '.amazonaws.com',   // All AWS services
    '.aws.amazon.com',  // AWS console/services
    'polygon-rpc.com',  // Polygon RPC (direct connection)
    '.turnkey.com',     // Turnkey API (wallet signing)
    'api.turnkey.com',  // Explicit Turnkey API
    '.turnkey.io',      // Any other Turnkey domains
  ].join(',');

  // Disable certificate verification for Bright Data's proxy
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // Initialize global-agent
  bootstrap();

  console.log('[bright-data-proxy] Global proxy configured for Polymarket requests only');
} else {
  console.log('[bright-data-proxy] No proxy configured, using direct connection');
}

