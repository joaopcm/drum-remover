import { Slider as BaseSlider } from "@base-ui-components/react/slider";
import { cn } from "@renderer/lib/utils";

interface SliderProps {
  accentClassName?: string;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  max?: number;
  min?: number;
  onValueChange?: (value: number) => void;
  step?: number;
  value: number;
}

/**
 * Single-value slider built on Base UI. `accentClassName` tints the filled
 * track and thumb so each channel can wear its own color (amber drums / blue
 * rest); it defaults to the foreground color.
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  className,
  accentClassName = "bg-foreground",
  disabled,
  "aria-label": ariaLabel,
}: SliderProps) {
  return (
    <BaseSlider.Root
      className={cn(
        "relative flex w-full min-w-0 flex-1 touch-none select-none items-center",
        className
      )}
      disabled={disabled}
      max={max}
      min={min}
      onValueChange={(next) => onValueChange?.(next as number)}
      step={step}
      value={value}
    >
      <BaseSlider.Control
        aria-label={ariaLabel}
        className="flex w-full cursor-pointer items-center py-2"
      >
        <BaseSlider.Track className="relative h-1.5 w-full rounded-full bg-border">
          <BaseSlider.Indicator
            className={cn("h-full rounded-full", accentClassName)}
          />
          <BaseSlider.Thumb
            className={cn(
              "size-3.5 rounded-full shadow-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-rest focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[dragging]:scale-110",
              accentClassName
            )}
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
