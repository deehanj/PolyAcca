import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketHookOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  reconnectInterval?: number; // Base reconnect delay (default: 1000ms)
  maxReconnectInterval?: number; // Max backoff (default: 30000ms)
  pingInterval?: number; // Keepalive ping interval (default: 5min)
  enabled?: boolean; // Whether to connect (default: true)
}

interface WebSocketHookReturn {
  isConnected: boolean;
  lastMessage: unknown | null;
  send: (data: unknown) => void;
}

export function useWebSocket(options: WebSocketHookOptions): WebSocketHookReturn {
  const {
    url,
    onMessage,
    reconnectInterval = 1000,
    maxReconnectInterval = 30000,
    pingInterval = 5 * 60 * 1000, // 5 minutes
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<number | null>(null);
  const pingTimeout = useRef<number | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep onMessage ref up to date
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const schedulePing = useCallback(() => {
    if (pingTimeout.current) {
      window.clearTimeout(pingTimeout.current);
    }
    pingTimeout.current = window.setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
        schedulePing();
      }
    }, pingInterval);
  }, [pingInterval]);

  const connect = useCallback(() => {
    // Don't connect if no URL
    if (!url) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      schedulePing();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') return;
        setLastMessage(data);
        onMessageRef.current?.(data);
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.wasClean ? '(clean)' : '(dirty)');
      setIsConnected(false);

      if (pingTimeout.current) {
        window.clearTimeout(pingTimeout.current);
      }

      // Only reconnect if enabled
      if (!enabled) return;

      // Exponential backoff reconnect
      const delay = Math.min(
        reconnectInterval * Math.pow(2, reconnectAttempts.current),
        maxReconnectInterval
      );

      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);

      reconnectTimeout.current = window.setTimeout(() => {
        reconnectAttempts.current++;
        connect();
      }, delay);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [url, reconnectInterval, maxReconnectInterval, schedulePing, enabled]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    if (enabled && url) {
      connect();
    }

    return () => {
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current);
      }
      if (pingTimeout.current) {
        window.clearTimeout(pingTimeout.current);
      }
      wsRef.current?.close();
    };
  }, [connect, enabled, url]);

  return { isConnected, lastMessage, send };
}
