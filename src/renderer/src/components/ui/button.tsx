import { cn } from "@renderer/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] font-medium text-sm outline-none transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out-quart)] focus-visible:ring-2 focus-visible:ring-rest/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-10 px-4 py-2",
        icon: "size-10",
        iconSm: "size-8",
        lg: "h-12 px-6 text-base",
        sm: "h-8 px-3",
      },
      variant: {
        default:
          "bg-drum text-background shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-8px_var(--color-drum)] hover:bg-drum/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        ghost: "text-muted hover:bg-white/[0.07] hover:text-foreground",
        secondary:
          "border border-border bg-white/[0.02] text-foreground hover:border-border-strong hover:bg-elevated",
      },
    },
  }
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ size, variant }), className)}
      type={type}
      {...props}
    />
  );
}

export { buttonVariants };
