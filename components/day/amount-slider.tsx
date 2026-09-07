"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Matches the thumb width in `.amount-slider` (styles/globals.css). */
const THUMB_WIDTH_PX = 28;

export interface AmountSliderProps {
  /** Goal title, used to label the control for assistive technology. */
  label: string;
  /** Committed total for the day. */
  value: number;
  /** Goal target, which is also the right end of the track. */
  target: number;
  step: number;
  unitLabel: string;
  disabled: boolean;
  /** Fired once per drag, on release, with the new absolute total. */
  onCommit: (nextValue: number) => void;
}

/**
 * A 0 -> target drag track for an amount goal, with the live value in a
 * bubble above the thumb. Dragging picks an absolute total; the caller turns
 * that into the signed delta the ledger actually stores.
 */
export function AmountSlider({
  label,
  value,
  target,
  step,
  unitLabel,
  disabled,
  onCommit,
}: AmountSliderProps) {
  const [draft, setDraft] = useState(value);
  const draggingRef = useRef(false);
  const committedRef = useRef(value);

  /*
   * The committed total wins whenever the member is not mid-drag. It can
   * differ from what we asked for: the server floors corrections at zero, and
   * a failed request rolls the optimistic total back.
   */
  useEffect(() => {
    committedRef.current = value;
    if (!draggingRef.current) {
      setDraft(value);
    }
  }, [value]);

  // A total logged before the target changed (or logged with the steppers)
  // can sit past the target; keep the track long enough to represent it.
  const max = Math.max(target, value, step);
  const ratio = max > 0 ? Math.min(Math.max(draft / max, 0), 1) : 0;

  function commit() {
    draggingRef.current = false;
    if (draft === committedRef.current) {
      return;
    }

    committedRef.current = draft;
    onCommit(draft);
  }

  return (
    <div className="w-full">
      <div className="relative h-8">
        <span
          aria-hidden="true"
          className="border-border bg-card text-foreground pointer-events-none absolute bottom-0 -translate-x-1/2 rounded-full border px-3 py-1 text-sm font-semibold whitespace-nowrap shadow-sm"
          style={{
            left: `calc(${ratio * 100}% + ${(0.5 - ratio) * THUMB_WIDTH_PX}px)`,
          }}
        >
          {draft} {unitLabel}
        </span>
      </div>
      <input
        aria-label={`${label} amount`}
        aria-valuetext={`${draft} ${unitLabel}`}
        className="amount-slider"
        disabled={disabled}
        max={max}
        min={0}
        onBlur={commit}
        onChange={(event) => {
          draggingRef.current = true;
          setDraft(Number(event.target.value));
        }}
        onKeyUp={commit}
        onLostPointerCapture={commit}
        onPointerUp={commit}
        step={step}
        style={{ "--amount-slider-fill": `${ratio * 100}%` } as CSSProperties}
        type="range"
        value={draft}
      />
      <div className="text-muted flex justify-between text-xs">
        <span>0</span>
        <span>
          {max} {unitLabel}
        </span>
      </div>
    </div>
  );
}
