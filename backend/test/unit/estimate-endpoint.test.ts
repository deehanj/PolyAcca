import { estimateChain } from '../../lambdas/api/chains/estimate';

jest.mock('../../lambdas/shared/gamma-client', () => ({
  fetchMarketByConditionId: jest.fn().mockResolvedValue({
    liquidityNum: 10000,
    yesPrice: 0.42,
    noPrice: 0.58,
  }),
}));

jest.mock('../../lambdas/shared/orderbook-client', () => ({
  fetchOrderbook: jest.fn().mockResolvedValue({
    asks: [{ price: '0.42', size: '1000' }],
    bids: [{ price: '0.40', size: '1000' }],
    midPrice: '0.41',
    spread: '0.02',
    timestamp: new Date().toISOString(),
  }),
  calculatePriceImpact: jest.fn().mockReturnValue({
    estimatedFillPrice: '0.425',
    fillableAmount: '100.00',
    priceImpact: '0.0119',
    insufficientLiquidity: false,
  }),
  exceedsLiquidityThreshold: jest.fn().mockReturnValue(false),
}));

describe('POST /chains/estimate', () => {
  it('should return checkout estimate', async () => {
    const body = JSON.stringify({
      legs: [{
        conditionId: 'cond-1',
        tokenId: 'token-1',
        side: 'YES',
        targetPrice: '0.42',
      }],
      initialStake: '100',
      maxSlippage: '0.025',
    });

    const result = await estimateChain(body);

    expect(result.statusCode).toBe(200);
    const data = JSON.parse(result.body);
    expect(data.success).toBe(true);
    expect(data.data.legs).toHaveLength(1);
    expect(data.data.totalEstimatedCost).toBeDefined();
  });

  it('should return 400 for missing body', async () => {
    const result = await estimateChain(null);

    expect(result.statusCode).toBe(400);
    const data = JSON.parse(result.body);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Request body required');
  });

  it('should return 400 for invalid JSON', async () => {
    const result = await estimateChain('not valid json');

    expect(result.statusCode).toBe(400);
    const data = JSON.parse(result.body);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid JSON');
  });

  it('should return 400 for missing required fields', async () => {
    const result = await estimateChain(JSON.stringify({ legs: [] }));

    expect(result.statusCode).toBe(400);
    const data = JSON.parse(result.body);
    expect(data.success).toBe(false);
    expect(data.error).toBe('legs and initialStake required');
  });

  it('should fetch orderbook when stake exceeds liquidity threshold', async () => {
    const { exceedsLiquidityThreshold, fetchOrderbook, calculatePriceImpact } = require('../../lambdas/shared/orderbook-client');
    exceedsLiquidityThreshold.mockReturnValue(true);

    const body = JSON.stringify({
      legs: [{
        conditionId: 'cond-1',
        tokenId: 'token-1',
        side: 'YES',
        targetPrice: '0.42',
      }],
      initialStake: '1000',
      maxSlippage: '0.025',
    });

    const result = await estimateChain(body);

    expect(result.statusCode).toBe(200);
    expect(fetchOrderbook).toHaveBeenCalledWith('token-1');
    expect(calculatePriceImpact).toHaveBeenCalled();
  });
});
