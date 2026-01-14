import { Link } from "react-router-dom";
import { Button } from "./ui/Button";

export function Header() {
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
            <Link
              to="/design"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Design
            </Link>
            <Button variant="outline" size="sm">
              Connect Wallet
            </Button>
          </div>
        </div>
      </div>

      {/* Decorative bottom border glow */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    </header>
  );
}
