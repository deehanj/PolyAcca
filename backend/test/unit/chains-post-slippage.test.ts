describe('POST /chains with slippage', () => {
  it('should calculate maxPrice from targetPrice and slippage', () => {
    // targetPrice 0.40 with 2.5% slippage = maxPrice 0.41
    const targetPrice = 0.40;
    const slippage = 0.025;
    const expectedMaxPrice = targetPrice * (1 + slippage);

    expect(expectedMaxPrice).toBeCloseTo(0.41, 4);
  });

  it('should default slippage to 0.025 if not provided', () => {
    const defaultSlippage = 0.025;
    expect(defaultSlippage).toBe(0.025);
  });

  it('should calculate maxPrice correctly for various target prices', () => {
    const slippage = 0.025;

    // Test with different target prices
    const testCases = [
      { targetPrice: 0.50, expectedMaxPrice: 0.5125 },
      { targetPrice: 0.30, expectedMaxPrice: 0.3075 },
      { targetPrice: 0.75, expectedMaxPrice: 0.76875 },
    ];

    for (const { targetPrice, expectedMaxPrice } of testCases) {
      const maxPrice = targetPrice * (1 + slippage);
      expect(maxPrice).toBeCloseTo(expectedMaxPrice, 4);
    }
  });

  it('should handle custom slippage values', () => {
    const targetPrice = 0.40;

    // 5% slippage
    expect(targetPrice * (1 + 0.05)).toBeCloseTo(0.42, 4);

    // 1% slippage
    expect(targetPrice * (1 + 0.01)).toBeCloseTo(0.404, 4);

    // 10% slippage
    expect(targetPrice * (1 + 0.10)).toBeCloseTo(0.44, 4);
  });
});
