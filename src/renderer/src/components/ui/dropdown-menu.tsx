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
      <Menu.Positioner align="end" sideOffset={6}>
        <Menu.Popup
          className={cn(
            "z-50 min-w-40 origin-[var(--transform-origin)] rounded-[var(--radius)] border border-border bg-card p-1 shadow-2xl transition-all duration-150 ease-out data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
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
        "flex cursor-default items-center gap-2 rounded-[calc(var(--radius)-0.25rem)] px-2.5 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-border/60",
        className
      )}
      {...props}
    />
  );
}
