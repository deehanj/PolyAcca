import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygon } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'PolyAcca',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '8e2aabca7fd0c359bd0e27b3d9f6c220',
  chains: [polygon],
  ssr: false,
});
