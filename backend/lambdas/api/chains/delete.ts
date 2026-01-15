/**
 * DELETE handler for user chains
 *
 * - DELETE /chains/{id} - Cancel user chain
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  getUserChain,
  updateUserChainStatus,
  getPositionBets,
  updateBetStatus,
} from '../../shared/dynamo-client';
import { errorResponse, successResponse } from './utils';

/**
 * DELETE /chains/{id} - Cancel user chain
 */
export async function cancelUserChain(
  walletAddress: string,
  chainId: string
): Promise<APIGatewayProxyResult> {
  const userChain = await getUserChain(chainId, walletAddress);

  if (!userChain) {
    return errorResponse(404, 'Chain not found');
  }

  // Can only cancel PENDING or ACTIVE user chains
  if (!['PENDING', 'ACTIVE'].includes(userChain.status)) {
    return errorResponse(400, `Cannot cancel chain with status: ${userChain.status}`);
  }

  // Update user chain status
  await updateUserChainStatus(chainId, walletAddress, 'CANCELLED');

  // Cancel all pending/queued bets
  const bets = await getPositionBets(chainId, walletAddress);
  for (const bet of bets) {
    if (['QUEUED', 'READY'].includes(bet.status)) {
      await updateBetStatus(chainId, walletAddress, bet.sequence, 'CANCELLED');
    }
  }

  return successResponse({ message: 'Chain cancelled successfully' });
}
