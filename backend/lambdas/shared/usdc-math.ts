/**
 * USDC Math Utilities
 *
 * Provides precise arithmetic for USDC calculations using bigint
 * to avoid floating point precision issues.
 *
 * USDC has 6 decimal places, so we work in "micro-USDC" (1 USDC = 1,000,000 micro-USDC)
 */

// USDC has 6 decimal places
export const USDC_DECIMALS = 6;
export const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS); // 1000000n

/**
 * Convert a USDC amount string to micro-USDC (bigint) for precise arithmetic
 *
 * @param amount - USDC amount as string (e.g., "150.00", "10.5", "100")
 * @returns Amount in micro-USDC as bigint
 *
 * @example
 * toMicroUsdc("150.00") // 150000000n
 * toMicroUsdc("10.5")   // 10500000n
 * toMicroUsdc("100")    // 100000000n
 */
export function toMicroUsdc(amount: string): bigint {
  // Handle empty or invalid input
  if (!amount || amount.trim() === '') {
    return 0n;
  }

  // Parse the string to handle decimal places correctly
  const [whole, decimal = ''] = amount.split('.');

  // Pad or truncate decimal to 6 places
  const paddedDecimal = decimal.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);

  // Combine and convert to bigint
  const combined = whole + paddedDecimal;

  // Handle negative numbers
  if (combined.startsWith('-')) {
    return -BigInt(combined.slice(1));
  }

  return BigInt(combined);
}

/**
 * Convert micro-USDC (bigint) back to a USDC amount string
 *
 * @param microAmount - Amount in micro-USDC as bigint
 * @param decimalPlaces - Number of decimal places to return (default: 2)
 * @returns USDC amount as string
 *
 * @example
 * fromMicroUsdc(150000000n)    // "150.00"
 * fromMicroUsdc(2800000n)      // "2.80"
 * fromMicroUsdc(123456n)       // "0.12"
 * fromMicroUsdc(123456n, 6)    // "0.123456"
 */
export function fromMicroUsdc(microAmount: bigint, decimalPlaces: number = 2): string {
  const isNegative = microAmount < 0n;
  const absAmount = isNegative ? -microAmount : microAmount;

  const str = absAmount.toString().padStart(USDC_DECIMALS + 1, '0');
  const whole = str.slice(0, -USDC_DECIMALS) || '0';
  const decimal = str.slice(-USDC_DECIMALS);

  // Truncate or pad decimal places as needed
  const truncatedDecimal = decimal.slice(0, decimalPlaces).padEnd(decimalPlaces, '0');

  const result = `${whole}.${truncatedDecimal}`;
  return isNegative ? `-${result}` : result;
}

/**
 * Multiply a micro-USDC amount by a price (0-1 range)
 * Used for calculating: shares = stake / price, or payout = shares * price
 *
 * Price is represented as a bigint with 6 decimal places (same as USDC)
 * e.g., 0.65 price = 650000n
 *
 * @param microAmount - Amount in micro-USDC
 * @param priceMicro - Price as micro (e.g., 650000n for 0.65)
 * @returns Result in micro-USDC
 */
export function multiplyByPrice(microAmount: bigint, priceMicro: bigint): bigint {
  // (amount * price) / SCALE to keep proper decimal places
  return (microAmount * priceMicro) / USDC_SCALE;
}

/**
 * Divide a micro-USDC amount by a price (0-1 range)
 * Used for calculating: shares = stake / price
 *
 * @param microAmount - Amount in micro-USDC
 * @param priceMicro - Price as micro (e.g., 650000n for 0.65)
 * @returns Result in micro-USDC
 */
export function divideByPrice(microAmount: bigint, priceMicro: bigint): bigint {
  if (priceMicro === 0n) {
    throw new Error('Division by zero: price cannot be 0');
  }
  // (amount * SCALE) / price to keep proper decimal places
  return (microAmount * USDC_SCALE) / priceMicro;
}

/**
 * Convert a price string (0-1 range) to micro format
 *
 * @param price - Price as string (e.g., "0.65", "0.5")
 * @returns Price in micro format as bigint
 *
 * @example
 * priceToMicro("0.65") // 650000n
 * priceToMicro("0.5")  // 500000n
 * priceToMicro("1")    // 1000000n
 */
export function priceToMicro(price: string): bigint {
  return toMicroUsdc(price);
}

/**
 * Calculate shares from stake and price
 * shares = stake / price
 *
 * In prediction markets, if you bet $10 at 0.65 odds, you get ~15.38 shares
 * Each share pays $1 if you win
 *
 * @param stakeMicro - Stake amount in micro-USDC
 * @param priceMicro - Price in micro format
 * @returns Number of shares in micro format
 */
export function calculateShares(stakeMicro: bigint, priceMicro: bigint): bigint {
  return divideByPrice(stakeMicro, priceMicro);
}

/**
 * Calculate payout from shares (each share = $1 if win)
 * This is effectively the same as the number of shares
 *
 * @param sharesMicro - Number of shares in micro format
 * @returns Payout in micro-USDC
 */
export function calculatePayout(sharesMicro: bigint): bigint {
  return sharesMicro;
}

/**
 * Calculate potential payout from stake and price
 * Combines calculateShares and calculatePayout
 *
 * @param stakeMicro - Stake amount in micro-USDC
 * @param priceMicro - Price in micro format
 * @returns Potential payout in micro-USDC
 */
export function calculatePotentialPayout(stakeMicro: bigint, priceMicro: bigint): bigint {
  const shares = calculateShares(stakeMicro, priceMicro);
  return calculatePayout(shares);
}

/**
 * Calculate percentage of an amount
 *
 * @param microAmount - Amount in micro-USDC
 * @param numerator - Percentage numerator (e.g., 2 for 2%)
 * @param denominator - Percentage denominator (e.g., 100)
 * @returns Result in micro-USDC (rounds down)
 *
 * @example
 * calculatePercentage(140000000n, 2n, 100n) // 2800000n (2% of $140)
 */
export function calculatePercentage(
  microAmount: bigint,
  numerator: bigint,
  denominator: bigint
): bigint {
  return (microAmount * numerator) / denominator;
}

/**
 * Add two micro-USDC amounts
 */
export function addMicro(a: bigint, b: bigint): bigint {
  return a + b;
}

/**
 * Subtract two micro-USDC amounts
 */
export function subtractMicro(a: bigint, b: bigint): bigint {
  return a - b;
}

/**
 * Compare two micro-USDC amounts
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareMicro(a: bigint, b: bigint): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Check if amount is greater than zero
 */
export function isPositive(microAmount: bigint): boolean {
  return microAmount > 0n;
}

/**
 * Get the minimum of two micro amounts
 */
export function minMicro(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/**
 * Get the maximum of two micro amounts
 */
export function maxMicro(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
