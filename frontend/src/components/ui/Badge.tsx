import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "error";
  size?: "sm" | "md";
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          // Base styles
          "inline-flex items-center font-medium rounded-full",

          // Size variants
          {
            sm: "px-2 py-0.5 text-xs",
            md: "px-2.5 py-0.5 text-xs",
          }[size],

          // Color variants
          {
            default: "bg-primary/20 text-primary border border-primary/30",
            secondary: "bg-secondary text-secondary-foreground",
            outline: "border border-border text-foreground bg-transparent",
            success: "bg-[var(--color-success)]/20 text-[var(--color-success)] border border-[var(--color-success)]/30",
            warning: "bg-[var(--color-warning)]/20 text-[var(--color-warning)] border border-[var(--color-warning)]/30",
            error: "bg-destructive/20 text-destructive border border-destructive/30",
          }[variant],

          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
