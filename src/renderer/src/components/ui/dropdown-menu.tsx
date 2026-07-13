import { Menu } from "@base-ui-components/react/menu";
import { cn } from "@renderer/lib/utils";
import type { ComponentProps } from "react";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.Popup>) {
  return (
    <Menu.Portal>
      <Menu.Positioner align="end" className="z-50" sideOffset={6}>
        <Menu.Popup
          className={cn(
            "z-50 min-w-44 origin-[var(--transform-origin)] rounded-[var(--radius)] border border-border-strong bg-elevated p-1 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.75)] transition-all duration-150 ease-[var(--ease-out-quart)] data-[ending-style]:scale-[0.97] data-[starting-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        // Base UI (rc) only sets `data-highlighted` via keyboard navigation, so
        // pointer feedback needs an explicit `:hover` alongside it.
        "flex cursor-default items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-muted text-sm outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-foreground",
        className
      )}
      {...props}
    />
  );
}
