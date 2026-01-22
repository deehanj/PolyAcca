/**
 * Safe Approvals Client for Polymarket
 *
 * Handles checking and setting USDC.e approvals for Polymarket contracts
 * via gasless transactions through the Builder Program.
 */

import { RelayClient } from '@polymarket/builder-relayer-client';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  maxUint256,
  type WalletClient,
  type PublicClient
} from 'viem';
import { polygon } from 'viem/chains';
import { createLogger } from './logger';
import { requireEnvVar } from '../utils/envVars';
import type { Signer } from 'ethers';

const logger = createLogger('safe-approvals-client');

// Environment variables
const BUILDER_API_KEY = requireEnvVar('BUILDER_API_KEY');
const BUILDER_API_SECRET = requireEnvVar('BUILDER_API_SECRET');
const BUILDER_API_PASSPHRASE = requireEnvVar('BUILDER_API_PASSPHRASE');

// Polymarket Builder endpoints
const BUILDER_RELAYER_URL = 'https://relayer-v2.polymarket.com';

// Token addresses on Polygon
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // Bridged USDC

// Polymarket Exchange Contracts
const POLYMARKET_CONTRACTS = {
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',           // Regular markets
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',  // NegRisk markets
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',      // NegRisk adapter
};

// ERC20 ABI for approval functions
const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
]);

// Safe transaction data
interface SafeTransaction {
  to: string;
  value: bigint;
  data: string;
  operation: number; // 0 for CALL, 1 for DELEGATECALL
}

/**
 * Result from approval check
 */
export interface ApprovalStatus {
  hasAllApprovals: boolean;
  missingApprovals: string[];
  approvals: {
    CTF_EXCHANGE: boolean;
    NEG_RISK_CTF_EXCHANGE: boolean;
    NEG_RISK_ADAPTER: boolean;
  };
  balance: string; // USDC.e balance
}

/**
 * Convert ethers Signer to viem WalletClient
 */
async function signerToWalletClient(signer: Signer): Promise<WalletClient> {
  const address = await signer.getAddress();

  const walletClient = createWalletClient({
    account: {
      address: address as `0x${string}`,
      async signMessage({ message }: { message: string | { raw: Uint8Array | `0x${string}` } }) {
        if (typeof message === 'string') {
          return await signer.signMessage(message) as `0x${string}`;
        }
        const raw = message.raw;
        const messageBytes = typeof raw === 'string'
          ? raw
          : '0x' + Buffer.from(raw).toString('hex');
        return await signer.signMessage(messageBytes) as `0x${string}`;
      },
      async signTypedData(typedData: any) {
        const { domain, types, primaryType, message } = typedData;
        const { EIP712Domain, ...typesWithoutDomain } = types;
        return await signer._signTypedData(domain, typesWithoutDomain, message) as `0x${string}`;
      },
      async signTransaction() {
        throw new Error('Transaction signing not supported');
      },
    } as any,
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  return walletClient;
}

/**
 * Create HMAC signature for Builder API authentication
 */
function buildHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body: string = ''
): string {
  const crypto = require('crypto');
  const message = `${timestamp}${method}${requestPath}${body}`;
  const base64Secret = Buffer.from(secret, 'base64');

  return crypto
    .createHmac('sha256', base64Secret)
    .update(message)
    .digest('base64');
}

/**
 * Check Safe wallet's USDC.e approvals for Polymarket contracts
 */
export async function checkSafeApprovals(
  safeAddress: string
): Promise<ApprovalStatus> {
  logger.info('Checking Safe approvals', { safeAddress });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  try {
    // Check USDC.e balance
    const balance = await publicClient.readContract({
      address: USDC_E,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [safeAddress as `0x${string}`],
    });

    // Check approvals for all three contracts
    const [ctfAllowance, negRiskAllowance, adapterAllowance] = await Promise.all([
      publicClient.readContract({
        address: USDC_E,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [safeAddress as `0x${string}`, POLYMARKET_CONTRACTS.CTF_EXCHANGE as `0x${string}`],
      }),
      publicClient.readContract({
        address: USDC_E,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [safeAddress as `0x${string}`, POLYMARKET_CONTRACTS.NEG_RISK_CTF_EXCHANGE as `0x${string}`],
      }),
      publicClient.readContract({
        address: USDC_E,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [safeAddress as `0x${string}`, POLYMARKET_CONTRACTS.NEG_RISK_ADAPTER as `0x${string}`],
      }),
    ]);

    // Check if allowances are sufficient (> $1M or unlimited)
    const MIN_ALLOWANCE = BigInt(1000000 * 1e6); // $1M in USDC.e (6 decimals)

    const approvals = {
      CTF_EXCHANGE: ctfAllowance >= MIN_ALLOWANCE,
      NEG_RISK_CTF_EXCHANGE: negRiskAllowance >= MIN_ALLOWANCE,
      NEG_RISK_ADAPTER: adapterAllowance >= MIN_ALLOWANCE,
    };

    const missingApprovals = [];
    if (!approvals.CTF_EXCHANGE) missingApprovals.push('CTF_EXCHANGE');
    if (!approvals.NEG_RISK_CTF_EXCHANGE) missingApprovals.push('NEG_RISK_CTF_EXCHANGE');
    if (!approvals.NEG_RISK_ADAPTER) missingApprovals.push('NEG_RISK_ADAPTER');

    const status: ApprovalStatus = {
      hasAllApprovals: missingApprovals.length === 0,
      missingApprovals,
      approvals,
      balance: (Number(balance) / 1e6).toFixed(2), // Convert to USDC string
    };

    logger.info('Approval check complete', {
      safeAddress,
      hasAllApprovals: status.hasAllApprovals,
      missingCount: missingApprovals.length,
      balance: status.balance,
    });

    return status;

  } catch (error) {
    logger.errorWithStack('Failed to check approvals', error, { safeAddress });
    throw error;
  }
}

/**
 * Set USDC.e approvals for Polymarket contracts via gasless Safe transaction
 *
 * @param safeAddress - Address of the Safe wallet
 * @param eoaSigner - Signer for the EOA that controls the Safe
 * @param contractsToApprove - List of contract names to approve (defaults to all)
 */
export async function setSafeApprovals(
  safeAddress: string,
  eoaSigner: Signer,
  contractsToApprove: Array<keyof typeof POLYMARKET_CONTRACTS> = ['CTF_EXCHANGE', 'NEG_RISK_CTF_EXCHANGE', 'NEG_RISK_ADAPTER']
): Promise<{
  approved: string[];
  failed: string[];
  transactionHashes: string[];
}> {
  logger.info('Setting Safe approvals', {
    safeAddress,
    contractsToApprove
  });

  const approved: string[] = [];
  const failed: string[] = [];
  const transactionHashes: string[] = [];

  try {
    // Convert ethers signer to viem wallet client
    const walletClient = await signerToWalletClient(eoaSigner);

    // Initialize Polymarket Relay Client
    const relayClient = new RelayClient(
      BUILDER_RELAYER_URL,
      137, // Polygon chain ID
      walletClient,
      {
        getAuthHeaders: (method: string, path: string, body?: string) => {
          const timestamp = Math.floor(Date.now() / 1000);
          const signature = buildHmacSignature(
            BUILDER_API_SECRET,
            timestamp,
            method,
            path,
            body
          );

          return {
            'POLY-BUILDER-API-KEY': BUILDER_API_KEY,
            'POLY-BUILDER-SIGNATURE': signature,
            'POLY-BUILDER-TIMESTAMP': timestamp.toString(),
            'POLY-BUILDER-PASSPHRASE': BUILDER_API_PASSPHRASE,
          };
        },
      }
    );

    // Process each approval
    for (const contractName of contractsToApprove) {
      const contractAddress = POLYMARKET_CONTRACTS[contractName];

      logger.info(`Approving ${contractName}`, {
        safeAddress,
        contractAddress
      });

      try {
        // Encode approval transaction data
        const approvalData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contractAddress as `0x${string}`, maxUint256],
        });

        // Create Safe transaction
        const safeTransaction: SafeTransaction = {
          to: USDC_E,
          value: BigInt(0),
          data: approvalData,
          operation: 0, // CALL
        };

        // Execute via Builder Program (gasless)
        const result = await relayClient.executeTransaction(
          safeAddress,
          safeTransaction
        );

        const txHash = result.transactionHash || result.txHash;

        if (txHash) {
          transactionHashes.push(txHash);
          approved.push(contractName);

          logger.info(`Approval transaction sent for ${contractName}`, {
            safeAddress,
            contractAddress,
            transactionHash: txHash
          });
        } else {
          failed.push(contractName);
          logger.warn(`No transaction hash for ${contractName} approval`);
        }

      } catch (error) {
        failed.push(contractName);
        logger.errorWithStack(`Failed to approve ${contractName}`, error, {
          safeAddress,
          contractAddress
        });
      }
    }

    logger.info('Approval setting complete', {
      safeAddress,
      approved: approved.length,
      failed: failed.length
    });

    return {
      approved,
      failed,
      transactionHashes,
    };

  } catch (error) {
    logger.errorWithStack('Failed to set approvals', error, { safeAddress });
    throw error;
  }
}

/**
 * Ensure Safe has all required approvals, setting them if needed
 *
 * @param safeAddress - Address of the Safe wallet
 * @param eoaSigner - Signer for the EOA that controls the Safe
 * @returns True if all approvals are set (either already existed or newly set)
 */
export async function ensureSafeApprovals(
  safeAddress: string,
  eoaSigner: Signer
): Promise<boolean> {
  logger.info('Ensuring Safe has all approvals', { safeAddress });

  try {
    // Check current approval status
    const status = await checkSafeApprovals(safeAddress);

    if (status.hasAllApprovals) {
      logger.info('Safe already has all approvals', {
        safeAddress,
        balance: status.balance
      });
      return true;
    }

    // Set missing approvals
    logger.info('Setting missing approvals', {
      safeAddress,
      missingApprovals: status.missingApprovals
    });

    const result = await setSafeApprovals(
      safeAddress,
      eoaSigner,
      status.missingApprovals as Array<keyof typeof POLYMARKET_CONTRACTS>
    );

    // Check if all were approved
    const allApproved = result.failed.length === 0;

    if (allApproved) {
      logger.info('All approvals set successfully', {
        safeAddress,
        approved: result.approved,
        transactionHashes: result.transactionHashes
      });
    } else {
      logger.warn('Some approvals failed', {
        safeAddress,
        approved: result.approved,
        failed: result.failed
      });
    }

    return allApproved;

  } catch (error) {
    logger.errorWithStack('Failed to ensure approvals', error, { safeAddress });
    return false;
  }
}