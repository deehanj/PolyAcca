import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { polygon, base, mainnet, type AppKitNetwork } from '@reown/appkit/networks';

// WalletConnect project ID
export const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '8e2aabca7fd0c359bd0e27b3d9f6c220';

// Supported networks for AppKit
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [polygon, base, mainnet];

// Create WagmiAdapter for AppKit
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
});

// Export wagmi config for hooks
export const config = wagmiAdapter.wagmiConfig;

// Chain configurations for balance queries
export const SUPPORTED_CHAINS = {
  polygon: {
    id: 137,
    name: 'Polygon',
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const, // USDC.e
    nativeSymbol: 'POL',
  },
  base: {
    id: 8453,
    name: 'Base',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const, // USDC on Base
    nativeSymbol: 'ETH',
  },
  ethereum: {
    id: 1,
    name: 'Ethereum',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const, // USDC on Ethereum
    nativeSymbol: 'ETH',
  },
} as const;
