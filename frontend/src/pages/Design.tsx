import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Zap, Trophy, Sparkles, Activity, Flame, Share2, Users, Clock } from "lucide-react";
import logoImage from "../assets/coins_cropped.png";

export function DesignPage() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-[var(--sonic-blue)]/5 to-transparent" />
        <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-[var(--color-purple)]/5 rounded-full blur-[80px]" />
      </div>

      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-xl z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-[var(--primary)]">POLY</span>
              <span className="text-foreground">ACCA</span>
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              Design System 2.0
            </Badge>
          </div>
          <a
            href="/"
            className="text-xs font-medium text-muted-foreground hover:text-[var(--primary)] transition-colors uppercase tracking-wider"
          >
            Back to App
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 space-y-20">
        {/* Intro */}
        <section className="text-center py-10">
          <h1 className="text-5xl font-bold mb-6 text-gradient-sonic">
            Retro-DeFi Fusion
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A design language blending 90s arcade nostalgia with modern DeFi sleekness.
            Featuring Sonic-inspired colors, pixel typography, and glassmorphic interfaces.
          </p>
        </section>

        {/* Colors Section */}
        <section>
          <SectionHeader
            title="Sonic Palette"
            description="High-energy primary colors inspired by classic gaming zones."
          />

          <div className="space-y-8">
            {/* Primary Brand */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                Brand Core
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch
                  name="Sonic Blue"
                  value="#1E90FF"
                  variable="--sonic-blue"
                  className="bg-[var(--sonic-blue)]"
                />
                <ColorSwatch
                  name="Ring Gold"
                  value="#FFD700"
                  variable="--ring-gold"
                  className="bg-[var(--ring-gold)]"
                />
                <ColorSwatch
                  name="Ring Gold Bright"
                  value="#FFEA00"
                  variable="--ring-gold-bright"
                  className="bg-[var(--ring-gold-bright)]"
                />
                <ColorSwatch
                  name="Background"
                  value="#0D1520"
                  variable="--background"
                  className="bg-[var(--background)]"
                />
              </div>
            </div>

            {/* Semantic Zones */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                Game Zones (Semantic)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch
                  name="Green Hill (Success)"
                  value="#32CD32"
                  variable="--color-success"
                  className="bg-[var(--color-success)]"
                />
                <ColorSwatch
                  name="Checkered (Warning)"
                  value="#FF8C00"
                  variable="--color-warning"
                  className="bg-[var(--color-warning)]"
                />
                <ColorSwatch
                  name="Classic Red (Error)"
                  value="#FF4444"
                  variable="--color-error"
                  className="bg-[var(--color-error)]"
                />
                <ColorSwatch
                  name="Sky Blue (Info)"
                  value="#87CEEB"
                  variable="--sky-blue"
                  className="bg-[var(--sky-blue)] text-black"
                />
              </div>
            </div>

            {/* DeFi Accents */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                DeFi Accents
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch
                  name="Electric Purple"
                  value="#A855F7"
                  variable="--electric-purple"
                  className="bg-[var(--electric-purple)]"
                />
                <ColorSwatch
                  name="Hot Pink"
                  value="#EC4899"
                  variable="--hot-pink"
                  className="bg-[var(--hot-pink)]"
                />
                <ColorSwatch
                  name="Cyber Cyan"
                  value="#22D3EE"
                  variable="--cyber-cyan"
                  className="bg-[var(--cyber-cyan)] text-black"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Typography Section */}
        <section>
          <SectionHeader
            title="Typography"
            description="Geist for clarity, Silkscreen for retro flavor."
          />

          <div className="space-y-8">
            {/* Font Families */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Sans Serif (Geist)
                </h3>
                <div className="p-6 rounded-xl border border-border bg-card">
                  <p className="text-4xl font-bold mb-2">Predict The Future</p>
                  <p className="text-xl text-muted-foreground">
                    The quick brown fox jumps over the lazy dog.
                  </p>
                  <p className="text-xs font-mono mt-4 text-muted-foreground">
                    --font-sans
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Pixel / Arcade (Silkscreen)
                </h3>
                <div className="p-6 rounded-xl border border-border bg-card">
                  <p className="text-3xl font-pixel mb-2 text-[var(--primary)]">
                    PRESS START
                  </p>
                  <p className="text-xl font-pixel text-muted-foreground">
                    INSERT COIN TO CONTINUE
                  </p>
                  <p className="text-xs font-mono mt-4 text-muted-foreground">
                    --font-pixel
                  </p>
                </div>
              </div>
            </div>

            {/* Text Gradients */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                Text Gradients
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-xl border border-border bg-card">
                  <h2 className="text-3xl font-bold text-gradient-sonic mb-2">Sonic Speed</h2>
                  <p className="text-xs font-mono text-muted-foreground">.text-gradient-sonic</p>
                </div>
                <div className="p-6 rounded-xl border border-border bg-card">
                  <h2 className="text-3xl font-bold text-gradient-gold mb-2">Golden Rings</h2>
                  <p className="text-xs font-mono text-muted-foreground">.text-gradient-gold</p>
                </div>
                <div className="p-6 rounded-xl border border-border bg-card">
                  <h2 className="text-3xl font-bold text-gradient-defi mb-2">DeFi Future</h2>
                  <p className="text-xs font-mono text-muted-foreground">.text-gradient-defi</p>
                </div>
                <div className="p-6 rounded-xl border border-border bg-card">
                  <h2 className="text-3xl font-bold text-gradient-neon mb-2">Neon Nights</h2>
                  <p className="text-xs font-mono text-muted-foreground">.text-gradient-neon</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Effects Section */}
        <section>
          <SectionHeader
            title="Effects & Atmosphere"
            description="Glows, glass, and speed lines."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Glows */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Neon Glows
              </h3>
              <div className="flex flex-col gap-6">
                <div className="h-16 rounded-lg bg-[var(--background-elevated)] border border-[var(--primary)] shadow-[var(--glow)] flex items-center justify-center text-[var(--primary)] font-bold">
                  Blue Glow
                </div>
                <div className="h-16 rounded-lg bg-[var(--background-elevated)] border border-[var(--ring-gold)] shadow-[var(--glow-gold)] flex items-center justify-center text-[var(--ring-gold)] font-bold">
                  Gold Glow
                </div>
                <div className="h-16 rounded-lg bg-[var(--background-elevated)] border border-[var(--electric-purple)] shadow-[var(--glow-purple)] flex items-center justify-center text-[var(--electric-purple)] font-bold">
                  Purple Glow
                </div>
              </div>
            </div>

            {/* Glass Cards */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Glassmorphism
              </h3>
              <div className="relative h-64 rounded-xl overflow-hidden bg-[url('https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80')] bg-cover">
                <div className="absolute inset-0 bg-black/60" />
                <div className="absolute inset-0 flex flex-col gap-4 p-4 justify-center">
                  <div className="glass p-4 rounded-xl text-center">
                    <p className="font-bold text-white">Standard Glass</p>
                    <p className="text-xs text-white/70">.glass</p>
                  </div>
                  <div className="glass-card p-4 rounded-xl text-center">
                    <p className="font-bold text-white">Card Glass</p>
                    <p className="text-xs text-white/70">.glass-card</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Animations */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Interactions
              </h3>
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-xl border border-border bg-card speed-effect cursor-pointer text-center">
                  <p className="font-bold">Hover for Speed</p>
                  <p className="text-xs text-muted-foreground">.speed-effect</p>
                </div>
                <div className="p-4 rounded-xl border border-[var(--ring-gold)] bg-[var(--ring-gold)]/10 text-center animate-pulse">
                  <p className="font-bold text-[var(--ring-gold)]">Pulse Animation</p>
                  <p className="text-xs text-[var(--ring-gold)]/70">.animate-pulse</p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card group cursor-pointer hover:border-[var(--primary)] transition-colors">
                  <p className="font-bold group-hover:text-[var(--primary)] transition-colors">Hover Color</p>
                  <p className="text-xs text-muted-foreground">Standard transition</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* UI Components */}
        <section>
          <SectionHeader
            title="Interface Components"
            description="Building blocks for the PolyAcca experience."
          />

          <div className="space-y-12">
            {/* Buttons */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">
                Buttons
              </h3>
              <div className="flex flex-wrap gap-4 items-center">
                <Button variant="primary" size="lg" className="shadow-[var(--glow)]">
                  <Zap className="w-4 h-4 mr-2" />
                  Primary Action
                </Button>
                <Button variant="secondary" size="lg" className="shadow-[var(--glow-gold-sm)]">
                  <Trophy className="w-4 h-4 mr-2" />
                  Secondary Action
                </Button>
                <Button variant="outline" size="lg">
                  Outline Style
                </Button>
                <Button variant="ghost" size="lg">
                  Ghost Button
                </Button>
                <Button variant="destructive" size="lg">
                  Destructive
                </Button>
              </div>
            </div>

            {/* Badges */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">
                Badges
              </h3>
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="text-[var(--primary)] border-[var(--primary)]/50 bg-[var(--primary)]/10">
                  <Zap className="w-3 h-3 mr-1" />
                  SONIC
                </Badge>
                <Badge variant="secondary" className="bg-[var(--ring-gold)]/20 text-[var(--ring-gold)] border border-[var(--ring-gold)]/50">
                  <Trophy className="w-3 h-3 mr-1" />
                  GOLD TIER
                </Badge>
                <Badge variant="success" className="bg-[var(--color-success)]/20 text-[var(--color-success)] border border-[var(--color-success)]/50">
                  <Activity className="w-3 h-3 mr-1" />
                  ACTIVE
                </Badge>
                <Badge variant="outline" className="font-pixel text-[10px] tracking-widest">
                  RETRO BADGE
                </Badge>
              </div>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">
                  Market Card (Preview)
                </h3>
                <div className="glass-card rounded-xl p-5 border border-white/10 relative overflow-hidden group">
                  <div className="absolute inset-0 opacity-10 grid-bg pointer-events-none" />
                  
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <Badge variant="outline" className="border-[var(--color-accent)]/30 text-[var(--color-accent)] bg-[var(--color-accent)]/5">
                      CRYPTO
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      VOL: <span className="text-[var(--ring-gold)]">$2.4M</span>
                    </span>
                  </div>

                  <h3 className="text-lg font-medium mb-5 text-foreground leading-snug relative z-10">
                    Will Bitcoin hit $100k in 2025?
                  </h3>

                  <div className="relative h-3 bg-black/40 rounded-full overflow-hidden mb-5 border border-white/5 flex">
                    <div className="progress-yes w-[65%]" />
                    <div className="progress-no w-[35%]" />
                    <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-black/20 transform -translate-x-1/2 z-10" />
                  </div>

                  <div className="flex gap-3 relative z-10">
                    <button className="flex-1 py-3 px-3 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 flex flex-col items-center gap-1">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-success)]">YES</span>
                      <span className="text-xl font-mono font-bold text-[var(--color-success)]">65¢</span>
                    </button>
                    <button className="flex-1 py-3 px-3 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 flex flex-col items-center gap-1">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-error)]">NO</span>
                      <span className="text-xl font-mono font-bold text-[var(--color-error)]">35¢</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">
                  Stats Card
                </h3>
                <div className="glass-card rounded-xl p-6 border border-white/10 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-white/5">
                    <Sparkles className="w-6 h-6 text-[var(--ring-gold)]" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-[var(--ring-gold)] font-mono text-glow-gold">
                      $1,000,000
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                      Total Winnings
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Accumulator Components Section */}
        <section>
          <SectionHeader
            title="Accumulator Components"
            description="Specialized components for accumulator display and sharing."
          />

          <div className="space-y-12">
            {/* Trending Acca Card */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">
                Trending Acca Card
              </h3>
              <div className="w-[360px]">
                <TrendingAccaCardExample />
              </div>
            </div>

            {/* PnL Share Card */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">
                PnL Share Card
              </h3>
              <div className="max-w-md">
                <PnLShareCardExample />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-20 bg-black/20">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-muted-foreground font-mono">
          [SYSTEM.VERSION_2.0] &bull; READY PLAYER ONE
        </div>
      </footer>
    </div>
  );
}

// Helper Components

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-10 text-center md:text-left">
      <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
        {title}
        <div className="h-1 flex-1 bg-gradient-to-r from-[var(--primary)]/50 to-transparent rounded-full opacity-50 hidden md:block" />
      </h2>
      <p className="text-muted-foreground text-lg">{description}</p>
    </div>
  );
}

function ColorSwatch({
  name,
  value,
  variable,
  className,
}: {
  name: string;
  value: string;
  variable: string;
  className: string;
}) {
  return (
    <div className="group">
      <div
        className={`h-24 rounded-xl border border-white/10 shadow-lg mb-3 transition-transform group-hover:scale-105 ${className}`}
      />
      <div>
        <p className="font-bold text-sm text-white">{name}</p>
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wide">{value}</p>
        <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">{variable}</p>
      </div>
    </div>
  );
}

function TrendingAccaCardExample() {
  const totalLegs = 5;
  const completedLegs = 3;

  return (
    <div className="bg-card/80 hover:bg-card rounded-xl p-3 border border-border hover:border-[var(--color-gold)]/50 transition-all duration-200 hover:-translate-y-0.5 group">
      <div className="flex gap-3">
        {/* Square image on left */}
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted/50 shrink-0 flex items-center justify-center">
          <Flame className="w-6 h-6 text-[var(--color-gold)] opacity-30" />
        </div>

        {/* Content on right */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Title row with Players & Value */}
          <div className="flex items-start gap-2">
            <h3 className="font-bold text-sm text-foreground truncate group-hover:text-[var(--color-gold)] transition-colors flex-1">
              Trump 2024 Sweep
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-3 h-3" />
                <span className="text-xs font-mono">42</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">$2.4K</span>
            </div>
          </div>

          {/* Category tags */}
          <div className="flex flex-wrap gap-1 mt-1">
            <Badge
              variant="outline"
              size="sm"
              className="text-[9px] px-1.5 py-0 h-4 border-[var(--color-gold)]/30 text-[var(--color-gold)]"
            >
              Politics
            </Badge>
            <Badge
              variant="outline"
              size="sm"
              className="text-[9px] px-1.5 py-0 h-4 border-[var(--color-gold)]/30 text-[var(--color-gold)]"
            >
              US
            </Badge>
          </div>

          {/* Bottom section: Time & Legs on left, Multiplier on right */}
          <div className="flex items-end justify-between mt-auto">
            <div className="flex flex-col gap-1">
              {/* Time remaining */}
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-[10px] font-mono">2d 5h</span>
              </div>

              {/* Leg circles */}
              <div className="flex items-center gap-0.5">
                {Array.from({ length: totalLegs }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i < completedLegs
                        ? "bg-[var(--color-success)]"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Multiplier - right aligned */}
            <span className="text-lg font-mono font-bold text-[var(--color-gold)]">
              4.5x
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PnLShareCardExample() {
  const [showShareButtons, setShowShareButtons] = useState(false);

  return (
    <div className="space-y-4">
      {/* The PnL Card */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a1a2e] to-[#0f0f1a] p-6">
        {/* Decorative elements */}
        <div className="absolute top-4 right-4 opacity-20">
          <div className="w-24 h-24 rounded-full bg-[var(--color-gold)] blur-3xl" />
        </div>
        <div className="absolute -bottom-8 -right-8 opacity-10">
          <div className="w-32 h-32 rounded-full bg-[var(--primary)] blur-3xl" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="PolyAcca" className="w-10 h-10" />
            <div>
              <span className="text-lg font-bold text-white">
                Crypto Bull Run
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--color-success)]/20 text-[var(--color-success)]">
                  WON
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* PnL Display */}
        <div className="mb-6 relative z-10">
          <div className="text-5xl font-bold font-mono text-[var(--color-gold)]">
            +127.5%
            <span className="text-2xl ml-2">↑</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-6 relative z-10">
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide">Stake</span>
            <div className="text-xl font-mono font-bold text-white mt-1">
              $50.00
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide">Payout</span>
            <div className="text-xl font-mono font-bold text-[var(--color-success)] mt-1">
              $113.75
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6 relative z-10">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-success)]"
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Powered by</span>
            <span className="text-sm font-bold text-[var(--color-gold)]">POLYACCA.FUN</span>
          </div>
        </div>
      </div>

      {/* Share Button */}
      <Button
        onClick={() => setShowShareButtons(!showShareButtons)}
        className="w-full"
        variant="outline"
      >
        <Share2 className="w-4 h-4 mr-2" />
        {showShareButtons ? "Hide Share Options" : "Share PnL"}
      </Button>

      {/* Share Options */}
      {showShareButtons && (
        <div className="flex gap-3 animate-fade-in-up">
          <Button className="flex-1 bg-[#0088cc] hover:bg-[#0088cc]/80 text-white">
            <svg viewBox="0 0 24 24" className="w-5 h-5 mr-2" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Telegram
          </Button>
          <Button className="flex-1 bg-black hover:bg-black/80 text-white border border-white/20">
            <svg viewBox="0 0 24 24" className="w-5 h-5 mr-2" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            X (Twitter)
          </Button>
        </div>
      )}
    </div>
  );
}

export default DesignPage;
