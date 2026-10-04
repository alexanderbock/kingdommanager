interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  className?: string;
}

/** Plain text input (or textarea) bound to a string field. */
export function EditableText({ value, onChange, placeholder, textarea, className }: Props) {
  if (textarea) {
    return (
      <textarea
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`field ${className ?? ''}`}
      />
    );
  }
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`field ${className ?? ''}`}
    />
  );
}