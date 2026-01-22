/**
 * Hook for fetching user profile data
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export interface UserProfile {
  walletAddress: string;
  displayName?: string;
  hasCredentials: boolean;
  createdAt: string;
  admin?: boolean;
  safeWalletAddress?: string;
}

export function useUserProfile() {
  const { isAuthenticated, getAuthHeaders } = useAuth();

  const query = useQuery({
    queryKey: ['userProfile'],
    queryFn: async (): Promise<UserProfile> => {
      if (!API_URL) throw new Error('API URL not configured');

      const response = await fetch(`${API_URL}/users/me`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch profile');
      }
      return data.data;
    },
    enabled: isAuthenticated && !!API_URL,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    error: query.error?.message || null,
    isAdmin: query.data?.admin === true,
    hasCredentials: query.data?.hasCredentials ?? false,
    safeWalletAddress: query.data?.safeWalletAddress,
    refetch: query.refetch,
  };
}
