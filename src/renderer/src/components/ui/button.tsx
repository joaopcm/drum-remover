import { cn } from "@renderer/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rest disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-10 px-4 py-2",
        icon: "size-10",
        lg: "h-12 px-6 text-base",
        sm: "h-8 px-3",
      },
      variant: {
        default: "bg-drum text-background hover:bg-drum/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        ghost: "text-foreground hover:bg-card",
        secondary:
          "border border-border bg-card text-foreground hover:bg-card/60",
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
