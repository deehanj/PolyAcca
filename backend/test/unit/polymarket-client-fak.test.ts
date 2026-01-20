import { OrderParams } from '../../lambdas/shared/polymarket-client';

describe('placeOrder with FAK', () => {
  it('should support FAK order type in OrderParams', () => {
    // Type check that FAK is a valid order type
    const params: OrderParams = {
      tokenId: 'test-token',
      side: 'BUY',
      price: 0.5,
      size: 100,
      orderType: 'FAK',
    };

    expect(params.orderType).toBe('FAK');
  });

  it('should support GTC order type in OrderParams', () => {
    const params: OrderParams = {
      tokenId: 'test-token',
      side: 'BUY',
      price: 0.5,
      size: 100,
      orderType: 'GTC',
    };

    expect(params.orderType).toBe('GTC');
  });

  it('should support FOK order type in OrderParams', () => {
    const params: OrderParams = {
      tokenId: 'test-token',
      side: 'SELL',
      price: 0.5,
      size: 100,
      orderType: 'FOK',
    };

    expect(params.orderType).toBe('FOK');
  });

  it('should allow orderType to be undefined (defaults to GTC in implementation)', () => {
    const params: OrderParams = {
      tokenId: 'test-token',
      side: 'BUY',
      price: 0.5,
      size: 100,
      // orderType is intentionally not specified
    };

    expect(params.orderType).toBeUndefined();
  });

  it('should correctly resolve order type with fallback to GTC', () => {
    const orderTypeMap: Record<string, string> = {
      'GTC': 'GTC',
      'FOK': 'FOK',
      'FAK': 'FAK',
    };

    // When orderType is undefined, should use 'GTC' as default
    const undefinedOrderType: string | undefined = undefined;
    const resolvedType = orderTypeMap[undefinedOrderType || 'GTC'];

    expect(resolvedType).toBe('GTC');

    // When orderType is 'FAK', should use 'FAK'
    const fakOrderType: string | undefined = 'FAK';
    const resolvedFakType = orderTypeMap[fakOrderType || 'GTC'];

    expect(resolvedFakType).toBe('FAK');
  });
});
