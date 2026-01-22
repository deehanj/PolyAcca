# Polymarket Betting with Turnkey & Builder Program

This guide covers the complete setup for placing bets on Polymarket, including gasless betting through the Builder Program, from a fresh Turnkey wallet to successfully placing orders on negRisk markets.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Step 1: Configure Environment](#step-1-configure-environment)
- [Step 2: Set Up Builder Infrastructure](#step-2-set-up-builder-infrastructure)
- [Step 3: Deploy Safe Wallet (Optional - For Gasless)](#step-3-deploy-safe-wallet-optional---for-gasless)
- [Step 4: Fund Your Wallets](#step-4-fund-your-wallets)
- [Step 5: Approve Polymarket Contracts](#step-5-approve-polymarket-contracts)
- [Step 6: Place Your Bet](#step-6-place-your-bet)
- [Troubleshooting](#troubleshooting)
- [Understanding NegRisk Markets](#understanding-negrisk-markets)

## Prerequisites

- Node.js v18+
- A Turnkey account with API credentials
- USDC.e tokens on Polygon (not native USDC!)
- POL/MATIC for gas fees (or Builder Program access for gasless)

## Initial Setup

### Install Dependencies
```bash
npm init -y
npm install @turnkey/viem @turnkey/http @turnkey/api-key-stamper
npm install @polymarket/clob-client @polymarket/order-utils
npm install @polymarket/builder-signing-sdk @polymarket/builder-relayer-client
npm install viem ethers@5 dotenv
```

### Project Structure
```
test-bet/
├── .env                           # Environment variables
├── builder-remote-server.js       # Builder authentication server
├── utils/
│   └── TurnkeyEthersAdapter.js   # Bridge between viem and ethers
├── deploy-safe.js                 # Gasless Safe deployment
├── transfer-usdc.js               # Transfer USDC.e between wallets
├── approve-all-contracts.js       # Set contract approvals
├── check-all-permissions.js       # Verify permissions
└── place-bet.js                   # Place orders on Polymarket
```

## Step 1: Configure Environment

Create a `.env` file with your credentials:

```env
# Turnkey Configuration
TURNKEY_ORGANIZATION_ID=your-org-id
TURNKEY_API_PUBLIC_KEY=your-public-key
TURNKEY_API_PRIVATE_KEY=your-private-key

# Builder Program (for gasless transactions)
BUILDER_API_KEY=your-builder-key
BUILDER_API_SECRET=your-builder-secret
BUILDER_API_PASSPHRASE=your-builder-passphrase
```

## Step 2: Set Up Builder Infrastructure

### Create Turnkey-Ethers Adapter

Create `utils/TurnkeyEthersAdapter.js`:

```javascript
const { TypedDataEncoder } = require('ethers/lib/utils');

class TurnkeyEthersSigner {
  constructor(walletClient, provider) {
    this.walletClient = walletClient;
    this.provider = provider;
    this.address = walletClient.account.address;
  }

  async getAddress() {
    return this.address;
  }

  async _signTypedData(domain, types, value) {
    const { EIP712Domain, ...typesWithoutDomain } = types;
    return await this.walletClient.signTypedData({
      account: this.walletClient.account,
      domain,
      types: typesWithoutDomain,
      primaryType: Object.keys(typesWithoutDomain)[0],
      message: value,
    });
  }

  async signMessage(message) {
    return await this.walletClient.signMessage({
      account: this.walletClient.account,
      message: typeof message === 'string' ? message : message.toString(),
    });
  }

  connect(provider) {
    return new TurnkeyEthersSigner(this.walletClient, provider);
  }
}

module.exports = { TurnkeyEthersSigner };
```

### Create Builder Remote Server

Create `builder-remote-server.js`:

```javascript
#!/usr/bin/env node

require('dotenv').config({ path: './.env' });
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const BUILDER_CREDENTIALS = {
  key: process.env.BUILDER_API_KEY,
  secret: process.env.BUILDER_API_SECRET,
  passphrase: process.env.BUILDER_API_PASSPHRASE,
};

function buildHmacSignature(secret, timestamp, method, requestPath, body = '') {
  const message = `${timestamp}${method}${requestPath}${body}`;
  const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'base64'));
  hmac.update(message);
  return hmac.digest('base64');
}

app.post('/api/polymarket/sign', (req, res) => {
  const { method, path, body } = req.body;
  const sigTimestamp = Date.now().toString();
  const signature = buildHmacSignature(
    BUILDER_CREDENTIALS.secret,
    parseInt(sigTimestamp),
    method,
    path,
    body || ''
  );

  res.json({
    POLY_BUILDER_SIGNATURE: signature,
    POLY_BUILDER_TIMESTAMP: sigTimestamp,
    POLY_BUILDER_API_KEY: BUILDER_CREDENTIALS.key,
    POLY_BUILDER_PASSPHRASE: BUILDER_CREDENTIALS.passphrase,
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Builder server running on http://localhost:${PORT}`);
});
```

Start the server:
```bash
node builder-remote-server.js &
```

## Step 3: Deploy Safe Wallet (Optional - For Gasless)

Create `deploy-safe.js`:

```javascript
#!/usr/bin/env node

require('dotenv').config({ path: './.env' });
const { createAccount } = require('@turnkey/viem');
const { TurnkeyClient } = require('@turnkey/http');
const { ApiKeyStamper } = require('@turnkey/api-key-stamper');
const { createWalletClient, http } = require('viem');
const { polygon } = require('viem/chains');
const { RelayClient } = require('@polymarket/builder-relayer-client');

async function deploySafe() {
  const organizationId = process.env.TURNKEY_ORGANIZATION_ID;
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;
  const eoaAddress = 'YOUR_EOA_ADDRESS'; // Your Turnkey wallet address

  console.log('🚀 Deploying Safe wallet gaslessly...\n');

  const stamper = new ApiKeyStamper({ apiPublicKey, apiPrivateKey });
  const turnkeyClient = new TurnkeyClient({ baseUrl: 'https://api.turnkey.com' }, stamper);

  const turnkeyAccount = await createAccount({
    client: turnkeyClient,
    organizationId,
    signWith: eoaAddress,
    ethereumAddress: eoaAddress,
  });

  const walletClient = createWalletClient({
    account: turnkeyAccount,
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  const relayClient = new RelayClient(
    'https://relayer-v2.polymarket.com',
    137,
    walletClient
  );

  const salt = Date.now().toString();
  const safeAddress = await relayClient.createSafe(salt);

  console.log('✅ Safe deployed at:', safeAddress);
  console.log('Owner:', eoaAddress);
  console.log('Gas paid: $0.00 (Builder Program)\n');

  return safeAddress;
}

deploySafe().catch(console.error);
```

## Step 4: Fund Your Wallets

### Important: Use USDC.e (Bridged USDC)
- **Correct Token**: USDC.e at `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- **Wrong Token**: Native USDC at `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`

### Transfer USDC.e Between Wallets

Create `transfer-usdc.js`:

```javascript
#!/usr/bin/env node

require('dotenv').config({ path: './.env' });
const { createAccount } = require('@turnkey/viem');
const { TurnkeyClient } = require('@turnkey/http');
const { ApiKeyStamper } = require('@turnkey/api-key-stamper');
const { createWalletClient, http, parseAbi, parseUnits } = require('viem');
const { polygon } = require('viem/chains');

const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

async function transferUSDC(toAddress, amount) {
  const organizationId = process.env.TURNKEY_ORGANIZATION_ID;
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;
  const eoaAddress = 'YOUR_EOA_ADDRESS';

  const stamper = new ApiKeyStamper({ apiPublicKey, apiPrivateKey });
  const turnkeyClient = new TurnkeyClient({ baseUrl: 'https://api.turnkey.com' }, stamper);

  const turnkeyAccount = await createAccount({
    client: turnkeyClient,
    organizationId,
    signWith: eoaAddress,
    ethereumAddress: eoaAddress,
  });

  const walletClient = createWalletClient({
    account: turnkeyAccount,
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  const ERC20_ABI = parseAbi([
    'function transfer(address to, uint256 amount) returns (bool)'
  ]);

  const amountWei = parseUnits(amount.toString(), 6); // USDC has 6 decimals

  const txHash = await walletClient.writeContract({
    address: USDC_E,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [toAddress, amountWei],
  });

  console.log(`✅ Transferred ${amount} USDC.e to ${toAddress}`);
  console.log(`Tx: ${txHash}`);
}

// Example: Transfer 10 USDC.e to Safe
transferUSDC('YOUR_SAFE_ADDRESS', 10).catch(console.error);
```

## Step 5: Approve Polymarket Contracts

### Critical: Different Markets Need Different Approvals

Create `approve-all-contracts.js`:

```javascript
#!/usr/bin/env node

require('dotenv').config({ path: './.env' });
const { createAccount } = require('@turnkey/viem');
const { TurnkeyClient } = require('@turnkey/http');
const { ApiKeyStamper } = require('@turnkey/api-key-stamper');
const { createWalletClient, http, createPublicClient, parseAbi, maxUint256, encodeFunctionData } = require('viem');
const { polygon } = require('viem/chains');

const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Polymarket Exchange Contracts
const CONTRACTS = {
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',           // Regular markets
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',  // NegRisk markets
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',      // NegRisk markets
};

async function approveAllContracts() {
  const organizationId = process.env.TURNKEY_ORGANIZATION_ID;
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;
  const eoaAddress = 'YOUR_EOA_ADDRESS';

  console.log('🔓 Approving all Polymarket contracts...\n');

  const stamper = new ApiKeyStamper({ apiPublicKey, apiPrivateKey });
  const turnkeyClient = new TurnkeyClient({ baseUrl: 'https://api.turnkey.com' }, stamper);

  const turnkeyAccount = await createAccount({
    client: turnkeyClient,
    organizationId,
    signWith: eoaAddress,
    ethereumAddress: eoaAddress,
  });

  const walletClient = createWalletClient({
    account: turnkeyAccount,
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  const USDC_ABI = parseAbi([
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ]);

  for (const [name, address] of Object.entries(CONTRACTS)) {
    const currentAllowance = await publicClient.readContract({
      address: USDC_E,
      abi: USDC_ABI,
      functionName: 'allowance',
      args: [eoaAddress, address],
    });

    if (Number(currentAllowance) / 1e6 < 1000000) {
      console.log(`Approving ${name}...`);

      const txHash = await walletClient.sendTransaction({
        to: USDC_E,
        data: encodeFunctionData({
          abi: USDC_ABI,
          functionName: 'approve',
          args: [address, maxUint256],
        }),
        account: turnkeyAccount,
      });

      console.log(`✅ Approved! Tx: ${txHash}\n`);

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    } else {
      console.log(`✅ ${name} already approved\n`);
    }
  }

  console.log('All contracts approved!');
}

approveAllContracts().catch(console.error);
```

## Step 6: Place Your Bet

Create `place-bet.js`:

```javascript
#!/usr/bin/env node

require('dotenv').config({ path: './.env' });
const { createAccount } = require('@turnkey/viem');
const { TurnkeyClient } = require('@turnkey/http');
const { ApiKeyStamper } = require('@turnkey/api-key-stamper');
const { createWalletClient, http, createPublicClient } = require('viem');
const { polygon } = require('viem/chains');

const ethers5Path = require.resolve('ethers', { paths: [require.resolve('@polymarket/clob-client')] });
const ethers = require(ethers5Path);

const { ClobClient, Side, OrderType } = require('@polymarket/clob-client');
const { SignatureType } = require('@polymarket/order-utils');
const { TurnkeyEthersSigner } = require('./utils/TurnkeyEthersAdapter');

async function placeBet() {
  const organizationId = process.env.TURNKEY_ORGANIZATION_ID;
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;
  const eoaAddress = 'YOUR_EOA_ADDRESS';

  // Example: Trump deportation market (negRisk)
  const conditionId = '0xaf9d0e448129a9f657f851d49495ba4742055d80e0ef1166ba0ee81d4d594214';
  const noTokenId = '4153292802911610701832309484716814274802943278345248636922528170020319407796';

  console.log('🎯 Placing bet on Polymarket...\n');

  // Setup wallet
  const stamper = new ApiKeyStamper({ apiPublicKey, apiPrivateKey });
  const turnkeyClient = new TurnkeyClient({ baseUrl: 'https://api.turnkey.com' }, stamper);

  const turnkeyAccount = await createAccount({
    client: turnkeyClient,
    organizationId,
    signWith: eoaAddress,
    ethereumAddress: eoaAddress,
  });

  const walletClient = createWalletClient({
    account: turnkeyAccount,
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  const ethersProvider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
  const ethersSigner = new TurnkeyEthersSigner(walletClient, ethersProvider);

  // Get market info
  const marketResp = await fetch(`https://clob.polymarket.com/markets/${conditionId}`);
  const market = await marketResp.json();

  console.log('Market:', market.question);
  console.log('negRisk:', market.neg_risk);
  console.log('');

  // Create API credentials
  const tempClient = new ClobClient(
    'https://clob.polymarket.com',
    137,
    ethersSigner,
    undefined,
    SignatureType.EOA,
    eoaAddress  // CRITICAL: Funder address
  );

  const creds = await tempClient.createApiKey(Date.now());
  console.log('API Key:', creds.key);

  // Create trading client
  const clobClient = new ClobClient(
    'https://clob.polymarket.com',
    137,
    ethersSigner,
    creds,
    SignatureType.EOA,
    eoaAddress  // CRITICAL: Must match API key creation
  );

  // Update balance cache
  await clobClient.updateBalanceAllowance({ asset_type: 'COLLATERAL' });

  // Place order
  const orderParams = {
    tokenID: noTokenId,
    price: 0.98,
    side: Side.BUY,
    size: 5,  // Minimum $5
  };

  console.log('Placing order...');
  console.log('Price:', orderParams.price);
  console.log('Size:', orderParams.size);
  console.log('Cost: $', (orderParams.price * orderParams.size).toFixed(2));
  console.log('');

  const order = await clobClient.createAndPostOrder(
    orderParams,
    {
      tickSize: '0.001',
      negRisk: market.neg_risk  // CRITICAL: Must match market type!
    },
    OrderType.GTC
  );

  if (order?.orderID) {
    console.log('🎉 BET PLACED SUCCESSFULLY!');
    console.log('Order ID:', order.orderID);
    console.log('Status:', order.status);
  }
}

placeBet().catch(console.error);
```

## Troubleshooting

### Common Errors and Solutions

#### "invalid signature"
- **Cause**: Wrong `negRisk` parameter
- **Solution**: Set `negRisk: market.neg_risk` to match the market

#### "not enough balance / allowance"
- **Cause**: Missing contract approvals (NOT insufficient funds!)
- **Solution**: Run `approve-all-contracts.js` to approve all three contracts

#### "Unauthorized/Invalid api key"
- **Cause**: Geoblocking or incorrect API setup
- **Solution**: Check if you're in a blocked region (US, etc.) or verify API credentials

#### Wrong USDC Type
- **Symptom**: Have USDC but can't trade
- **Solution**: Use USDC.e (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`), not native USDC

### Verify Permissions

Create `check-all-permissions.js` to diagnose issues:

```javascript
#!/usr/bin/env node

const { createPublicClient, http, parseAbi } = require('viem');
const { polygon } = require('viem/chains');

async function checkPermissions() {
  const eoaAddress = 'YOUR_EOA_ADDRESS';
  const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

  const contracts = {
    'CTF Exchange': '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
    'Neg Risk CTF Exchange': '0xC5d563A36AE78145C45a50134d48A1215220f80a',
    'Neg Risk Adapter': '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  };

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address, address) view returns (uint256)',
  ]);

  // Check balance
  const balance = await publicClient.readContract({
    address: USDC_E,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [eoaAddress],
  });

  console.log('USDC.e Balance: $', (Number(balance) / 1e6).toFixed(2));
  console.log('\nApprovals:');

  // Check approvals
  for (const [name, address] of Object.entries(contracts)) {
    const allowance = await publicClient.readContract({
      address: USDC_E,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [eoaAddress, address],
    });

    const formatted = Number(allowance) / 1e6;
    if (allowance === 0n) {
      console.log(`❌ ${name}: NOT APPROVED`);
    } else if (formatted > 1e10) {
      console.log(`✅ ${name}: Unlimited`);
    } else {
      console.log(`⚠️ ${name}: $${formatted.toFixed(2)}`);
    }
  }
}

checkPermissions().catch(console.error);
```

## Understanding NegRisk Markets

### What is a NegRisk Market?
NegRisk (negative risk) markets are used for multi-outcome events where you bet on what WON'T happen rather than what will.

### Key Differences:
1. **Inverted Pricing**: Buying YES at $0.01 costs $0.99 (not $0.01)
2. **Different Contracts**: Requires Neg Risk CTF Exchange approval
3. **negRisk Parameter**: Must be set to `true` in order creation

### Example:
```javascript
// Regular market: "Will Biden win?"
// - YES = Biden wins
// - NO = Biden doesn't win

// NegRisk market: "Who will win?" (Biden, Trump, Kennedy)
// - Biden token = Pays if Biden DOESN'T win
// - Trump token = Pays if Trump DOESN'T win
```

## Complete Setup Script

Create `setup-all.sh`:

```bash
#!/bin/bash

echo "🚀 Setting up Polymarket betting environment..."

# Install dependencies
npm install

# Start Builder server
node builder-remote-server.js &
BUILDER_PID=$!
echo "Builder server started (PID: $BUILDER_PID)"

# Deploy Safe (optional)
read -p "Deploy Safe wallet? (y/n): " DEPLOY_SAFE
if [ "$DEPLOY_SAFE" = "y" ]; then
  node deploy-safe.js
fi

# Approve contracts
echo "Approving all contracts..."
node approve-all-contracts.js

# Check permissions
echo "Verifying permissions..."
node check-all-permissions.js

echo "✅ Setup complete! You can now run: node place-bet.js"
```

## Summary

### Required Steps:
1. **Set up infrastructure** (Builder server, Turnkey adapter)
2. **Deploy Safe wallet** (optional, for gasless)
3. **Fund with USDC.e** (not native USDC!)
4. **Approve ALL contracts** (CTF Exchange + Neg Risk contracts)
5. **Place bet** with correct `negRisk` parameter

### Key Points:
- Always use USDC.e (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`)
- NegRisk markets need special approvals and `negRisk: true`
- "not enough balance" usually means missing approvals
- Update balance cache after funding/approvals

### Success Indicators:
- Order ID returned
- Status: "live"
- No error messages

## Support

For issues:
1. Run `check-all-permissions.js` to verify setup
2. Ensure you're not in a blocked region (US, etc.)
3. Contact builder@polymarket.com for Builder Program support