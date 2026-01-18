import { createAppKit } from '@reown/appkit/react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiAdapter, projectId, networks } from '../lib/wagmi';

const queryClient = new QueryClient();

// App metadata for WalletConnect
const metadata = {
  name: 'PolyAcca',
  description: 'Polymarket Accumulator Betting',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://polyacca.com',
  icons: ['/vite.svg'],
};

// Initialize AppKit (only once)
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: false,
    onramp: true, // Enable buy crypto feature
    swaps: false,
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#10b981', // emerald-500 to match theme
    '--w3m-border-radius-master': '8px',
  },
});

interface Web3ProviderProps {
  children: React.ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
