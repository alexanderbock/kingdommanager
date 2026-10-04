import { useEffect, useState } from 'react';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
  title?: string;
  /** When set, values below this are not emitted. */
  min?: number;
}

/**
 * Integer field. `null` renders as an empty input (never as 0) and an empty
 * input reports `null`. Only whole numbers are emitted.
 */
export function NumberField({ value, onChange, className, title, min }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value));

  useEffect(() => {
    const t = value === null ? '' : String(value);
    setText((prev) => (prev === t ? prev : t));
  }, [value]);

  return (
    <input
      type="number"
      step={1}
      inputMode="numeric"
      min={min}
      title={title}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const t = raw.trim();
        if (!t) {
          onChange(null);
          return;
        }
        const n = Number(t);
        if (Number.isInteger(n) && (min === undefined || n >= min)) onChange(n);
      }}
      className={`field field-num ${className ?? ''}`}
    />
  );
}