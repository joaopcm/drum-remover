import { cn } from "@renderer/lib/utils";
import type { ComponentProps } from "react";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-[var(--radius)] border border-border bg-background/60 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-quart)] placeholder:text-faint focus-visible:border-rest focus-visible:ring-2 focus-visible:ring-rest/25 disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
