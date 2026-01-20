/**
 * Lambda Proxy Adapter for Polymarket API Calls
 *
 * Routes HTTP requests through a Lambda function in Stockholm, Sweden (eu-north-1)
 * to bypass Polymarket's geographic blocking of US and other countries.
 *
 * This adapter intercepts axios requests and forwards them through the proxy Lambda.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { AxiosAdapter, AxiosRequestConfig } from 'axios';
import { createLogger } from './logger';

const logger = createLogger('lambda-proxy-adapter');

// Lambda client for invoking the proxy function
const lambdaClient = new LambdaClient({ region: 'us-east-1' });

// The ARN of the proxy Lambda in Stockholm
const PROXY_LAMBDA_ARN = process.env.HTTP_PROXY_LAMBDA_ARN;

export interface ProxyRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body?: string;
}

export interface ProxyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Create an axios adapter that routes requests through the Lambda proxy
 *
 * @param lambdaArn - ARN of the proxy Lambda function (optional, uses env var if not provided)
 * @returns Axios adapter function
 */
export function createLambdaProxyAdapter(lambdaArn?: string): AxiosAdapter {
  const proxyArn = lambdaArn || PROXY_LAMBDA_ARN;

  if (!proxyArn) {
    throw new Error('HTTP_PROXY_LAMBDA_ARN environment variable or lambdaArn parameter must be set');
  }

  return async (config: AxiosRequestConfig) => {
    // Build the full URL
    const url = new URL(config.url!, config.baseURL);
    const fullUrl = url.toString();

    logger.debug('Proxying request through Lambda', {
      url: fullUrl,
      method: config.method,
      proxyArn
    });

    // Prepare the proxy request
    const proxyRequest: ProxyRequest = {
      url: fullUrl,
      method: (config.method?.toUpperCase() || 'GET') as ProxyRequest['method'],
      headers: config.headers as Record<string, string>,
    };

    // Add body if present
    if (config.data) {
      if (typeof config.data === 'string') {
        proxyRequest.body = config.data;
      } else {
        proxyRequest.body = JSON.stringify(config.data);
      }
    }

    try {
      // Invoke the proxy Lambda
      const command = new InvokeCommand({
        FunctionName: proxyArn,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(proxyRequest),
      });

      const response = await lambdaClient.send(command);

      if (!response.Payload) {
        throw new Error('No response from proxy Lambda');
      }

      // Parse the Lambda response
      const payloadStr = new TextDecoder().decode(response.Payload);
      const proxyResponse: ProxyResponse = JSON.parse(payloadStr);

      logger.debug('Received proxy response', {
        statusCode: proxyResponse.statusCode,
        url: fullUrl
      });

      // Parse response body if it's JSON
      let responseData = proxyResponse.body;
      const contentType = proxyResponse.headers['content-type'] || '';
      if (contentType.includes('application/json') && responseData) {
        try {
          responseData = JSON.parse(responseData);
        } catch {
          // Keep as string if JSON parsing fails
        }
      }

      // Return axios-compatible response
      return {
        data: responseData,
        status: proxyResponse.statusCode,
        statusText: getStatusText(proxyResponse.statusCode),
        headers: proxyResponse.headers,
        config: config,
        request: {},
      };
    } catch (error) {
      logger.errorWithStack('Lambda proxy request failed', error, { url: fullUrl });

      // Convert to axios-compatible error
      const axiosError = {
        message: error instanceof Error ? error.message : 'Proxy request failed',
        code: 'EPROXY',
        config: config,
        request: {},
        response: undefined,
      };

      throw axiosError;
    }
  };
}

/**
 * Helper to get status text from status code
 */
function getStatusText(statusCode: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return statusTexts[statusCode] || '';
}

/**
 * Check if we should use the proxy for a given URL
 * Only proxy Polymarket API calls, not other services
 */
export function shouldUseProxy(url: string): boolean {
  const polymarketDomains = [
    'clob.polymarket.com',
    'gamma-api.polymarket.com',
    'polymarket.com',
  ];

  try {
    const urlObj = new URL(url);
    return polymarketDomains.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}