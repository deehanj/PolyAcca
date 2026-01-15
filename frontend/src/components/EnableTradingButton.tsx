/**
 * Button component for enabling Polymarket trading
 */

import { useState, useEffect } from 'react';
import { Check, Loader2, AlertCircle, Layers, ExternalLink } from 'lucide-react';
import { Button } from './ui/Button';
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from './ui/Dialog';
import { usePolymarketCredentials } from '../hooks/usePolymarketCredentials';
import { useAuth } from '../hooks/useAuth';

interface EnableTradingButtonProps {
  hasCredentials?: boolean;
  onSuccess?: () => void;
  className?: string;
}

export function EnableTradingButton({
  hasCredentials = false,
  onSuccess,
  className,
}: EnableTradingButtonProps) {
  const { isAuthenticated } = useAuth();
  const { isLoading, error, canDerive, deriveAndSaveCredentials, reset } = usePolymarketCredentials();
  const [showSuccess, setShowSuccess] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);

  const isNotRegistered = error?.includes('polymarket.com');

  // Show modal when not registered error occurs
  useEffect(() => {
    if (isNotRegistered) {
      setShowRegistrationModal(true);
    }
  }, [isNotRegistered]);

  const handleCloseModal = () => {
    setShowRegistrationModal(false);
    reset();
  };

  const handleClick = async () => {
    try {
      await deriveAndSaveCredentials('EOA');
      setShowSuccess(true);
      onSuccess?.();
      setTimeout(() => setShowSuccess(false), 3000);
    } catch {
      // Error is handled by the hook
    }
  };

  // Already has credentials
  if (hasCredentials) {
    return (
      <Button variant="outline" className={className} disabled>
        <Check className="h-4 w-4" />
        Trading Enabled
      </Button>
    );
  }

  // Just successfully enabled
  if (showSuccess) {
    return (
      <Button variant="primary" className={className} disabled>
        <Check className="h-4 w-4" />
        Trading Enabled!
      </Button>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <Button variant="outline" className={className} disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting to Polymarket...
      </Button>
    );
  }

  // Error state (non-registration errors)
  if (error && !isNotRegistered) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="destructive" className={className} onClick={handleClick} disabled={!canDerive}>
          <AlertCircle className="h-4 w-4" />
          Retry
        </Button>
        <span className="text-xs text-muted-foreground">{error}</span>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <Button variant="outline" className={className} disabled>
        Connect Wallet First
      </Button>
    );
  }

  // Ready
  return (
    <>
      <Dialog open={showRegistrationModal} onClose={handleCloseModal}>
        <DialogTitle>Register with Polymarket</DialogTitle>
        <DialogDescription>
          Your wallet isn't registered with Polymarket yet. Before you can trade through PolyAcca,
          you'll need to enable trading on Polymarket first.
        </DialogDescription>
        <div className="mb-4 rounded-md border border-border bg-muted/50 p-3 text-sm">
          <p className="font-medium text-foreground">How to register:</p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
            <li>Go to Polymarket and connect your wallet</li>
            <li>Click "Enable Trading" and sign the message</li>
            <li>Return here and try again</li>
          </ol>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseModal}>
            Cancel
          </Button>
          <a
            href="https://polymarket.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ExternalLink className="h-4 w-4" />
            Go to Polymarket
          </a>
        </DialogFooter>
      </Dialog>

      <Button variant="primary" className={className} onClick={handleClick} disabled={!canDerive}>
        <Layers className="h-4 w-4" />
        Enable Trading
      </Button>
    </>
  );
}
