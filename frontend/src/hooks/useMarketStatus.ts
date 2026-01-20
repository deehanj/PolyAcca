/**
 * Hook for checking market betting status from CLOB API
 */

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export interface MarketStatus {
  conditionId: string;
  acceptingOrders: boolean;
  closed?: boolean;
  active?: boolean;
  enableOrderBook?: boolean;
  endDate?: string;
  canBet: boolean;
  reason: string;
}

interface MarketStatusResponse {
  success: boolean;
  data?: MarketStatus;
  error?: string;
}

/**
 * Check if a market is currently accepting orders
 *
 * @param conditionId - The condition ID for the market (Market.conditionId)
 * @returns Market status including canBet boolean and reason
 */
export async function checkMarketStatus(conditionId: string): Promise<MarketStatus> {
  if (!API_URL) {
    throw new Error('API URL not configured');
  }

  const response = await fetch(`${API_URL}/markets/${conditionId}/status`);
  const data: MarketStatusResponse = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to check market status');
  }

  return data.data!;
}

/**
 * Check if a market can be bet on
 * Returns a simple result with canBet and reason
 *
 * @param conditionId - The condition ID for the market (Market.conditionId)
 */
export async function isMarketBettable(
  conditionId: string
): Promise<{ canBet: boolean; reason: string }> {
  try {
    const status = await checkMarketStatus(conditionId);
    return {
      canBet: status.canBet,
      reason: status.reason,
    };
  } catch (error) {
    // If we can't check, assume it's bettable and let the backend handle it
    console.warn('Failed to check market status:', error);
    return {
      canBet: true,
      reason: 'Unable to verify market status',
    };
  }
}
