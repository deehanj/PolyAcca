/**
 * Hook for deriving and managing Polymarket API credentials
 */

import { useWalletClient, useAccount } from 'wagmi';
import { useMutation } from '@tanstack/react-query';
import { Web3Provider } from '@ethersproject/providers';
import { ClobClient } from '@polymarket/clob-client';
import { useAuth } from './useAuth';
import type { WalletClient } from 'viem';

const API_URL = import.meta.env.VITE_API_URL || '';
const POLYMARKET_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

type SignatureType = 'EOA' | 'POLY_PROXY' | 'GNOSIS_SAFE';

/** Convert viem WalletClient to ethers v5 signer (required by @polymarket/clob-client) */
function walletClientToSigner(walletClient: WalletClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new Web3Provider(walletClient.transport as any);
  return provider.getSigner();
}

export function usePolymarketCredentials() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const { getAuthHeaders, isAuthenticated } = useAuth();

  const deriveMutation = useMutation({
    mutationFn: async (signatureType: SignatureType = 'EOA') => {
      if (!walletClient) throw new Error('Wallet not connected');
      if (!isAuthenticated) throw new Error('Not authenticated with PolyAcca');
      if (!API_URL) throw new Error('API URL not configured');

      // Derive credentials from wallet signature
      const signer = walletClientToSigner(walletClient);
      const client = new ClobClient(POLYMARKET_HOST, POLYGON_CHAIN_ID, signer);

      let creds;
      try {
        creds = await client.deriveApiKey();
      } catch (err: unknown) {
        // Handle axios error structure from CLOB client
        const axiosError = err as { status?: number; response?: { status?: number; data?: { error?: string } }; data?: { error?: string } };
        const status = axiosError?.status || axiosError?.response?.status;
        const dataError = axiosError?.data?.error || axiosError?.response?.data?.error;
        const message = err instanceof Error ? err.message : String(err);
        const fullError = JSON.stringify(err);

        console.log('[usePolymarketCredentials] Caught error:', { status, dataError, message, fullError });

        if (status === 400 || dataError?.includes('Could not derive api key') || message.includes('Could not derive api key') || fullError.includes('Could not derive api key')) {
          throw new Error('Wallet not registered with Polymarket. Please enable trading at polymarket.com first.');
        }
        throw err;
      }

      // Verify we got valid credentials
      if (!creds?.key || !creds?.secret || !creds?.passphrase) {
        throw new Error('Wallet not registered with Polymarket. Please enable trading at polymarket.com first.');
      }

      // Send to backend for validation and storage
      const response = await fetch(`${API_URL}/users/me/credentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          apiKey: creds.key,
          apiSecret: creds.secret,
          passphrase: creds.passphrase,
          signatureType,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save credentials');
      }
      return data;
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !API_URL) throw new Error('Not authenticated');

      const response = await fetch(`${API_URL}/users/me/credentials`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove credentials');
      }
      return data;
    },
  });

  return {
    // State
    isLoading: deriveMutation.isPending || removeMutation.isPending,
    error: deriveMutation.error?.message || removeMutation.error?.message || null,
    success: deriveMutation.isSuccess,

    // Preconditions
    canDerive: !!walletClient && isAuthenticated && !!API_URL,
    walletAddress: address,

    // Actions
    deriveAndSaveCredentials: deriveMutation.mutateAsync,
    removeCredentials: removeMutation.mutateAsync,
    reset: () => {
      deriveMutation.reset();
      removeMutation.reset();
    },
  };
}
