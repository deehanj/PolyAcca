import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Menu, X, Layers } from "lucide-react";
import { AuthButton } from "./AuthButton";
import { TradingBalance } from "./TradingBalance";
import { useUserProfile } from "../hooks/useUserProfile";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./ui/Button";
import logoImage from "../assets/coins_cropped.png";
import { ThemeToggle } from "./ThemeToggle";

// Show Design link only on localhost or cloudfront domains
const isDevEnvironment =
  window.location.hostname === "localhost" ||
  window.location.hostname.includes("cloudfront");

export function Header() {
  const { isAdmin } = useUserProfile();
  const { isAuthenticated } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="w-full max-w-[1800px] ml-auto mr-0 px-4 md:pl-6 md:pr-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <img
              src={logoImage}
              alt="PolyAcca"
              className="h-8 w-8 object-contain group-hover:scale-110 transition-transform duration-300"
            />
            <div className="flex flex-col -space-y-1">
              <span className="text-lg font-bold tracking-tight text-foreground font-pixel leading-none">
                POLY
              </span>
              <span className="text-lg font-bold tracking-tight text-[var(--primary)] font-pixel leading-none">
                ACCA
              </span>
            </div>
          </Link>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex items-center gap-6">
              {isAuthenticated && (
                <Link
                  to="/my-chains"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Layers className="h-3.5 w-3.5" />
                  My Accas
                </Link>
              )}
              {isDevEnvironment && (
                <Link
                  to="/design"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Design
                </Link>
              )}
              {isAdmin && (
                <Link
                  to="/admin"
                  className="flex items-center gap-2 text-sm font-medium text-[var(--primary)] hover:text-[var(--primary)]/80 transition-colors bg-[var(--primary)]/5 px-3 py-1.5 rounded-full"
                >
                  <Shield className="h-3.5 w-3.5" />
                  Admin
                </Link>
              )}
            </nav>

            <div className="h-6 w-px bg-border" />
            
            <TradingBalance />
            <ThemeToggle />
            <AuthButton />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-4">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-muted-foreground hover:text-foreground p-2"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-background/95 backdrop-blur-xl border-b border-border p-6 flex flex-col gap-6 animate-in slide-in-from-top-2">
          <div className="flex flex-col gap-4">
            {isAuthenticated && (
              <Link
                to="/my-chains"
                onClick={() => setIsMenuOpen(false)}
                className="text-lg font-medium text-foreground py-2 border-b border-white/5 flex items-center gap-2"
              >
                <Layers className="h-4 w-4" />
                My Accumulators
              </Link>
            )}
            {isDevEnvironment && (
              <Link
                to="/design"
                onClick={() => setIsMenuOpen(false)}
                className="text-lg font-medium text-foreground py-2 border-b border-white/5"
              >
                Design System
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setIsMenuOpen(false)}
                className="text-lg font-medium text-[var(--primary)] py-2 border-b border-white/5 flex items-center gap-2"
              >
                <Shield className="h-4 w-4" />
                Admin Dashboard
              </Link>
            )}
          </div>
          
          <div className="flex flex-col gap-4">
            <TradingBalance />
            <AuthButton />
          </div>
        </div>
      )}

      {/* Decorative bottom border glow */}
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--primary)]/20 to-transparent" />
    </header>
  );
}
