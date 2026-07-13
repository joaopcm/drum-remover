import { AlertDialog as BaseAlertDialog } from "@base-ui-components/react/alert-dialog";
import { cn } from "@renderer/lib/utils";
import type { ComponentProps } from "react";

export const AlertDialog = BaseAlertDialog.Root;
export const AlertDialogTrigger = BaseAlertDialog.Trigger;
export const AlertDialogClose = BaseAlertDialog.Close;

export function AlertDialogPopup({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Popup>) {
  return (
    <BaseAlertDialog.Portal>
      <BaseAlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[3px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseAlertDialog.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-border-strong bg-card p-6 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] transition-all duration-200 ease-[var(--ease-out-quart)] data-[ending-style]:scale-[0.97] data-[starting-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </BaseAlertDialog.Popup>
    </BaseAlertDialog.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Title>) {
  return (
    <BaseAlertDialog.Title
      className={cn("font-semibold text-lg tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Description>) {
  return (
    <BaseAlertDialog.Description
      className={cn("mt-1 text-muted text-sm", className)}
      {...props}
    />
  );
}
