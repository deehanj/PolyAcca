/**
 * POST /chains/estimate
 *
 * Calculate price impact and fill estimates without placing orders
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { errorResponse, successResponse } from '../../shared/api-utils';
import { fetchMarketByConditionId } from '../../shared/gamma-client';
import {
  fetchOrderbook,
  calculatePriceImpact,
  exceedsLiquidityThreshold
} from '../../shared/orderbook-client';
import type { CheckoutEstimate, CheckoutLegEstimate } from '../../shared/types';
import { createLogger } from '../../shared/logger';
import { toMicroUsdc, fromMicroUsdc } from '../../shared/usdc-math';

const logger = createLogger('estimate-endpoint');

const LIQUIDITY_THRESHOLD = 0.05; // 5%

interface EstimateRequest {
  legs: {
    conditionId: string;
    tokenId: string;
    side: 'YES' | 'NO';
    targetPrice: string;
  }[];
  initialStake: string;
  maxSlippage: string;
}

export async function estimateChain(body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) {
    return errorResponse(400, 'Request body required');
  }

  let request: EstimateRequest;
  try {
    request = JSON.parse(body);
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  if (!request.legs?.length || !request.initialStake) {
    return errorResponse(400, 'legs and initialStake required');
  }

  const warnings: string[] = [];
  const legEstimates: CheckoutLegEstimate[] = [];

  let currentStakeMicro = toMicroUsdc(request.initialStake);
  let totalImpactMicro = 0n;

  for (const leg of request.legs) {
    try {
      // Get market liquidity from Gamma
      const market = await fetchMarketByConditionId(leg.conditionId);
      const liquidity = market?.liquidityNum || 0;

      const currentStake = fromMicroUsdc(currentStakeMicro);
      const needsOrderbook = exceedsLiquidityThreshold(currentStake, liquidity, LIQUIDITY_THRESHOLD);

      let estimatedFillPrice = leg.targetPrice;
      let impact = '0';
      let fillableAmount = currentStake;

      if (needsOrderbook) {
        // Fetch real orderbook for accurate estimate
        const orderbook = await fetchOrderbook(leg.tokenId);
        const levels = leg.side === 'YES' ? orderbook.asks : orderbook.bids;
        const result = calculatePriceImpact(levels, currentStake, leg.targetPrice);

        estimatedFillPrice = result.estimatedFillPrice;
        impact = result.priceImpact;
        fillableAmount = result.fillableAmount;

        if (result.insufficientLiquidity) {
          warnings.push(`Leg ${leg.conditionId}: Only ${fillableAmount} of ${currentStake} fillable`);
        }
      }

      // Calculate impact in micro USDC
      const impactAmount = currentStakeMicro * BigInt(Math.round(parseFloat(impact) * 10000)) / 10000n;
      totalImpactMicro += impactAmount;

      legEstimates.push({
        conditionId: leg.conditionId,
        displayedPrice: leg.targetPrice,
        estimatedFillPrice,
        estimatedImpact: impact,
        liquidityDepth: String(liquidity),
        requiresOrderbookFetch: needsOrderbook,
      });

      // Calculate next leg's stake (shares acquired = fillableAmount / price)
      const fillPriceMicro = toMicroUsdc(estimatedFillPrice);
      const fillableAmountMicro = toMicroUsdc(fillableAmount);
      // shares = stake / price, next stake = shares * $1
      currentStakeMicro = (fillableAmountMicro * 1_000_000n) / fillPriceMicro;

    } catch (error) {
      logger.errorWithStack('Error estimating leg', error, { conditionId: leg.conditionId });
      // Use displayed price as fallback
      legEstimates.push({
        conditionId: leg.conditionId,
        displayedPrice: leg.targetPrice,
        estimatedFillPrice: leg.targetPrice,
        estimatedImpact: '0',
        liquidityDepth: '0',
        requiresOrderbookFetch: false,
      });
    }
  }

  const initialStakeMicro = toMicroUsdc(request.initialStake);
  const totalCostMicro = initialStakeMicro + totalImpactMicro;
  let impactPercent = 0;
  if (initialStakeMicro > 0n) {
    impactPercent = Number(totalImpactMicro * 10000n / initialStakeMicro) / 100;
  }

  // Warn if total impact exceeds user's slippage tolerance
  const slippage = parseFloat(request.maxSlippage) || 0;
  if (impactPercent > slippage * 100) {
    warnings.push(`Total price impact (${impactPercent.toFixed(2)}%) exceeds your max slippage (${(slippage * 100).toFixed(2)}%)`);
  }

  const estimate: CheckoutEstimate = {
    legs: legEstimates,
    totalEstimatedCost: fromMicroUsdc(totalCostMicro),
    totalImpactPercent: impactPercent.toFixed(2),
    warnings,
  };

  return successResponse(estimate);
}
