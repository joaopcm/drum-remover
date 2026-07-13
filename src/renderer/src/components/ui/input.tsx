import { cn } from "@renderer/lib/utils";
import type { ComponentProps } from "react";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-[var(--radius)] border border-border bg-background/60 px-3 py-2 text-sm outline-none transition-colors duration-150 ease-[var(--ease-out-quart)] placeholder:text-faint focus-visible:border-border-strong disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
