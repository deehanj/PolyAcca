# Shareable P&L Card Design

**Date:** 2025-01-20
**Status:** Approved

## Overview

Enhance the `/acca/:chainId` route to intelligently handle two sharing scenarios:
1. **Template sharing** - Share an ACCA before it starts for others to copy
2. **P&L sharing** - Share winning/completed ACCAs with animated journey visualization

Goals:
- Drive viral sharing with casino-style animations and FOMO elements
- Optimize for both link sharing (rich OG previews) and image downloads
- Create compelling CTAs that convert viewers to users

---

## Route & State Detection

**URL:** `/acca/:chainId`

Mode determined by chain status:

| Status | Mode | Behavior |
|--------|------|----------|
| PENDING | Template | Show legs, stake input, "Place Bet" CTA |
| ACTIVE | P&L | Show live journey progression |
| WON | P&L | Full celebration, journey animation |
| LOST | P&L | Muted journey, "Try Again" CTA |

---

## Template Mode (PENDING Status)

For sharing ACCAs before they start.

### Layout

```
┌─────────────────────────────────────┐
│ [Chain Image if exists]             │
├─────────────────────────────────────┤
│ ⚡ "Chain Name" (or N-Leg Acca)     │
│                                     │
│ 👥 47 people joined  •  $2,340 pool │
├─────────────────────────────────────┤
│ LEG 1: "Will BTC hit 100k?" → YES   │
│ LEG 2: "Trump wins election?" → YES │
│ LEG 3: "ETH flips BTC?" → NO        │
├─────────────────────────────────────┤
│ Potential Multiplier:    8x         │
│                                     │
│ ┌─ Your Stake ─────────────────┐    │
│ │ $[____10____]  [$10][$50][$100]│   │
│ └───────────────────────────────┘   │
│                                     │
│ 💰 Potential Win: $80               │
│                                     │
│ [ Connect Wallet ] or [ PLACE BET ] │
└─────────────────────────────────────┘
```

### FOMO Elements
- Live participant count with pulse animation
- "X joined in the last hour" for recent activity
- Pool size showing total staked
- Scarcity: "First leg closes in 2h 34m"

### CTA Behavior
- No wallet: "Connect Wallet" → triggers connection → shows "PLACE BET"
- Connected: Direct "PLACE BET" flow

---

## P&L Mode (ACTIVE/WON/LOST Status)

### Initial State

```
┌─────────────────────────────────────┐
│         🏆 WINNING ACCA 🏆          │
│     wallet: 0x1a2b...3c4d           │
│                                     │
│    ┌──────────────────────┐         │
│    │      $10.00          │         │
│    │   ENTRY STAKE        │         │
│    └──────────────────────┘         │
│                                     │
│       [ REVEAL JOURNEY ]            │
└─────────────────────────────────────┘
```

### Animation Sequence

On tap or auto-play, legs reveal one by one with slot-machine number spinning:

**Leg 1** (1.0s spin):
```
$10 ──────────────────▶ $95
"BTC hits 100k?" ✓ YES WON
```
Gold coins burst, multiplier badge pulses "9.5x"

**Leg 2** (1.5s spin - builds tension):
```
$95 ─────────────────▶ $850
"Trump wins?" ✓ YES WON
```
Bigger celebration, running total glows

**Leg 3** (2.0s spin - maximum drama):
```
$850 ────────────────▶ $10,200
"ETH > 5k by Dec?" ✓ YES WON
```
Full confetti explosion, screen shake, "LEGENDARY WIN" banner

### Final State

```
┌─────────────────────────────────────┐
│    🎰 LEGENDARY 1,020x WIN 🎰       │
│                                     │
│  $10 → $95 → $850 → $10,200         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│  ┌─ TOTAL PROFIT ───────────────┐   │
│  │     +$10,190.00              │   │
│  │      +101,900%  ↑            │   │
│  └──────────────────────────────┘   │
│                                     │
│  47 people copied this acca         │
│                                     │
│  [ 🎲 BUILD YOUR OWN ]              │
└─────────────────────────────────────┘
```

### Expandable Details
Tapping any leg shows full market question, odds at entry, timestamp.

### Lost ACCA Styling
Muted version - no celebration, grayscale tint, red final number:

```
┌─────────────────────────────────────┐
│         ❌ ACCA LOST                │
│                                     │
│  $50 → $210 → $0                    │
│  Leg 3 didn't hit                   │
│                                     │
│  [ Build a New Acca ]               │
└─────────────────────────────────────┘
```

---

## FOMO & Social Proof Elements

### Live Activity Ticker
```
🔴 LIVE: 12 people viewing this acca
```
Subtle pulse animation.

### Recent Copies Feed
```
┌─────────────────────────────────────┐
│ 📈 Recent Copies                    │
│                                     │
│ 0x8f2a...  copied • 3 min ago       │
│ 0xc91b...  copied • 12 min ago      │
│ 0x3e7d...  copied • 1 hour ago      │
│                                     │
│ +44 more                            │
└─────────────────────────────────────┘
```

### Win Notifications (Toast)
Platform-wide wins sliding in while viewing:
```
┌────────────────────────────────────┐
│ 🎉 0x7a2c... just won $340         │
│    on a 3-leg acca                 │
└────────────────────────────────────┘
```

### CTA Text
- Not connected: "Connect Wallet to Start Winning"
- Connected: "Build Your Own Acca" or "Copy This Bet"

---

## Celebration Tiers

| Multiplier | Celebration |
|------------|-------------|
| < 5x | Subtle gold sparkle |
| 5x - 20x | Confetti burst |
| 20x - 100x | Confetti + coin rain |
| 100x+ | Full screen takeover, "LEGENDARY" banner, screen shake |

---

## Sharing Infrastructure

### Open Graph Meta Tags

Dynamic per chain status:

**P&L Mode (WON):**
```html
<meta property="og:title" content="🏆 1,020x WIN on PolyAcca" />
<meta property="og:description" content="$10 → $10,200 on a 3-leg accumulator" />
<meta property="og:image" content="https://polyacca.com/api/og/acca/abc123.png" />
```

**Template Mode:**
```html
<meta property="og:title" content="3-Leg Accumulator on PolyAcca" />
<meta property="og:description" content="47 people joined • 8x potential multiplier" />
<meta property="og:image" content="https://polyacca.com/api/og/acca/abc123.png" />
```

### OG Image Generation

Server-side rendered at `/api/og/acca/:chainId.png`

Options:
- Vercel OG / Satori (React to PNG)
- Lambda + Puppeteer (heavier)

### Share Buttons
- Twitter/X - Pre-filled text + link
- Telegram - Same
- Copy Link - With success toast
- Download PNG - High-res html-to-image capture

---

## Component Architecture

```
frontend/src/
├── pages/
│   └── SharedAcca.tsx          # Main page for /acca/:id
│
├── components/
│   ├── share/
│   │   ├── TemplateMode.tsx    # PENDING state UI
│   │   ├── PnLMode.tsx         # ACTIVE/WON/LOST state UI
│   │   ├── JourneyAnimation.tsx # Orchestrates leg reveals
│   │   ├── LegReveal.tsx       # Single leg with spin animation
│   │   ├── FOMOTicker.tsx      # Live viewers, recent copies
│   │   ├── WinNotification.tsx # Platform win toasts
│   │   └── ShareButtons.tsx    # Social sharing buttons
│   │
│   └── ui/
│       └── SlotNumber.tsx      # Spinning number component
│
├── hooks/
│   └── useChainShare.ts        # Fetch chain + participant data
│
└── lib/
    └── celebrations.ts         # Confetti, coins, shake utils
```

### Component Responsibilities

| Component | Purpose |
|-----------|---------|
| `SharedAcca` | Route handler, data fetch, mode selection |
| `TemplateMode` | Stake input, legs list, place bet CTA |
| `PnLMode` | Journey wrapper, final stats, share buttons |
| `JourneyAnimation` | Sequences leg-by-leg reveals |
| `LegReveal` | Single leg: question, side, stake→payout |
| `SlotNumber` | Animated number spinning to target |
| `FOMOTicker` | Live/recent activity display |

### State Flow

```
SharedAcca (fetches chain)
    ↓
chain.status === 'PENDING' ? <TemplateMode /> : <PnLMode />
    ↓
PnLMode manages animation state (idle → playing → complete)
    ↓
JourneyAnimation sequences through legs
```

---

## Animation Details

### SlotNumber Timing

```
Leg 1: 1.0s spin
Leg 2: 1.5s spin (builds tension)
Leg 3: 2.0s spin (maximum drama)
```

Easing: ease-out-cubic (fast start, slow landing)

### Color Palette

```css
--gold: #FFD700          /* Primary accent */
--gold-bright: #FFEC80   /* Highlights */
--success: #22C55E       /* Wins, profit */
--error: #EF4444         /* Losses */
--bg-card: #1a1a2e       /* Card background */
```

---

## API Changes

### Enhanced: `GET /chains/:chainId`

Additional response fields:

```typescript
{
  // ... existing fields ...

  // P&L journey data:
  legProgression: [
    { sequence: 1, stakeIn: "10.00", payout: "95.00", status: "WON" },
    { sequence: 2, stakeIn: "95.00", payout: "850.00", status: "WON" },
    { sequence: 3, stakeIn: "850.00", payout: "10200.00", status: "WON" }
  ],

  // FOMO data:
  participantCount: 47,
  recentCopies: [
    { wallet: "0x8f2a...3c4d", timestamp: "2024-01-15T10:30:00Z" },
    // ... last 5-10
  ],

  // OG metadata:
  totalMultiplier: 1020,
  resolvedAt?: "2024-01-15T12:00:00Z"
}
```

### New: `GET /api/og/acca/:chainId.png`

Server-rendered OG image via Lambda + Satori or CloudFront function.

---

## Implementation Notes

1. Start with P&L Mode (WON status) - highest viral potential
2. Template Mode can reuse existing SharedAccaModal logic
3. OG image generation can be deferred; link sharing works without it
4. FOMO elements (recent copies, live viewers) can be phased in
