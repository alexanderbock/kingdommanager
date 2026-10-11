import { useEffect, useRef, type SelectHTMLAttributes } from 'react';

/** Scroll distance (px) that steps one option; one mouse-wheel notch is ~100px. */
const STEP_PX = 50;

type WheelSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Called with the next/previous option's value when the wheel turns over the select. */
  onWheelSelect: (value: string) => void;
};

/**
 * A <select> whose value can be stepped with the mouse wheel while the pointer
 * is over it (browsers don't do this for closed selects). Wheel down selects
 * the next option, wheel up the previous one; at most one option per event,
 * and small trackpad deltas accumulate until they add up to a step.
 */
export function WheelSelect({ onWheelSelect, ...props }: WheelSelectProps) {
  const ref = useRef<HTMLSelectElement>(null);
  const onWheelSelectRef = useRef(onWheelSelect);
  onWheelSelectRef.current = onWheelSelect;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pending = 0;
    // Native listener: React's onWheel is passive, so it can't stop the page
    // from scrolling while the wheel is used on the select.
    const onWheel = (e: WheelEvent) => {
      if (el.disabled) return;
      e.preventDefault();
      const scale =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 33
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? 400
            : 1;
      pending += e.deltaY * scale;
      if (Math.abs(pending) < STEP_PX) return;
      const next = el.selectedIndex + Math.sign(pending);
      pending = 0;
      if (next >= 0 && next < el.options.length) onWheelSelectRef.current(el.options[next].value);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return <select ref={ref} {...props} />;
}
