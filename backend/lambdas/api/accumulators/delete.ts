/**
 * DELETE handler for user accas
 *
 * - DELETE /accumulators/{id} - Cancel user acca
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  getUserAcca,
  updateUserAccaStatus,
  getPositionBets,
  updateBetStatus,
} from '../../shared/dynamo-client';
import { errorResponse, successResponse } from './utils';

/**
 * DELETE /accumulators/{id} - Cancel user acca
 */
export async function cancelUserAcca(
  walletAddress: string,
  accumulatorId: string
): Promise<APIGatewayProxyResult> {
  const userAcca = await getUserAcca(accumulatorId, walletAddress);

  if (!userAcca) {
    return errorResponse(404, 'Accumulator not found');
  }

  // Can only cancel PENDING or ACTIVE user accas
  if (!['PENDING', 'ACTIVE'].includes(userAcca.status)) {
    return errorResponse(400, `Cannot cancel accumulator with status: ${userAcca.status}`);
  }

  // Update user acca status
  await updateUserAccaStatus(accumulatorId, walletAddress, 'CANCELLED');

  // Cancel all pending/queued bets
  const bets = await getPositionBets(accumulatorId, walletAddress);
  for (const bet of bets) {
    if (['QUEUED', 'READY'].includes(bet.status)) {
      await updateBetStatus(accumulatorId, walletAddress, bet.sequence, 'CANCELLED');
    }
  }

  return successResponse({ message: 'Accumulator cancelled successfully' });
}
