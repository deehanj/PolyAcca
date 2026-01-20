# Slippage & Price Impact Design

## Overview

Enable users to understand and control price impact when placing chain bets, with partial fill support and transparent execution feedback.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Partial fills | Accepted - stakes cascade forward based on actual fill |
| Price impact display | At checkout only (not during browsing) |
| Orderbook data source | Hybrid: Gamma estimate normally, real CLOB orderbook if stake > 5% of liquidity |
| Default slippage | 2.5% with full user control (custom input) |
| Order type | FAK (Fill-And-Kill) - no lingering GTC orders |
| Unfilled orders | Pure FAK only, no remainder on book |
| Minimum fill | Accept any fill amount, show clear feedback |
| Market timeout | Cancel if <24h before market resolution |
| Status display | Detailed: show fill price, percentage, impact |
| Checkout UI | Summary by default, expandable per-leg breakdown |

## User Flow

### At Checkout

1. **Fetch pricing data** - For each leg, check if stake > 5% of market's `liquidityNum`. If yes, fetch real orderbook from CLOB API. Otherwise, use Gamma price.

2. **Calculate estimated fills** - Using orderbook depth, estimate what price each leg will actually fill at given the stake size.

3. **Show impact summary**:
   ```
   Estimated Total Cost: $102.47
   ├─ Your stake: $100.00
   └─ Price impact: ~$2.47 (2.5%)

   [▼ View leg breakdown]
   ```

4. **Slippage control**:
   ```
   Max slippage: [2.5%] ← editable input
   Orders placed above this will wait on book
   ```

5. **Confirm & place** - User confirms, orders placed as FAK at `maxPrice` (targetPrice × (1 + slippage)). Whatever fills is the final amount.

### After Placement

Show per-leg status:
- "Filled $85 of $100 at 0.434 (+3.4% impact)"
- If partial: "(85% fill - low liquidity)"

## API Changes

### New Endpoint: `GET /markets/:conditionId/orderbook`

Fetches orderbook depth from Polymarket CLOB.

**Response:**
```typescript
{
  bids: [{ price: number, size: number }],
  asks: [{ price: number, size: number }],
  midPrice: number,
  spread: number
}
```

### Changes to `POST /chains`

**New request fields:**
```typescript
{
  legs: CreateLegInput[],
  initialStake: string,
  maxSlippage: string  // NEW: e.g., "0.025" for 2.5%
}
```

**New response fields per bet:**
```typescript
{
  targetPrice: string,        // What user saw
  maxPrice: string,           // targetPrice × (1 + slippage)
  estimatedFillPrice: string, // Based on orderbook
  estimatedImpact: string     // Percentage impact
}
```

### New Endpoint: `POST /chains/estimate`

Pre-checkout pricing estimate without placing orders.

**Request:**
```typescript
{
  legs: CreateLegInput[],
  initialStake: string,
  maxSlippage: string
}
```

**Response:**
```typescript
{
  legs: [{
    conditionId: string,
    displayedPrice: string,
    estimatedFillPrice: string,
    estimatedImpact: string,
    liquidityDepth: string
  }],
  totalEstimatedCost: string,
  totalImpactPercent: string,
  requiresOrderbookFetch: boolean
}
```

## Data Model Changes

### BetEntity Additions

```typescript
{
  // Existing
  targetPrice: string;
  stake: string;

  // NEW
  maxPrice: string;           // targetPrice × (1 + slippage)
  maxSlippage: string;        // User's slippage setting
  requestedStake: string;     // What user intended
  actualStake: string;        // What actually filled
  fillPercentage: string;     // e.g., "0.85" for 85%
  priceImpact: string;        // Actual vs target difference
}
```

### UserChainEntity Additions

```typescript
{
  // Existing
  initialStake: string;

  // NEW
  actualInitialStake: string; // What first leg actually filled
  totalPriceImpact: string;   // Sum across all legs
  maxSlippage: string;        // User's chain-wide setting
}
```

### Bet Status Changes

```typescript
type BetStatus =
  | 'QUEUED'           // Waiting for previous leg
  | 'READY'            // Ready to execute
  | 'EXECUTING'        // Currently placing order
  | 'FILLED'           // FAK completed with fills
  | 'UNFILLED'         // FAK got zero fills (new)
  | 'SETTLED'          // Market resolved
  | 'VOIDED'           // Market voided
  | 'MARKET_CLOSED'    // Market closed before execution
  | 'MARKET_CLOSING_SOON' // <24h to resolution (new)
```

Remove: `PLACED` (no longer needed with pure FAK)

## Execution Flow

### bet-executor Changes

```
1. Bet status → READY
2. Check market still active
3. Check hoursToEnd > 24 (else MARKET_CLOSING_SOON)
4. Calculate actualStake from previous leg's payout
5. Calculate maxPrice = targetPrice × (1 + maxSlippage)
6. Place FAK order at maxPrice
7. Check fill result immediately:
   - filledSize > 0 → FILLED, store actual values
   - filledSize = 0 → UNFILLED, chain → FAILED
8. Cascade: next leg stake = this leg's shares × $1.00
```

### Market Timeout Check

```typescript
const hoursToEnd = (new Date(market.endDate) - Date.now()) / (1000 * 60 * 60);

if (hoursToEnd < 24) {
  await updateBetStatus(bet, 'MARKET_CLOSING_SOON');
  await updateUserChainStatus(chain, 'FAILED', {
    reason: 'Market resolving within 24h'
  });
  return;
}
```

## Frontend Changes

### AccumulatorSidebar

Add before "Place Bet" button:

1. **Price Impact Card** (always visible when stake entered):
   ```
   ⚠️ PRICE IMPACT ESTIMATE
   ┌─────────────────────────────┐
   │ Expected cost:     $103.20 │
   │ Your stake:        $100.00 │
   │ Est. impact:   ~$3.20 (3.2%)│
   │                             │
   │ [▼ View per-leg breakdown] │
   └─────────────────────────────┘
   ```

2. **Slippage Input**:
   ```
   Max slippage: [2.5__]%
   ℹ️ Orders above this won't fill
   ```

3. **Expanded Breakdown** (on click):
   ```
   ├─ Leg 1: 0.42 → ~0.434 (+3.3%)
   ├─ Leg 2: 0.65 → ~0.658 (+1.2%)
   └─ Leg 3: 0.85 → ~0.856 (+0.7%)
   ```

### Position Status Display

```
┌─────────────────────────────────────────┐
│ 🟢 Active Chain: Politics Parlay        │
├─────────────────────────────────────────┤
│ Leg 1: Will Trump win?      ✅ FILLED   │
│        $100 → $85 filled @ 0.434        │
│        (85% fill, +3.4% impact)         │
│                                         │
│ Leg 2: BTC > $100k?         ⏳ QUEUED   │
│        Waiting for Leg 1 to resolve     │
│        Est. stake: $195.85              │
├─────────────────────────────────────────┤
│ Staked: $85.00 (intended: $100)         │
│ Potential: $368.20                      │
└─────────────────────────────────────────┘
```

## Implementation Order

1. **Backend: Orderbook endpoint** - New GET endpoint for CLOB orderbook
2. **Backend: Estimate endpoint** - Pricing calculation without execution
3. **Backend: Data model** - Add new fields to BetEntity, UserChainEntity
4. **Backend: Executor changes** - FAK orders, partial fill handling
5. **Backend: Timeout check** - 24h market resolution guard
6. **Frontend: Checkout UI** - Price impact card, slippage input
7. **Frontend: Status display** - Enhanced position status with fill details
8. **Testing** - Integration tests for partial fills, edge cases

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| FAK fills 0% | Chain → FAILED, reason: "Insufficient liquidity" |
| FAK fills 5% | Chain proceeds with 5%, clear message shown |
| Market <24h from end | Chain → FAILED, reason: "Market closing soon" |
| Orderbook fetch fails | Fall back to Gamma estimate, log warning |
| Slippage set to 0% | Must fill at exactly targetPrice or fail |
| Stake > 100% of liquidity | Show warning, likely very low fill |
<<<<<<< HEAD

## Implementation Notes

**Completed:** 2026-01-19

### Summary

All 13 tasks completed successfully:

1. ✅ Add Orderbook Types to types.ts
2. ✅ Add BetEntity Fields for Slippage
3. ✅ Add UserChainEntity Fields
4. ✅ Add UNFILLED and MARKET_CLOSING_SOON Bet Statuses
5. ✅ Create Orderbook Client with price impact calculation
6. ✅ Create GET /markets/:conditionId/orderbook endpoint
7. ✅ Create POST /chains/estimate endpoint
8. ✅ Update POST /chains to accept maxSlippage
9. ✅ Update Polymarket Client for FAK Orders
10. ✅ Update Bet Executor for FAK Orders and Partial Fills
11. ✅ Update dynamo-client for New Fields
12. ✅ Integration Tests for Full Flow
13. ✅ Update Design Doc with Implementation Notes

### Key Implementation Details

**Order Type Routing:** The Polymarket CLOB client has two different methods:
- `createAndPostOrder` for GTC/GTD (limit orders)
- `createAndPostMarketOrder` for FOK/FAK (market orders)

The polymarket-client correctly routes to the appropriate method based on order type.

**Price Calculations:** All USDC calculations use BigInt arithmetic via `toMicroUsdc`/`fromMicroUsdc` for precision. Fill tracking fields (`actualStake`, `fillPercentage`, `priceImpact`) use floating point for display/analytics only.

**Test Coverage:** 123+ tests covering:
- Unit tests for orderbook-client, estimate endpoint, FAK order logic
- Integration tests for full slippage flow
- Edge cases: zero fills, partial fills, market timeouts

### Known Limitations

- Orderbook fetch adds ~200-500ms latency for large orders (>5% of liquidity)
- FAK orders may partially fill even below slippage threshold if book is thin
- `PLACED` status kept for backwards compatibility but not used for new FAK-based orders

### Future Improvements

- WebSocket for real-time orderbook updates during checkout
- Historical price impact analytics dashboard
- Automatic slippage suggestion based on recent market volatility
=======
>>>>>>> 633fa71 (Add slippage and price impact design document)
