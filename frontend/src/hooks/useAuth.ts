import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

if (!API_URL) {
  console.error(
    '[PolyAcca] VITE_API_URL is not configured. Authentication will not work.\n' +
    'Set VITE_API_URL environment variable when building the frontend.'
  );
}

interface AuthState {
  token: string | null;
  isAuthenticating: boolean;
  error: string | null;
}

export function useAuth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    isAuthenticating: false,
    error: null,
  });

  // Restore token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('polyacca_token');
    const savedAddress = localStorage.getItem('polyacca_address');

    // Only restore if address matches
    if (savedToken && savedAddress && address?.toLowerCase() === savedAddress.toLowerCase()) {
      setAuthState(prev => ({ ...prev, token: savedToken }));
    }
  }, [address]);

  // Clear token on disconnect
  useEffect(() => {
    if (!isConnected) {
      setAuthState({ token: null, isAuthenticating: false, error: null });
      localStorage.removeItem('polyacca_token');
      localStorage.removeItem('polyacca_address');
    }
  }, [isConnected]);

  // Authenticate with backend
  const authenticate = useCallback(async () => {
    if (!address || !isConnected) {
      setAuthState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return;
    }

    // Don't re-authenticate if we have a token
    if (authState.token) return;

    setAuthState(prev => ({ ...prev, isAuthenticating: true, error: null }));

    try {
      // 1. Request nonce from backend
      const nonceRes = await fetch(`${API_URL}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce');
      }

      const nonceData = await nonceRes.json();

      if (!nonceData.success) {
        throw new Error(nonceData.error || 'Failed to get nonce');
      }

      // 2. Sign the message with wallet
      const signature = await signMessageAsync({
        message: nonceData.data.message,
      });

      // 3. Verify signature with backend
      const verifyRes = await fetch(`${API_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          signature,
        }),
      });

      if (!verifyRes.ok) {
        throw new Error('Failed to verify signature');
      }

      const authData = await verifyRes.json();

      if (!authData.success) {
        throw new Error(authData.error || 'Authentication failed');
      }

      // 4. Store token
      const token = authData.data.token;
      setAuthState({ token, isAuthenticating: false, error: null });
      localStorage.setItem('polyacca_token', token);
      localStorage.setItem('polyacca_address', address.toLowerCase());

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setAuthState(prev => ({ ...prev, isAuthenticating: false, error: errorMessage }));

      // If user rejected the signature, disconnect
      if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        disconnect();
      }
    }
  }, [address, isConnected, authState.token, signMessageAsync, disconnect]);

  const logout = useCallback(() => {
    disconnect();
    setAuthState({ token: null, isAuthenticating: false, error: null });
    localStorage.removeItem('polyacca_token');
    localStorage.removeItem('polyacca_address');
  }, [disconnect]);

  // Helper to get auth headers for API calls
  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!authState.token) return {};
    return { Authorization: `Bearer ${authState.token}` };
  }, [authState.token]);

  return {
    // Wallet state
    address,
    isConnected,

    // Auth state
    isAuthenticated: !!authState.token,
    isAuthenticating: authState.isAuthenticating,
    token: authState.token,
    error: authState.error,

    // Actions
    authenticate,
    logout,
    getAuthHeaders,
  };
}
