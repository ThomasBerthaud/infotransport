/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Editable ARIA combobox keeps focus in its input and presents rich, labelled listbox options; native select cannot provide this interaction. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
export type Suggestion = { value: string; label: string; detail?: string; visualLabel?: ReactNode };
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export function Autocomplete({
  id,
  value,
  onChange,
  onSelect,
  options,
  label,
  helpId,
  placeholder,
  loading = false,
  disabled = false,
  emptyText = 'Aucune suggestion.',
  onFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (option: Suggestion) => void;
  options: Suggestion[];
  label: string;
  helpId?: string;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  emptyText?: string;
  onFocus?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && active >= 0) selected.current?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);
  const matches = options
    .filter((option) => {
      const needle = normalize(value);
      if (!needle) return true;
      if (needle.length === 1) return normalize(option.label).startsWith(needle);
      const haystack = normalize(`${option.label} ${option.value} ${option.detail || ''}`);
      return needle.split(' ').every((term) => haystack.includes(term));
    })
    .slice(0, 20);
  const choose = (option: Suggestion) => {
    onSelect(option);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className="autocomplete">
      <input
        id={id}
        role="combobox"
        aria-label={label}
        aria-describedby={helpId}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          onFocus?.();
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              matches.length
                ? index < 0
                  ? event.key === 'ArrowDown'
                    ? 0
                    : matches.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length
                : 0,
            );
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (matches[active < 0 ? 0 : active]) choose(matches[active < 0 ? 0 : active]);
          }
        }}
      />
      {open && (
        <div className="autocomplete-menu">
          <div id={`${id}-list`} role="listbox" aria-label={`Suggestions : ${label}`}>
            {matches.map((option, index) => (
              <div
                id={`${id}-option-${index}`}
                key={option.value}
                ref={index === active ? selected : undefined}
                role="option"
                tabIndex={-1}
                aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    choose(option);
                  }
                }}
              >
                <strong>{option.visualLabel ?? option.label}</strong>
                {option.detail && <small>{option.detail}</small>}
              </div>
            ))}
          </div>
          {!matches.length && (
            <output className="autocomplete-feedback">
              {loading ? 'Chargement des suggestions…' : emptyText}
            </output>
          )}
        </div>
      )}
    </div>
  );
}
