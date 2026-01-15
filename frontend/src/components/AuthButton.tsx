import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuth } from '../hooks/useAuth';

export function AuthButton() {
  const { isAuthenticated, isAuthenticating, error, authenticate } = useAuth();

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive shadow-sm transition-colors hover:bg-destructive/20"
                  >
                    Wrong Network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openChainModal}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                  >
                    {chain.hasIcon && chain.iconUrl && (
                      <img
                        alt={chain.name ?? 'Chain icon'}
                        src={chain.iconUrl}
                        className="h-4 w-4"
                      />
                    )}
                    {chain.name}
                  </button>

                  <button
                    onClick={openAccountModal}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                  >
                    {account.displayName}
                    {isAuthenticated && (
                      <span className="h-2 w-2 rounded-full bg-primary" title="Verified" />
                    )}
                  </button>

                  {!isAuthenticated && (
                    <button
                      onClick={authenticate}
                      disabled={isAuthenticating}
                      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                        error
                          ? 'border border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20'
                          : isAuthenticating
                          ? 'border border-border bg-muted text-muted-foreground cursor-not-allowed'
                          : 'border border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                    >
                      {isAuthenticating ? 'Verifying...' : error ? 'Retry' : 'Verify'}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
