/**
 * Button component for enabling Polymarket trading
 */

import { useState } from 'react';
import { Check, Loader2, AlertCircle, Layers } from 'lucide-react';
import { Button } from './ui/Button';
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
  const { isLoading, error, canDerive, deriveAndSaveCredentials } = usePolymarketCredentials();
  const [showSuccess, setShowSuccess] = useState(false);

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

  // Error state
  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="destructive" className={className} onClick={handleClick} disabled={!canDerive}>
          <AlertCircle className="h-4 w-4" />
          Retry Enable Trading
        </Button>
        <span className="text-xs text-destructive">{error}</span>
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
    <Button variant="primary" className={className} onClick={handleClick} disabled={!canDerive}>
      <Layers className="h-4 w-4" />
      Enable Trading
    </Button>
  );
}
