import { cn } from "@renderer/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium font-mono text-[11px]",
  {
    defaultVariants: {
      tone: "neutral",
    },
    variants: {
      tone: {
        destructive: "bg-destructive/15 text-destructive",
        drum: "bg-drum/15 text-drum",
        neutral: "bg-border/70 text-muted",
        rest: "bg-rest/15 text-rest",
      },
    },
  }
);

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
