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

  // Disable certificate verification for Bright Data's proxy
  process.env.GLOBAL_AGENT_NO_PROXY = ''; // Empty to ensure all requests go through proxy
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // Initialize global-agent
  bootstrap();

  console.log('[bright-data-proxy] Global proxy configured for all HTTPS requests');
} else {
  console.log('[bright-data-proxy] No proxy configured, using direct connection');
}

