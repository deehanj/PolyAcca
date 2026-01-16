import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

if (!API_URL) {
  console.error(
    '[PolyAcca] VITE_API_URL is not configured. Authentication will not work.\n' +
    'Set VITE_API_URL environment variable when building the frontend.'
  );
}

/**
 * Check if a JWT token is expired (with 60-second buffer)
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return true;

    // Consider expired if within 60 seconds of expiry
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now + 60;
  } catch {
    return true;
  }
}

interface AuthState {
  token: string | null;
  isAuthenticating: boolean;
  error: string | null;
}

interface AuthContextValue {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  token: string | null;
  error: string | null;
  authenticate: () => Promise<void>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
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

    // Only restore if address matches and token is not expired
    if (savedToken && savedAddress && address?.toLowerCase() === savedAddress.toLowerCase()) {
      if (isTokenExpired(savedToken)) {
        console.log('[Auth] Stored token expired, clearing');
        localStorage.removeItem('polyacca_token');
        localStorage.removeItem('polyacca_address');
      } else {
        setAuthState(prev => ({ ...prev, token: savedToken }));
      }
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

  // Auto-authenticate when wallet connects (if no token)
  useEffect(() => {
    if (isConnected && address && !authState.token && !authState.isAuthenticating) {
      authenticate();
    }
  }, [isConnected, address, authState.token, authState.isAuthenticating, authenticate]);

  const logout = useCallback(() => {
    disconnect();
    setAuthState({ token: null, isAuthenticating: false, error: null });
    localStorage.removeItem('polyacca_token');
    localStorage.removeItem('polyacca_address');
  }, [disconnect]);

  // Helper to get auth headers for API calls
  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!authState.token) return {};

    // Safety check: don't send expired tokens
    if (isTokenExpired(authState.token)) {
      console.log('[Auth] Token expired, clearing and requiring re-authentication');
      setAuthState(prev => ({ ...prev, token: null }));
      localStorage.removeItem('polyacca_token');
      localStorage.removeItem('polyacca_address');
      return {};
    }

    return { Authorization: `Bearer ${authState.token}` };
  }, [authState.token]);

  const value: AuthContextValue = {
    address,
    isConnected,
    isAuthenticated: !!authState.token,
    isAuthenticating: authState.isAuthenticating,
    token: authState.token,
    error: authState.error,
    authenticate,
    logout,
    getAuthHeaders,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
