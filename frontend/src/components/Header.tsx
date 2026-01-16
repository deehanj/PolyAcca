import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { AuthButton } from "./AuthButton";
import { EnableTradingButton } from "./EnableTradingButton";
import { RingCounter } from "./RingCounter";
import { useUserProfile } from "../hooks/useUserProfile";
import { useAuth } from "../hooks/useAuth";

export function Header() {
  const { isAdmin, profile, refetch } = useUserProfile();
  const { isAuthenticated } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1">
            <span className="text-2xl font-bold tracking-tight text-primary">
              POLY
            </span>
            <span className="text-2xl font-bold tracking-tight text-foreground">
              ACCA
            </span>
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <RingCounter />
            <Link
              to="/design"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Design
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            )}
            {isAuthenticated && (
              <EnableTradingButton
                hasCredentials={profile?.hasCredentials}
                onSuccess={refetch}
              />
            )}
            <AuthButton />
          </div>
        </div>
      </div>

      {/* Decorative bottom border glow */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    </header>
  );
}
