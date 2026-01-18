import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          // Base styles
          "flex h-10 w-full rounded-sm border bg-transparent px-3 py-2", // Less rounded (rounded-sm)
          "text-sm text-foreground placeholder:text-muted-foreground",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",

          // Border & focus styles
          "border-input",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent",

          // Hover
          "hover:border-[var(--border-hover)]",

          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",

          // Error state
          error && "border-destructive focus-visible:ring-destructive",

          // File input styling
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",

          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          // Base styles
          "flex min-h-[80px] w-full rounded-sm border bg-transparent px-3 py-2", // Less rounded (rounded-sm)
          "text-sm text-foreground placeholder:text-muted-foreground",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",

          // Border & focus styles
          "border-input",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent",

          // Hover
          "hover:border-[var(--border-hover)]",

          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",

          // Error state
          error && "border-destructive focus-visible:ring-destructive",

          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export { Input, Textarea };
