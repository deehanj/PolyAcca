import { fetchOrderbook, calculatePriceImpact } from '../../lambdas/shared/orderbook-client';

describe('orderbook-client', () => {
  describe('calculatePriceImpact', () => {
    it('should calculate price impact for buy order', () => {
      const asks = [
        { price: '0.40', size: '500' },
        { price: '0.42', size: '1000' },
        { price: '0.45', size: '2000' },
      ];

      // Buying $100 worth at 0.40 = 250 shares needed
      // 250 shares available at 0.40, so fills entirely at 0.40
      const result = calculatePriceImpact(asks, '100', '0.40');

      expect(result.estimatedFillPrice).toBe('0.4000');
      expect(result.fillableAmount).toBe('100.00');
      expect(result.priceImpact).toBe('0.0000');
    });

    it('should calculate impact when order walks the book', () => {
      const asks = [
        { price: '0.40', size: '100' },  // $40 worth at 0.40
        { price: '0.42', size: '100' },  // $42 worth at 0.42
      ];

      // Buying $80 worth needs to walk the book
      // First 100 shares at 0.40 = $40
      // Next ~95 shares at 0.42 = $40
      const result = calculatePriceImpact(asks, '80', '0.40');

      expect(parseFloat(result.estimatedFillPrice)).toBeGreaterThan(0.40);
      expect(parseFloat(result.priceImpact)).toBeGreaterThan(0);
    });

    it('should handle insufficient liquidity', () => {
      const asks = [
        { price: '0.40', size: '50' },
      ];

      const result = calculatePriceImpact(asks, '100', '0.40');

      expect(parseFloat(result.fillableAmount)).toBeLessThan(100);
      expect(result.insufficientLiquidity).toBe(true);
    });
  });
});
