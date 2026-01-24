# Deposit UX Redesign

**Date:** 2025-01-24
**Status:** Approved

## Problem

The current deposit modal shows balances across Polygon, Ethereum, and Base equally, which causes user confusion. Users accidentally deposit to Ethereum, then face expensive gas fees ($5-15+) to bridge to Polygon - sometimes more than their balance is worth.

Polymarket requires USDC on Polygon. The UX should guide users clearly toward the correct path.

## Goals

- Make it obvious that Polygon is the only direct deposit option
- Provide easy onramp for users with no crypto (buy USDC via AppKit)
- Show deficit-based messaging when opened mid-bet ("You need $57.50 more")
- Hide other chains by default, tucked under "More options"
- Celebrate successful deposits and guide users back to betting

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chain visibility | Polygon-first, hide others | Prevents accidental wrong-chain deposits |
| Onramp method | AppKit (MoonPay, Coinbase Pay) | Already integrated, aggregates providers |
| Wrong-chain handling | Show under "More options" with warnings | Transparent but discouraged |
| No-funds state | Soft onboarding - prompt at bet time | Don't interrupt browsing |
| Gas handling | None needed | Gasless via Polymarket Builder Program |
| Balance updates | Poll every 5s while modal open | Simple, no backend changes |
| Post-deposit | Celebrate, then prompt to place bet | Guided flow back to intent |

---

## Modal States

### State 1: Insufficient Funds (opened mid-bet)

When user tries to bet $100 but only has $42.50:

```
┌─────────────────────────────────────────┐
│  ✕                                      │
│                                         │
│  You need $57.50 more                   │
│                                         │
│  Trading balance     $42.50             │
│  Bet amount          $100.00            │
│  Shortfall           -$57.50            │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  💳  Buy USDC                   │    │
│  │      Card, Apple Pay, Bank      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ↓   Deposit from Polygon       │    │
│  │      You have $0.00 USDC        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ▼ More options                         │
│                                         │
└─────────────────────────────────────────┘
```

### State 2: Has Polygon USDC

```
┌─────────────────────────────────────────┐
│  ✕                                      │
│                                         │
│  Deposit to Trading Wallet              │
│  Balance: $42.50                        │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ↓   Deposit from Polygon       │    │
│  │      You have $85.00 USDC ✓     │    │
│  └─────────────────────────────────┘    │
│      ↓ (expanded)                       │
│  ┌─────────────────────────────────┐    │
│  │  Amount  [$______60____] [Max]  │    │
│  │                                 │    │
│  │  [      Deposit $60.00      ]   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  💳  Buy more USDC              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ▼ More options                         │
│                                         │
└─────────────────────────────────────────┘
```

### State 3: Waiting for Deposit

```
┌─────────────────────────────────────────┐
│  ✕                                      │
│                                         │
│  ⏳ Waiting for deposit...              │
│                                         │
│  Balance: $42.50                        │
│  ●●● checking...                        │
│                                         │
│  Funds typically arrive in 1-5 minutes  │
│                                         │
└─────────────────────────────────────────┘
```

### State 4: Deposit Success

```
┌─────────────────────────────────────────┐
│                                         │
│  🎉                                     │
│                                         │
│  $60.00 added!                          │
│                                         │
│  New balance: $102.50                   │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  [   Place $100 Bet   ]         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  or continue browsing                   │
│                                         │
└─────────────────────────────────────────┘
```

---

## "More Options" Expanded

```
┌─────────────────────────────────────────┐
│  ▲ More options                         │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Bridge from another chain              │
│  ⚠️ Gas fees may be $5-15               │
│                                         │
│  ┌─ Ethereum ─────────────────────┐     │
│  │  $125.00 USDC                  │     │
│  │  [Bridge to Polygon]           │     │
│  └────────────────────────────────┘     │
│                                         │
│  ┌─ Base ─────────────────────────┐     │
│  │  $0.00 USDC                    │     │
│  └────────────────────────────────┘     │
│                                         │
│  💡 Tip: For small amounts, buying      │
│     fresh on Polygon is often cheaper   │
│     than bridging.                      │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Or try a cheaper bridge:               │
│  • Jumper.exchange                      │
│  • Polygon Portal                       │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Manual deposit                         │
│  Send USDC from any wallet or exchange  │
│                                         │
│  Your address:                          │
│  0x1a2b3c4d...5e6f7g8h  [Copy]         │
│                                         │
│  Supported: Polygon, Ethereum, Base,    │
│  Solana, Bitcoin (auto-converted)       │
│                                         │
└─────────────────────────────────────────┘
```

---

## Component Architecture

```
frontend/src/components/
├── TradingBalance.tsx          # Refactor - header button only
└── deposit/
    ├── DepositModal.tsx        # Main modal, state machine
    ├── DepositHeader.tsx       # Balance + shortfall display
    ├── BuyUsdcOption.tsx       # AppKit onramp trigger
    ├── PolygonDepositOption.tsx # Direct deposit form
    ├── MoreOptions.tsx         # Collapsible bridge/manual section
    ├── WaitingForDeposit.tsx   # Polling state with spinner
    └── DepositSuccess.tsx      # Celebration + place bet CTA
```

---

## State Machine

```
IDLE ──────────────────────────────────────┐
  │                                        │
  ├─ has shortfall? ──► NEEDS_FUNDS        │
  │                      │                 │
  │                      ├─ click buy ──► WAITING
  │                      │                 │
  │                      └─ click deposit ─┤
  │                                        │
  └─ no shortfall? ───► READY_TO_DEPOSIT ──┤
                                           │
WAITING ◄──────────────────────────────────┤
  │                                        │
  └─ balance increased? ──► SUCCESS        │
                              │            │
                              └─ click CTA ──► CLOSE (place bet)
```

---

## Changes to Existing Code

### TradingBalanceContext

Add new fields:

```typescript
interface TradingBalanceContextValue {
  // ... existing fields ...

  /** Amount needed for pending bet (null if not mid-bet) */
  shortfall: number | null;

  /** Bet amount that triggered the modal */
  pendingBetAmount: number | null;

  /** Set pending bet info when opening modal mid-bet */
  setPendingBet: (amount: number) => void;

  /** Clear pending bet info */
  clearPendingBet: () => void;
}
```

### AccumulatorSidebar

When `hasSufficientBalance` fails:

```typescript
// Before opening modal, store the bet amount
if (!hasSufficientBalance(stakeAmount)) {
  setPendingBet(stakeAmount);
  openDepositModal();
  return;
}
```

### TradingBalance.tsx

- Simplify to just the header button
- Move all modal content to new `DepositModal.tsx`

### Polling

When modal is open, enable fast polling:

```typescript
const { data: tradingBalanceRaw } = useReadContract({
  // ... existing config ...
  query: {
    enabled: !!safeWalletAddress && isAuthenticated,
    refetchInterval: isDepositModalOpen ? 5000 : 30000, // Fast poll when modal open
  },
});
```

---

## Buy USDC Flow (AppKit)

Trigger AppKit's onramp modal:

```typescript
import { useAppKit } from '@reown/appkit/react';

function BuyUsdcOption() {
  const { open } = useAppKit();

  const handleBuyUsdc = () => {
    open({ view: 'OnRampProviders' });
  };

  return (
    <button onClick={handleBuyUsdc}>
      Buy USDC
    </button>
  );
}
```

---

## Implementation Notes

1. **Phase 1:** Refactor modal structure, implement state machine
2. **Phase 2:** Add AppKit "Buy USDC" integration
3. **Phase 3:** Polish animations, success celebration
4. **Phase 4:** Add "More options" bridge flow (can defer if needed)

---

## Sources

- [Polymarket Deposit Docs](https://docs.polymarket.com/polymarket-learn/get-started/how-to-deposit)
- [How to Buy USDC for Polymarket](https://www.homesfound.ca/blog/how-buy-usdc-polymarket-step-step-guide-2026/)
