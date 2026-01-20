/**
 * Configure Axios to use Lambda Proxy for Polymarket requests
 *
 * This modifies the global axios defaults to route Polymarket API calls
 * through our Lambda proxy in Stockholm, Sweden.
 *
 * Must be imported BEFORE creating any ClobClient instances.
 */

import axios from 'axios';
import { createLambdaProxyAdapter, shouldUseProxy } from './lambda-proxy-adapter';
import { createLogger } from './logger';

const logger = createLogger('configure-proxy');

// Store the original adapter for non-Polymarket requests
const originalAdapter = axios.defaults.adapter;

/**
 * Configure axios to use the Lambda proxy for Polymarket requests
 *
 * @param lambdaArn - ARN of the proxy Lambda function
 */
export function configurePolymarketProxy(lambdaArn: string): void {
  logger.info('Configuring Polymarket proxy', { lambdaArn });

  // Create the Lambda proxy adapter
  const proxyAdapter = createLambdaProxyAdapter(lambdaArn);

  // Set up axios interceptor to conditionally use proxy
  axios.defaults.adapter = async (config) => {
    const url = config.url || '';

    // Check if this is a Polymarket request
    if (shouldUseProxy(url)) {
      logger.debug('Using Lambda proxy for Polymarket request', { url });
      return proxyAdapter(config);
    }

    // Use original adapter for non-Polymarket requests
    logger.debug('Using default adapter for non-Polymarket request', { url });
    if (originalAdapter) {
      return originalAdapter(config);
    }

    // Fallback to axios default behavior
    throw new Error('No adapter available');
  };
}

/**
 * Remove proxy configuration and restore original axios adapter
 */
export function removeProxyConfiguration(): void {
  logger.info('Removing proxy configuration');
  axios.defaults.adapter = originalAdapter;
}