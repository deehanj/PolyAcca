import { useCallback } from 'react';
import { toast } from 'sonner';
import { useWebSocket } from './useWebSocket';

interface BetNotification {
  type: 'NEW_BET';
  data: {
    wallet: string;
    stake: string;
    legs: string[];
    chainId: string;
    timestamp: string;
  };
}

export function useBetNotifications() {
  const handleMessage = useCallback((message: unknown) => {
    const msg = message as BetNotification;

    if (msg.type === 'NEW_BET') {
      const { wallet, stake, legs } = msg.data;

      // Format legs for display (truncate if too many)
      const legsDisplay =
        legs.length > 2
          ? `${legs.slice(0, 2).join(', ')} +${legs.length - 2} more`
          : legs.join(', ');

      toast.success(`${wallet} bet $${stake}`, {
        description: legsDisplay,
        duration: 5000,
      });
    }
  }, []);

  const wsUrl = import.meta.env.VITE_WS_URL;

  // Only connect if URL is configured
  const { isConnected } = useWebSocket({
    url: wsUrl || 'wss://placeholder.invalid',
    onMessage: wsUrl ? handleMessage : undefined,
  });

  return { isConnected: wsUrl ? isConnected : false };
}
