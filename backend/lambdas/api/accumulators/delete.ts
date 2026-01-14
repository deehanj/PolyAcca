/**
 * DELETE handler for accumulators
 *
 * - DELETE /accumulators/{id} - Cancel accumulator
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  getAccumulator,
  updateAccumulatorStatus,
  getAccumulatorBets,
  updateBetStatus,
} from '../../shared/dynamo-client';
import { errorResponse, successResponse } from './utils';

/**
 * DELETE /accumulators/{id} - Cancel accumulator
 */
export async function cancelAccumulator(
  walletAddress: string,
  accumulatorId: string
): Promise<APIGatewayProxyResult> {
  const accumulator = await getAccumulator(walletAddress, accumulatorId);

  if (!accumulator) {
    return errorResponse(404, 'Accumulator not found');
  }

  // Can only cancel PENDING or ACTIVE accumulators
  if (!['PENDING', 'ACTIVE'].includes(accumulator.status)) {
    return errorResponse(400, `Cannot cancel accumulator with status: ${accumulator.status}`);
  }

  // Update accumulator status
  await updateAccumulatorStatus(walletAddress, accumulatorId, 'CANCELLED');

  // Cancel all pending/queued bets
  const bets = await getAccumulatorBets(accumulatorId);
  for (const bet of bets) {
    if (['QUEUED', 'READY'].includes(bet.status)) {
      await updateBetStatus(accumulatorId, bet.sequence, 'CANCELLED');
    }
  }

  return successResponse({ message: 'Accumulator cancelled successfully' });
}
