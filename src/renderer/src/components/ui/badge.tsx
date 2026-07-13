import { cn } from "@renderer/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium font-mono text-[10px] uppercase leading-none tracking-[0.08em]",
  {
    defaultVariants: {
      tone: "neutral",
    },
    variants: {
      tone: {
        destructive: "bg-destructive/12 text-destructive",
        drum: "bg-drum/12 text-drum",
        neutral: "bg-white/[0.05] text-muted",
        rest: "bg-rest/12 text-rest",
      },
    },
  }
);

const DOT_TONE: Record<string, string> = {
  destructive: "bg-destructive",
  drum: "bg-drum",
  neutral: "bg-faint",
  rest: "bg-rest",
};

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Show a leading status dot. Animates while `pulse` is set. */
    dot?: boolean;
    pulse?: boolean;
  };

export function Badge({
  className,
  tone,
  dot,
  pulse,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            DOT_TONE[tone ?? "neutral"],
            pulse && "animate-pulse"
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
