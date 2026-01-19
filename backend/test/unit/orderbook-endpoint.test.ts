import { getOrderbook } from '../../lambdas/api/markets/orderbook';
import { fetchOrderbook } from '../../lambdas/shared/orderbook-client';

// Mock the orderbook client
jest.mock('../../lambdas/shared/orderbook-client', () => ({
  fetchOrderbook: jest.fn().mockResolvedValue({
    bids: [{ price: '0.40', size: '500' }],
    asks: [{ price: '0.42', size: '500' }],
    midPrice: '0.41',
    spread: '0.02',
    timestamp: '2026-01-19T00:00:00Z',
  }),
}));

const mockFetchOrderbook = fetchOrderbook as jest.MockedFunction<typeof fetchOrderbook>;

describe('GET /markets/:conditionId/orderbook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return orderbook data', async () => {
    const result = await getOrderbook('test-condition-id', 'test-token-id');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.bids).toBeDefined();
    expect(body.data.asks).toBeDefined();
  });

  it('should return 400 when tokenId is missing', async () => {
    const result = await getOrderbook('test-condition-id', '');

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('should return 502 when orderbook fetch fails', async () => {
    mockFetchOrderbook.mockRejectedValueOnce(new Error('CLOB error'));

    const result = await getOrderbook('test-condition-id', 'test-token-id');

    expect(result.statusCode).toBe(502);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
  });
});
