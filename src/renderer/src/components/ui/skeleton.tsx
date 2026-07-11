import { cn } from "@renderer/lib/utils";
import type { ComponentProps } from "react";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-border/60", className)}
      {...props}
    />
  );
}
