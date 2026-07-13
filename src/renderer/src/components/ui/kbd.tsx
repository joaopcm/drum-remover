import { cn } from "@renderer/lib/utils";
import type { ComponentProps } from "react";

/**
 * Renders a keyboard shortcut hint as a row of individual key caps. Pass the
 * shortcut as tokens, e.g. `<Kbd keys={["mod", "enter"]} />`. `mod` renders as
 * ⌘ on macOS and Ctrl elsewhere so the same call site stays correct per
 * platform.
 */
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad|od)/.test(navigator.platform);

const TOKEN_LABELS: Record<string, string> = {
  alt: IS_MAC ? "⌥" : "Alt",
  cmd: "⌘",
  ctrl: IS_MAC ? "⌃" : "Ctrl",
  down: "↓",
  enter: "⏎",
  esc: "Esc",
  left: "←",
  mod: IS_MAC ? "⌘" : "Ctrl",
  right: "→",
  shift: "⇧",
  space: "Space",
  up: "↑",
};

interface KbdProps extends ComponentProps<"kbd"> {
  keys: string[];
}

export function Kbd({ keys, className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex select-none items-center gap-0.5 font-sans",
        className
      )}
      {...props}
    >
      {keys.map((token, index) => (
        <span
          // Caps derive their tint from the surrounding text color so the same
          // component reads correctly on dark chrome and the amber button.
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-current/20 bg-current/10 px-1 font-medium text-[11px] leading-none opacity-90"
          // Order is meaningful (⌘ then ⏎) and tokens can repeat, so the index
          // is part of a stable key for this fixed, tiny list.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional key caps
          key={`${token}-${index}`}
        >
          {TOKEN_LABELS[token] ?? token.toUpperCase()}
        </span>
      ))}
    </kbd>
  );
}
