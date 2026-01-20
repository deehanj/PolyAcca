/**
 * HTTP Proxy Lambda (Sydney)
 *
 * Lightweight proxy that forwards HTTP requests from an Australian IP.
 * Used to bypass Cloudflare geo-blocking of US datacenter IPs.
 *
 * No business logic, no AWS SDK, no secrets - just HTTP forwarding.
 */

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

export async function handler(event: ProxyRequest): Promise<ProxyResponse> {
  const { url, method, headers, body } = event;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body || undefined,
    });

    // Collect response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const responseBody = await response.text();

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: {},
      body: JSON.stringify({ error: errorMessage }),
    };
  }
}
