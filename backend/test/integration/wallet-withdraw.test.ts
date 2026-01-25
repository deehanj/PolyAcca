/**
 * Tests for wallet withdraw flow
 */

const mockGetNonce = jest.fn();
const mockDeleteNonce = jest.fn();
const mockGetUser = jest.fn();
const mockTransferUsdcWithPlatformGas = jest.fn();

jest.mock('../../lambdas/shared/dynamo-client', () => ({
  getNonce: mockGetNonce,
  deleteNonce: mockDeleteNonce,
  getUser: mockGetUser,
}));

jest.mock('../../lambdas/shared/usdc-permit', () => ({
  transferUsdcWithPlatformGas: mockTransferUsdcWithPlatformGas,
}));

import { handler } from '../../lambdas/api/wallet/index';
import { buildWithdrawMessage } from '../../lambdas/shared/auth-utils';
import { Wallet } from 'ethers';

describe('wallet withdraw', () => {
  const signer = new Wallet(
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a4b3b8e9e3af8b42c9b'
  );
  const walletAddress = signer.address;
  const embeddedWalletAddress = '0x3333333333333333333333333333333333333333';
  const safeWalletAddress = '0x2222222222222222222222222222222222222222';
  let signature = '';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetNonce.mockResolvedValue({ nonce: 'nonce-123' });
    mockDeleteNonce.mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({
      walletAddress,
      embeddedWalletAddress,
      polymarketSafeAddress: safeWalletAddress,
    });
    signature = await signer.signMessage(
      buildWithdrawMessage('1.00', 'nonce-123')
    );
    mockTransferUsdcWithPlatformGas.mockResolvedValue({
      success: true,
      txHash: '0xtxhash',
    });
  });

  test('uses embedded wallet as permit owner for withdrawals', async () => {
    const event = {
      httpMethod: 'POST',
      path: '/wallet/withdraw',
      body: JSON.stringify({
        walletAddress,
        amount: '1.00',
        signature,
      }),
    };

    const response = await handler(event as any);

    expect(mockGetNonce).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(mockTransferUsdcWithPlatformGas).toHaveBeenCalledWith(
      embeddedWalletAddress,
      walletAddress,
      '1.00'
    );
  });
});
