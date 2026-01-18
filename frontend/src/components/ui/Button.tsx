import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center font-medium rounded-sm", // Less rounded
          "transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",

          // Size variants
          {
            sm: "h-8 px-3 text-sm gap-1.5",
            md: "h-10 px-4 text-sm gap-2",
            lg: "h-12 px-6 text-base gap-2",
            icon: "h-9 w-9 p-0",
          }[size],

          // Color variants
          {
            primary: [
              "bg-primary text-primary-foreground",
              "hover:bg-[var(--accent-hover)] hover:shadow-[var(--glow-sm)]",
            ],
            secondary: [
              "bg-secondary text-secondary-foreground",
              "hover:bg-[var(--background-hover)]",
            ],
            outline: [
              "border border-border bg-transparent text-foreground",
              "hover:border-[var(--border-accent)] hover:text-primary",
            ],
            ghost: [
              "bg-transparent text-foreground",
              "hover:bg-secondary hover:text-foreground",
            ],
            destructive: [
              "bg-destructive text-white",
              "hover:bg-destructive/90",
            ],
          }[variant],

          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
