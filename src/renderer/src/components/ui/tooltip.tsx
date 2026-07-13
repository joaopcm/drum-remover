import { Tooltip as BaseTooltip } from "@base-ui-components/react/tooltip";
import { cn } from "@renderer/lib/utils";
import type { ReactElement, ReactNode } from "react";
import { Kbd } from "./kbd";

export const TooltipProvider = BaseTooltip.Provider;

interface TooltipProps {
  children: ReactElement<Record<string, unknown>>;
  className?: string;
  /** Optional shortcut tokens shown as key caps next to the label. */
  keys?: string[];
  label: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Lightweight label tooltip that can carry a keyboard shortcut hint, so
 * icon-only controls advertise their shortcut on hover. Wrap the app once in
 * `TooltipProvider` for shared open/close timing.
 */
export function Tooltip({
  children,
  label,
  keys,
  side = "bottom",
  className,
}: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={8}>
          <BaseTooltip.Popup
            className={cn(
              "z-50 flex origin-[var(--transform-origin)] items-center gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-elevated px-2 py-1 font-medium text-foreground text-xs shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] transition-all duration-150 ease-[var(--ease-out-quart)] data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
              className
            )}
          >
            {label}
            {keys ? <Kbd className="text-muted" keys={keys} /> : null}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
