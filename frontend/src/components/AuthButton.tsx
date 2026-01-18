import { useAppKit, useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function AuthButton() {
  const { isAuthenticated, isAuthenticating } = useAuth();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();

  // Format address for display
  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  if (!isConnected) {
    return (
      <button
        onClick={() => open()}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Network button */}
      <button
        onClick={() => open({ view: 'Networks' })}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        {caipNetwork?.name || 'Unknown'}
      </button>

      {/* Account button */}
      <button
        onClick={() => open({ view: 'Account' })}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        {isAuthenticating && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
        {displayAddress}
        {isAuthenticated && (
          <span className="h-2 w-2 rounded-full bg-primary" title="Verified" />
        )}
      </button>
    </div>
  );
}
