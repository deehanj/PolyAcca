# Slippage & Price Impact Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to understand and control price impact when placing chain bets, with partial fill support via FAK orders.

**Architecture:** Add orderbook fetching endpoint, estimate endpoint for checkout preview, modify bet-executor to use FAK orders, and track partial fills cascading through chain legs.

**Tech Stack:** TypeScript, AWS Lambda, DynamoDB, Polymarket CLOB API, Jest

---

## Task 1: Add Orderbook Types

**Files:**
- Modify: `lambdas/shared/types.ts`

**Step 1: Write the type definitions**

Add to `types.ts`:

```typescript
// Orderbook types for price impact calculation
export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  midPrice: string;
  spread: string;
  timestamp: string;
}

export interface CheckoutLegEstimate {
  conditionId: string;
  displayedPrice: string;
  estimatedFillPrice: string;
  estimatedImpact: string;
  liquidityDepth: string;
  requiresOrderbookFetch: boolean;
}

export interface CheckoutEstimate {
  legs: CheckoutLegEstimate[];
  totalEstimatedCost: string;
  totalImpactPercent: string;
  warnings: string[];
}
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lambdas/shared/types.ts
git commit -m "feat: add orderbook and checkout estimate types"
```

---

## Task 2: Add BetEntity Fields for Slippage

**Files:**
- Modify: `lambdas/shared/types.ts`

**Step 1: Add new fields to BetEntity**

Find `BetEntity` interface and add:

```typescript
export interface BetEntity extends BaseEntity {
  // ... existing fields ...

  // NEW: Slippage fields
  maxPrice?: string;           // targetPrice * (1 + slippage)
  maxSlippage?: string;        // User's slippage setting (e.g., "0.025")
  requestedStake?: string;     // What user intended to bet
  actualStake?: string;        // What actually filled (may be less)
  fillPercentage?: string;     // e.g., "0.85" for 85%
  priceImpact?: string;        // Actual vs target price difference
}
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lambdas/shared/types.ts
git commit -m "feat: add slippage fields to BetEntity"
```

---

## Task 3: Add UserChainEntity Fields

**Files:**
- Modify: `lambdas/shared/types.ts`

**Step 1: Add new fields to UserChainEntity**

Find `UserChainEntity` interface and add:

```typescript
export interface UserChainEntity extends BaseEntity {
  // ... existing fields ...

  // NEW: Slippage tracking
  actualInitialStake?: string;  // What first leg actually filled
  totalPriceImpact?: string;    // Sum of impact across all legs
  maxSlippage?: string;         // User's chain-wide setting
}
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lambdas/shared/types.ts
git commit -m "feat: add slippage tracking to UserChainEntity"
```

---

## Task 4: Add UNFILLED and MARKET_CLOSING_SOON Bet Statuses

**Files:**
- Modify: `lambdas/shared/types.ts`

**Step 1: Update BetStatus type**

Find and update `BetStatus`:

```typescript
export type BetStatus =
  | 'QUEUED'
  | 'READY'
  | 'EXECUTING'
  | 'PLACED'              // Keep for backwards compat, but won't be used for new bets
  | 'FILLED'
  | 'UNFILLED'            // NEW: FAK got zero fills
  | 'SETTLED'
  | 'VOIDED'
  | 'MARKET_CLOSED'
  | 'MARKET_CLOSING_SOON' // NEW: <24h to resolution
  // ... existing failure statuses
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lambdas/shared/types.ts
git commit -m "feat: add UNFILLED and MARKET_CLOSING_SOON bet statuses"
```

---

## Task 5: Create Orderbook Client

**Files:**
- Create: `lambdas/shared/orderbook-client.ts`
- Create: `test/unit/orderbook-client.test.ts`

**Step 1: Write the failing test**

Create `test/unit/orderbook-client.test.ts`:

```typescript
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
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="orderbook-client" -v`
Expected: FAIL with "Cannot find module"

**Step 3: Write the implementation**

Create `lambdas/shared/orderbook-client.ts`:

```typescript
/**
 * Orderbook client for fetching CLOB orderbook data
 * and calculating price impact
 */

import { ClobClient } from '@polymarket/clob-client';
import type { OrderbookLevel, OrderbookData } from './types';
import { createLogger } from './logger';
import { toMicroUsdc, fromMicroUsdc } from './usdc-math';

const logger = createLogger('orderbook-client');

const POLYMARKET_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

export interface PriceImpactResult {
  estimatedFillPrice: string;
  fillableAmount: string;
  priceImpact: string;        // Percentage as decimal (0.025 = 2.5%)
  insufficientLiquidity: boolean;
}

/**
 * Fetch orderbook for a token from Polymarket CLOB
 */
export async function fetchOrderbook(tokenId: string): Promise<OrderbookData> {
  const client = new ClobClient(POLYMARKET_HOST, POLYGON_CHAIN_ID);

  logger.info('Fetching orderbook', { tokenId });

  try {
    const book = await client.getOrderBook(tokenId);

    const bids: OrderbookLevel[] = (book.bids || []).map((b: any) => ({
      price: String(b.price),
      size: String(b.size),
    }));

    const asks: OrderbookLevel[] = (book.asks || []).map((a: any) => ({
      price: String(a.price),
      size: String(a.size),
    }));

    const bestBid = bids[0]?.price || '0';
    const bestAsk = asks[0]?.price || '1';
    const midPrice = ((parseFloat(bestBid) + parseFloat(bestAsk)) / 2).toFixed(4);
    const spread = (parseFloat(bestAsk) - parseFloat(bestBid)).toFixed(4);

    return {
      bids,
      asks,
      midPrice,
      spread,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.errorWithStack('Failed to fetch orderbook', error, { tokenId });
    throw error;
  }
}

/**
 * Calculate price impact for a given order size
 *
 * @param levels - Ask levels for buys, bid levels for sells
 * @param stakeAmount - Amount in USDC to spend
 * @param targetPrice - The displayed price user saw
 * @returns Price impact calculation result
 */
export function calculatePriceImpact(
  levels: OrderbookLevel[],
  stakeAmount: string,
  targetPrice: string
): PriceImpactResult {
  const stakeMicro = toMicroUsdc(stakeAmount);
  const targetPriceNum = parseFloat(targetPrice);

  let remainingStakeMicro = stakeMicro;
  let totalSharesAcquired = 0n;
  let totalCostMicro = 0n;

  for (const level of levels) {
    if (remainingStakeMicro <= 0n) break;

    const levelPrice = parseFloat(level.price);
    const levelSize = parseFloat(level.size);
    const levelPriceMicro = toMicroUsdc(level.price);

    // How many shares can we buy at this level?
    // shares = stake / price
    const maxSharesAtLevel = BigInt(Math.floor(levelSize * 1_000_000));
    const affordableShares = (remainingStakeMicro * 1_000_000n) / levelPriceMicro;

    const sharesToBuy = affordableShares < maxSharesAtLevel ? affordableShares : maxSharesAtLevel;
    const costMicro = (sharesToBuy * levelPriceMicro) / 1_000_000n;

    totalSharesAcquired += sharesToBuy;
    totalCostMicro += costMicro;
    remainingStakeMicro -= costMicro;
  }

  const filledStakeMicro = stakeMicro - remainingStakeMicro;
  const insufficientLiquidity = remainingStakeMicro > 0n;

  // Calculate average fill price
  let avgFillPrice = targetPriceNum;
  if (totalSharesAcquired > 0n) {
    avgFillPrice = Number(totalCostMicro) / Number(totalSharesAcquired);
  }

  // Price impact as percentage
  const impact = targetPriceNum > 0
    ? (avgFillPrice - targetPriceNum) / targetPriceNum
    : 0;

  return {
    estimatedFillPrice: avgFillPrice.toFixed(4),
    fillableAmount: fromMicroUsdc(filledStakeMicro),
    priceImpact: impact.toFixed(4),
    insufficientLiquidity,
  };
}

/**
 * Check if stake amount exceeds threshold percentage of market liquidity
 */
export function exceedsLiquidityThreshold(
  stakeAmount: string,
  marketLiquidity: number,
  thresholdPercent: number = 0.05
): boolean {
  const stake = parseFloat(stakeAmount);
  return stake > (marketLiquidity * thresholdPercent);
}
```

**Step 4: Run tests**

Run: `npm test -- --testPathPattern="orderbook-client" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lambdas/shared/orderbook-client.ts test/unit/orderbook-client.test.ts
git commit -m "feat: add orderbook client with price impact calculation"
```

---

## Task 6: Create Orderbook API Endpoint

**Files:**
- Create: `lambdas/api/markets/orderbook.ts`
- Modify: `lambdas/api/index.ts` (add route)
- Create: `test/unit/orderbook-endpoint.test.ts`

**Step 1: Write the failing test**

Create `test/unit/orderbook-endpoint.test.ts`:

```typescript
import { getOrderbook } from '../../lambdas/api/markets/orderbook';

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

describe('GET /markets/:conditionId/orderbook', () => {
  it('should return orderbook data', async () => {
    const result = await getOrderbook('test-condition-id', 'test-token-id');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.bids).toBeDefined();
    expect(body.data.asks).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="orderbook-endpoint" -v`
Expected: FAIL with "Cannot find module"

**Step 3: Write the implementation**

Create `lambdas/api/markets/orderbook.ts`:

```typescript
/**
 * GET /markets/:conditionId/orderbook
 *
 * Fetches orderbook depth from Polymarket CLOB
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { fetchOrderbook } from '../../shared/orderbook-client';
import { createLogger } from '../../shared/logger';

const logger = createLogger('orderbook-endpoint');

function successResponse(data: unknown, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, data }),
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: message }),
  };
}

export async function getOrderbook(
  conditionId: string,
  tokenId: string
): Promise<APIGatewayProxyResult> {
  if (!tokenId) {
    return errorResponse(400, 'tokenId query parameter required');
  }

  logger.info('Fetching orderbook', { conditionId, tokenId });

  try {
    const orderbook = await fetchOrderbook(tokenId);
    return successResponse(orderbook);
  } catch (error) {
    logger.errorWithStack('Failed to fetch orderbook', error, { conditionId, tokenId });
    return errorResponse(502, 'Failed to fetch orderbook from CLOB');
  }
}
```

**Step 4: Run tests**

Run: `npm test -- --testPathPattern="orderbook-endpoint" -v`
Expected: PASS

**Step 5: Add route to API handler**

Modify `lambdas/api/index.ts` to add route:

```typescript
// Add import
import { getOrderbook } from './markets/orderbook';

// Add route in handler
if (method === 'GET' && path.match(/^\/markets\/[^/]+\/orderbook$/)) {
  const conditionId = pathParts[2];
  const tokenId = event.queryStringParameters?.tokenId || '';
  return getOrderbook(conditionId, tokenId);
}
```

**Step 6: Commit**

```bash
git add lambdas/api/markets/orderbook.ts lambdas/api/index.ts test/unit/orderbook-endpoint.test.ts
git commit -m "feat: add GET /markets/:conditionId/orderbook endpoint"
```

---

## Task 7: Create Estimate Endpoint

**Files:**
- Create: `lambdas/api/chains/estimate.ts`
- Modify: `lambdas/api/index.ts` (add route)
- Create: `test/unit/estimate-endpoint.test.ts`

**Step 1: Write the failing test**

Create `test/unit/estimate-endpoint.test.ts`:

```typescript
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
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="estimate-endpoint" -v`
Expected: FAIL

**Step 3: Write the implementation**

Create `lambdas/api/chains/estimate.ts`:

```typescript
/**
 * POST /chains/estimate
 *
 * Calculate price impact and fill estimates without placing orders
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { fetchMarketByConditionId } from '../../shared/gamma-client';
import {
  fetchOrderbook,
  calculatePriceImpact,
  exceedsLiquidityThreshold
} from '../../shared/orderbook-client';
import type { CheckoutEstimate, CheckoutLegEstimate } from '../../shared/types';
import { createLogger } from '../../shared/logger';
import { toMicroUsdc, fromMicroUsdc } from '../../shared/usdc-math';

const logger = createLogger('estimate-endpoint');

const LIQUIDITY_THRESHOLD = 0.05; // 5%

interface EstimateRequest {
  legs: {
    conditionId: string;
    tokenId: string;
    side: 'YES' | 'NO';
    targetPrice: string;
  }[];
  initialStake: string;
  maxSlippage: string;
}

function successResponse(data: unknown): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, data }),
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: message }),
  };
}

export async function estimateChain(body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) {
    return errorResponse(400, 'Request body required');
  }

  let request: EstimateRequest;
  try {
    request = JSON.parse(body);
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  if (!request.legs?.length || !request.initialStake) {
    return errorResponse(400, 'legs and initialStake required');
  }

  const slippage = parseFloat(request.maxSlippage || '0.025');
  const warnings: string[] = [];
  const legEstimates: CheckoutLegEstimate[] = [];

  let currentStakeMicro = toMicroUsdc(request.initialStake);
  let totalImpactMicro = 0n;

  for (const leg of request.legs) {
    try {
      // Get market liquidity from Gamma
      const market = await fetchMarketByConditionId(leg.conditionId);
      const liquidity = market?.liquidityNum || 0;

      const currentStake = fromMicroUsdc(currentStakeMicro);
      const needsOrderbook = exceedsLiquidityThreshold(currentStake, liquidity, LIQUIDITY_THRESHOLD);

      let estimatedFillPrice = leg.targetPrice;
      let impact = '0';
      let fillableAmount = currentStake;

      if (needsOrderbook) {
        // Fetch real orderbook for accurate estimate
        const orderbook = await fetchOrderbook(leg.tokenId);
        const levels = leg.side === 'YES' ? orderbook.asks : orderbook.bids;
        const result = calculatePriceImpact(levels, currentStake, leg.targetPrice);

        estimatedFillPrice = result.estimatedFillPrice;
        impact = result.priceImpact;
        fillableAmount = result.fillableAmount;

        if (result.insufficientLiquidity) {
          warnings.push(`Leg ${leg.conditionId}: Only ${fillableAmount} of ${currentStake} fillable`);
        }
      }

      // Calculate impact in micro USDC
      const impactAmount = currentStakeMicro * BigInt(Math.round(parseFloat(impact) * 10000)) / 10000n;
      totalImpactMicro += impactAmount;

      legEstimates.push({
        conditionId: leg.conditionId,
        displayedPrice: leg.targetPrice,
        estimatedFillPrice,
        estimatedImpact: impact,
        liquidityDepth: String(liquidity),
        requiresOrderbookFetch: needsOrderbook,
      });

      // Calculate next leg's stake (shares acquired = fillableAmount / price)
      const fillPriceMicro = toMicroUsdc(estimatedFillPrice);
      const fillableAmountMicro = toMicroUsdc(fillableAmount);
      // shares = stake / price, next stake = shares * $1
      currentStakeMicro = (fillableAmountMicro * 1_000_000n) / fillPriceMicro;

    } catch (error) {
      logger.errorWithStack('Error estimating leg', error, { conditionId: leg.conditionId });
      // Use displayed price as fallback
      legEstimates.push({
        conditionId: leg.conditionId,
        displayedPrice: leg.targetPrice,
        estimatedFillPrice: leg.targetPrice,
        estimatedImpact: '0',
        liquidityDepth: '0',
        requiresOrderbookFetch: false,
      });
    }
  }

  const initialStakeMicro = toMicroUsdc(request.initialStake);
  const totalCostMicro = initialStakeMicro + totalImpactMicro;
  const impactPercent = Number(totalImpactMicro * 10000n / initialStakeMicro) / 100;

  const estimate: CheckoutEstimate = {
    legs: legEstimates,
    totalEstimatedCost: fromMicroUsdc(totalCostMicro),
    totalImpactPercent: impactPercent.toFixed(2),
    warnings,
  };

  return successResponse(estimate);
}
```

**Step 4: Run tests**

Run: `npm test -- --testPathPattern="estimate-endpoint" -v`
Expected: PASS

**Step 5: Add route to API handler**

Add to `lambdas/api/index.ts`:

```typescript
import { estimateChain } from './chains/estimate';

// Add route
if (method === 'POST' && path === '/chains/estimate') {
  return estimateChain(event.body);
}
```

**Step 6: Commit**

```bash
git add lambdas/api/chains/estimate.ts lambdas/api/index.ts test/unit/estimate-endpoint.test.ts
git commit -m "feat: add POST /chains/estimate endpoint for price impact preview"
```

---

## Task 8: Update POST /chains to Accept maxSlippage

**Files:**
- Modify: `lambdas/api/chains/post.ts`
- Create: `test/unit/chains-post-slippage.test.ts`

**Step 1: Write the failing test**

Create `test/unit/chains-post-slippage.test.ts`:

```typescript
describe('POST /chains with slippage', () => {
  it('should store maxSlippage on bets', async () => {
    // Test that maxSlippage is passed through and stored
    // This test verifies the request parsing and bet creation
  });

  it('should calculate maxPrice from targetPrice and slippage', async () => {
    // targetPrice 0.40 with 2.5% slippage = maxPrice 0.41
    const targetPrice = 0.40;
    const slippage = 0.025;
    const expectedMaxPrice = targetPrice * (1 + slippage);

    expect(expectedMaxPrice).toBeCloseTo(0.41, 4);
  });

  it('should default slippage to 0.025 if not provided', async () => {
    // Verify default behavior
  });
});
```

**Step 2: Modify CreatePositionRequest type**

In `lambdas/api/chains/post.ts`, update the request type:

```typescript
interface CreatePositionRequest {
  legs: CreateLegInput[];
  initialStake: string;
  maxSlippage?: string;  // NEW: defaults to "0.025"
}
```

**Step 3: Update bet creation to include slippage fields**

In the bet creation loop:

```typescript
const maxSlippage = request.maxSlippage || '0.025';
const slippageMultiplier = 1 + parseFloat(maxSlippage);

// In bet creation:
const bet: BetEntity = {
  // ... existing fields ...
  maxPrice: (parseFloat(legInput.targetPrice) * slippageMultiplier).toFixed(4),
  maxSlippage,
  requestedStake: fromMicroUsdc(currentStakeMicro),
};
```

**Step 4: Run tests**

Run: `npm test -- --testPathPattern="chains-post-slippage" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lambdas/api/chains/post.ts test/unit/chains-post-slippage.test.ts
git commit -m "feat: accept maxSlippage in POST /chains and store on bets"
```

---

## Task 9: Update Polymarket Client for FAK Orders

**Files:**
- Modify: `lambdas/shared/polymarket-client.ts`
- Create: `test/unit/polymarket-client-fak.test.ts`

**Step 1: Write the failing test**

```typescript
describe('placeOrder with FAK', () => {
  it('should place FAK order when orderType specified', async () => {
    // Test that FAK order type is passed to CLOB
  });
});
```

**Step 2: Update OrderParams interface**

```typescript
export interface OrderParams {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  tickSize?: TickSize;
  orderType?: 'GTC' | 'FOK' | 'FAK';  // NEW: default GTC
}
```

**Step 3: Update placeOrder function**

```typescript
export async function placeOrder(
  signer: Signer,
  credentials: Pick<PolymarketCredentials, 'apiKey' | 'apiSecret' | 'passphrase'>,
  params: OrderParams
): Promise<string> {
  const client = createClientWithSigner(signer, credentials, PolymarketSignatureType.EOA);

  // Map order type
  const orderTypeMap = {
    'GTC': OrderType.GTC,
    'FOK': OrderType.FOK,
    'FAK': OrderType.FAK,
  };
  const orderType = orderTypeMap[params.orderType || 'GTC'];

  const order = await client.createAndPostOrder(
    {
      tokenID: params.tokenId,
      price: params.price,
      side: params.side === 'BUY' ? Side.BUY : Side.SELL,
      size: params.size,
    },
    { tickSize: params.tickSize ?? '0.01' },
    orderType  // Use specified order type
  );

  // ... rest of function
}
```

**Step 4: Commit**

```bash
git add lambdas/shared/polymarket-client.ts test/unit/polymarket-client-fak.test.ts
git commit -m "feat: support FAK order type in polymarket client"
```

---

## Task 10: Update Bet Executor for FAK Orders and Partial Fills

**Files:**
- Modify: `lambdas/streams/bet-executor/index.ts`
- Create: `test/integration/bet-executor-fak.test.ts`

**Step 1: Write the failing test**

```typescript
describe('bet-executor FAK orders', () => {
  it('should place FAK order at maxPrice', async () => {
    // Verify FAK order placed with maxPrice from bet
  });

  it('should mark bet UNFILLED when FAK fills nothing', async () => {
    // Verify UNFILLED status set correctly
  });

  it('should track partial fill details', async () => {
    // Verify actualStake, fillPercentage, priceImpact stored
  });

  it('should cascade actualStake to next leg', async () => {
    // Verify next leg uses actual fill amount, not requested
  });
});
```

**Step 2: Update executeBetWithEmbeddedWallet**

Key changes:
1. Use `maxPrice` instead of `targetPrice` for order
2. Use `FAK` order type
3. Store fill details (actualStake, fillPercentage, priceImpact)
4. Handle zero fills with UNFILLED status

```typescript
// Use maxPrice for FAK order
const orderPrice = parseFloat(bet.maxPrice || bet.targetPrice);

// Place FAK order
const orderId = await placeOrder(signer, credentials, {
  tokenId: bet.tokenId,
  side: 'BUY',
  price: orderPrice,
  size,
  orderType: 'FAK',  // Fill-and-kill
});

// Check fill immediately (FAK is instant)
const status = await fetchOrderStatus(credentials, orderId);

if (!status.filled && (!status.filledSize || status.filledSize === '0')) {
  // FAK got nothing - insufficient liquidity
  return {
    orderId,
    filled: false,
    filledSize: '0',
    unfilled: true
  };
}

// Calculate fill details
const requestedStake = bet.requestedStake || bet.stake;
const actualStake = status.filledSize
  ? (parseFloat(status.filledSize) * parseFloat(status.fillPrice || bet.targetPrice)).toFixed(2)
  : requestedStake;
const fillPercentage = (parseFloat(actualStake) / parseFloat(requestedStake)).toFixed(4);
const priceImpact = status.fillPrice
  ? ((parseFloat(status.fillPrice) - parseFloat(bet.targetPrice)) / parseFloat(bet.targetPrice)).toFixed(4)
  : '0';

return {
  orderId,
  filled: true,
  fillPrice: status.fillPrice,
  sharesAcquired: status.filledSize,
  actualStake,
  fillPercentage,
  priceImpact,
};
```

**Step 3: Update bet status handling**

```typescript
if (fillDetails.unfilled) {
  await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'UNFILLED');
  await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
    completedLegs: bet.sequence - 1,
    reason: 'Insufficient liquidity - order could not fill',
  });
  return;
}

// Store fill details
await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'FILLED', {
  orderId: fillDetails.orderId,
  fillPrice: fillDetails.fillPrice,
  sharesAcquired: fillDetails.sharesAcquired,
  actualStake: fillDetails.actualStake,
  fillPercentage: fillDetails.fillPercentage,
  priceImpact: fillDetails.priceImpact,
});
```

**Step 4: Add 24-hour market timeout check**

```typescript
// Add before executing bet
const market = await fetchMarketByConditionId(bet.conditionId);
const hoursToEnd = (new Date(market.endDate).getTime() - Date.now()) / (1000 * 60 * 60);

if (hoursToEnd < 24) {
  logger.warn('Market closing within 24h, cannot place bet', {
    betId: bet.betId,
    conditionId: bet.conditionId,
    hoursToEnd,
  });
  await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'MARKET_CLOSING_SOON');
  await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
    completedLegs: bet.sequence - 1,
    reason: 'Market resolving within 24h - insufficient time to execute',
  });
  return;
}
```

**Step 5: Commit**

```bash
git add lambdas/streams/bet-executor/index.ts test/integration/bet-executor-fak.test.ts
git commit -m "feat: update bet-executor for FAK orders with partial fill tracking"
```

---

## Task 11: Update dynamo-client for New Fields

**Files:**
- Modify: `lambdas/shared/dynamo-client.ts`

**Step 1: Update updateBetStatus to handle new fields**

Add new fields to the update expression builder:

```typescript
// In updateBetStatus function, add to field list:
const betFields = [
  'orderId', 'executedAt', 'fillPrice', 'sharesAcquired', 'fillBlockNumber',
  'actualPayout', 'outcome', 'settledAt',
  // NEW slippage fields:
  'actualStake', 'fillPercentage', 'priceImpact',
];
```

**Step 2: Commit**

```bash
git add lambdas/shared/dynamo-client.ts
git commit -m "feat: add slippage fields to dynamo-client update functions"
```

---

## Task 12: Integration Test for Full Flow

**Files:**
- Create: `test/integration/slippage-flow.test.ts`

**Step 1: Write comprehensive integration test**

```typescript
describe('Slippage and Price Impact Flow', () => {
  describe('Estimate endpoint', () => {
    it('should calculate price impact using Gamma liquidity', async () => {
      // Test estimate with low stake (uses Gamma)
    });

    it('should fetch real orderbook for large stakes', async () => {
      // Test estimate with high stake (>5% liquidity)
    });
  });

  describe('Chain creation with slippage', () => {
    it('should store maxSlippage and maxPrice on bets', async () => {
      // Verify POST /chains stores slippage fields
    });
  });

  describe('Bet execution with FAK', () => {
    it('should track partial fill and cascade to next leg', async () => {
      // Verify partial fill tracking
    });

    it('should fail chain when FAK gets zero fills', async () => {
      // Verify UNFILLED status
    });

    it('should reject bets on markets closing within 24h', async () => {
      // Verify MARKET_CLOSING_SOON status
    });
  });
});
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add test/integration/slippage-flow.test.ts
git commit -m "test: add integration tests for slippage and price impact flow"
```

---

## Task 13: Update Design Doc with Implementation Notes

**Files:**
- Modify: `docs/plans/2026-01-19-slippage-price-impact-design.md`

**Step 1: Add implementation notes section**

Add at the end of design doc:

```markdown
## Implementation Notes

**Completed:** 2026-01-XX

**Key Decisions Made During Implementation:**
- [Note any deviations from design]

**Known Limitations:**
- Orderbook fetch adds ~200-500ms latency for large orders
- FAK orders may partially fill even below slippage threshold if book is thin

**Future Improvements:**
- WebSocket for real-time orderbook updates
- Historical price impact analytics
```

**Step 2: Commit**

```bash
git add docs/plans/2026-01-19-slippage-price-impact-design.md
git commit -m "docs: update design doc with implementation notes"
```

---

## Summary

**Total Tasks:** 13
**Estimated Time:** 2-4 hours

**Testing Strategy:**
- Unit tests for each new module
- Integration tests for full flow
- All existing tests must continue passing

**Rollback Plan:**
- All changes behind new code paths
- Existing GTC orders still work (bet-executor checks for maxPrice)
- Feature can be disabled by not sending maxSlippage in requests
