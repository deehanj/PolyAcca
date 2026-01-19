/**
 * USDC Permit Utilities (EIP-2612)
 *
 * Enables gasless USDC transfers where a third party (platform wallet)
 * pays the gas fees on behalf of the user.
 *
 * Flow:
 * 1. Embedded user wallet signs a permit message (off-chain, gasless)
 * 2. Platform wallet submits permit + transferFrom transaction (pays gas)
 * 3. USDC moves from embedded user wallet to destination
 *
 * This is used for:
 * - Platform fee collection (user → commission wallet)
 * - Withdrawals (embedded wallet → user's connected wallet)
 */

import { ethers, Contract } from 'ethers';
import type { Signer } from 'ethers';
import { createSignerWithProvider } from './turnkey-client';
import { createLogger } from './logger';
import { requireEnvVar } from '../utils/envVars';

const logger = createLogger('usdc-permit');

// ethers v5 helpers
const { JsonRpcProvider } = ethers.providers;
const { splitSignature, _TypedDataEncoder } = ethers.utils;

// Polygon configuration
const POLYGON_RPC_URL = 'https://polygon-rpc.com';
const POLYGON_CHAIN_ID = 137;

// USDC.e on Polygon
const USDC_CONTRACT_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_DECIMALS = 6;

// EIP-2612 Permit domain for USDC.e on Polygon
const PERMIT_DOMAIN = {
  name: 'USD Coin (PoS)',
  version: '1',
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: USDC_CONTRACT_ADDRESS,
};

// EIP-2612 Permit types
const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

// USDC ABI with permit and transferFrom
const USDC_PERMIT_ABI = [
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function nonces(address owner) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

export interface PermitSignature {
  v: number;
  r: string;
  s: string;
}

export interface PermitTransferResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Get the current nonce for an address (used in permit signing)
 */
async function getPermitNonce(
  provider: ethers.providers.Provider,
  ownerAddress: string
): Promise<ethers.BigNumber> {
  const usdcContract = new Contract(USDC_CONTRACT_ADDRESS, USDC_PERMIT_ABI, provider);
  return usdcContract.nonces(ownerAddress);
}

/**
 * Sign an EIP-2612 permit message
 *
 * The owner signs a message authorizing the spender to transfer tokens.
 * This is done off-chain (gasless) via Turnkey.
 *
 * @param ownerSigner - Signer for the token owner (embedded user wallet)
 * @param spenderAddress - Address authorized to spend (platform wallet)
 * @param value - Amount to authorize (in wei/smallest unit)
 * @param deadline - Unix timestamp when permit expires
 * @returns The permit signature (v, r, s)
 */
export async function signPermit(
  ownerSigner: Signer,
  spenderAddress: string,
  value: ethers.BigNumber,
  deadline: number
): Promise<PermitSignature> {
  const ownerAddress = await ownerSigner.getAddress();
  const provider = ownerSigner.provider;

  if (!provider) {
    throw new Error('Signer must have a provider');
  }

  // Get current nonce for the owner
  const nonce = await getPermitNonce(provider, ownerAddress);

  logger.debug('Signing permit', {
    owner: ownerAddress,
    spender: spenderAddress,
    value: value.toString(),
    nonce: nonce.toString(),
    deadline,
  });

  // Create the permit message
  const permitMessage = {
    owner: ownerAddress,
    spender: spenderAddress,
    value: value,
    nonce: nonce,
    deadline: deadline,
  };

  // Sign the typed data (EIP-712)
  // Note: Turnkey signer supports _signTypedData
  const signature = await (ownerSigner as any)._signTypedData(
    PERMIT_DOMAIN,
    PERMIT_TYPES,
    permitMessage
  );

  // Split signature into v, r, s components
  const { v, r, s } = splitSignature(signature);

  logger.debug('Permit signed', {
    owner: ownerAddress,
    spender: spenderAddress,
    v,
  });

  return { v, r, s };
}

/**
 * Execute a permit + transferFrom in a single flow
 *
 * This is the main function for gasless USDC transfers:
 * 1. Platform wallet calls permit() to authorize itself
 * 2. Platform wallet calls transferFrom() to move tokens
 * 3. Platform wallet pays all gas fees
 *
 * @param ownerAddress - Token owner (embedded user wallet)
 * @param recipientAddress - Where tokens are sent (commission wallet or user's wallet)
 * @param amount - Amount to transfer (as string, e.g., "10.50")
 * @param permitSignature - The signed permit from signPermit()
 * @param deadline - Permit expiration timestamp
 * @returns Result with success status and tx hash
 */
export async function executePermitTransfer(
  ownerAddress: string,
  recipientAddress: string,
  amount: string,
  permitSignature: PermitSignature,
  deadline: number
): Promise<PermitTransferResult> {
  const platformWalletAddress = requireEnvVar('PLATFORM_WALLET_ADDRESS');

  logger.info('Executing permit transfer', {
    owner: ownerAddress,
    recipient: recipientAddress,
    amount,
    platformWallet: platformWalletAddress,
  });

  try {
    // Create provider
    const provider = new JsonRpcProvider(POLYGON_RPC_URL, POLYGON_CHAIN_ID);

    // Create signer for platform wallet (pays gas)
    const platformSigner = await createSignerWithProvider(platformWalletAddress, provider);

    // Create USDC contract with platform signer
    const usdcContract = new Contract(USDC_CONTRACT_ADDRESS, USDC_PERMIT_ABI, platformSigner);

    // Convert amount to USDC units (6 decimals)
    const amountWei = ethers.utils.parseUnits(amount, USDC_DECIMALS);

    // Check owner's balance first
    const balance = await usdcContract.balanceOf(ownerAddress);
    if (balance.lt(amountWei)) {
      const balanceFormatted = ethers.utils.formatUnits(balance, USDC_DECIMALS);
      logger.warn('Insufficient USDC balance', {
        owner: ownerAddress,
        balance: balanceFormatted,
        required: amount,
      });
      return {
        success: false,
        error: `Insufficient balance. Available: ${balanceFormatted} USDC`,
      };
    }

    // Step 1: Call permit() to authorize platform wallet
    logger.debug('Calling permit()', {
      owner: ownerAddress,
      spender: platformWalletAddress,
      value: amountWei.toString(),
      deadline,
    });

    const permitTx = await usdcContract.permit(
      ownerAddress,
      platformWalletAddress,
      amountWei,
      deadline,
      permitSignature.v,
      permitSignature.r,
      permitSignature.s
    );

    await permitTx.wait(1);
    logger.debug('Permit confirmed', { txHash: permitTx.hash });

    // Step 2: Call transferFrom() to move tokens
    logger.debug('Calling transferFrom()', {
      from: ownerAddress,
      to: recipientAddress,
      amount: amountWei.toString(),
    });

    const transferTx = await usdcContract.transferFrom(
      ownerAddress,
      recipientAddress,
      amountWei
    );

    const receipt = await transferTx.wait(1);

    logger.info('Permit transfer completed', {
      txHash: receipt?.transactionHash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed?.toString(),
      owner: ownerAddress,
      recipient: recipientAddress,
      amount,
    });

    return {
      success: true,
      txHash: receipt?.transactionHash,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.errorWithStack('Permit transfer failed', error, {
      owner: ownerAddress,
      recipient: recipientAddress,
      amount,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * High-level function to transfer USDC with platform-paid gas
 *
 * Combines permit signing and execution into a single call.
 * The embedded user wallet signs the permit, platform wallet pays gas.
 *
 * @param embeddedUserWalletAddress - Source of USDC (signs permit)
 * @param recipientAddress - Destination for USDC
 * @param amount - Amount to transfer (as string)
 * @returns Result with success status and tx hash
 */
export async function transferUsdcWithPlatformGas(
  embeddedUserWalletAddress: string,
  recipientAddress: string,
  amount: string
): Promise<PermitTransferResult> {
  const platformWalletAddress = requireEnvVar('PLATFORM_WALLET_ADDRESS');

  logger.info('Starting USDC transfer with platform gas', {
    from: embeddedUserWalletAddress,
    to: recipientAddress,
    amount,
    gasPayer: platformWalletAddress,
  });

  try {
    // Create provider
    const provider = new JsonRpcProvider(POLYGON_RPC_URL, POLYGON_CHAIN_ID);

    // Create signer for embedded user wallet (to sign permit)
    const ownerSigner = await createSignerWithProvider(embeddedUserWalletAddress, provider);

    // Set deadline to 1 hour from now
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Convert amount to wei for permit
    const amountWei = ethers.utils.parseUnits(amount, USDC_DECIMALS);

    // Step 1: Sign the permit (off-chain, gasless)
    const permitSignature = await signPermit(
      ownerSigner,
      platformWalletAddress,
      amountWei,
      deadline
    );

    // Step 2: Execute permit + transferFrom (platform pays gas)
    return executePermitTransfer(
      embeddedUserWalletAddress,
      recipientAddress,
      amount,
      permitSignature,
      deadline
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.errorWithStack('USDC transfer with platform gas failed', error, {
      from: embeddedUserWalletAddress,
      to: recipientAddress,
      amount,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
