export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(0,245,255,0.2)] bg-[rgba(10,10,15,0.95)] backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <span
                className="text-3xl font-bold tracking-wider neon-text-cyan flicker"
                style={{ fontFamily: "var(--font-display)" }}
              >
                POLY
              </span>
              <span
                className="text-3xl font-bold tracking-wider neon-text-magenta"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ACCA
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <NavLink active>Markets</NavLink>
            <NavLink>Sports</NavLink>
            <NavLink>Politics</NavLink>
            <NavLink>Crypto</NavLink>
            <NavLink>Culture</NavLink>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button className="retro-btn px-4 py-2 text-sm text-[#00f5ff] border-[#00f5ff] rounded hover:bg-[rgba(0,245,255,0.1)]">
              Connect Wallet
            </button>
          </div>
        </div>
      </div>

      {/* Decorative bottom border glow */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-[#00f5ff] to-transparent opacity-50" />
    </header>
  );
}

function NavLink({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <a
      href="#"
      className={`
        text-sm font-medium uppercase tracking-wider transition-all duration-300
        ${
          active
            ? "text-[#00f5ff] neon-text-cyan"
            : "text-[#8888aa] hover:text-[#00f5ff]"
        }
      `}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </a>
  );
}
