import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export function ChoiceSelect({ label, options, value, placeholder, onSelect, disabled, fitViewport }) {
  const valueId = useId();
  const listId = useId();
  const root = useRef(null);
  const list = useRef(null);
  const [active, setActive] = useState(null);
  const open = active !== null;
  const selected = options.findIndex(({ id }) => id === value);
  const current = options[selected];

  useEffect(() => {
    if (!open) return;
    function closeOutside(event) {
      if (!root.current?.contains(event.target)) setActive(null);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !fitViewport) return;
    const menu = list.current;

    function fitMenu() {
      const { top, bottom } = root.current.getBoundingClientRect();
      const below = window.innerHeight - bottom;
      const above = top;
      const upward = below < 248 && above > below;
      menu.dataset.side = upward ? 'top' : 'bottom';
      menu.style.maxHeight = `${Math.min(280, Math.max(44, (upward ? above : below) - 12))}px`;
    }

    fitMenu();
    window.addEventListener('resize', fitMenu);
    window.addEventListener('scroll', fitMenu, { passive: true });
    return () => {
      window.removeEventListener('resize', fitMenu);
      window.removeEventListener('scroll', fitMenu);
    };
  }, [fitViewport, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = list.current;
    const option = menu.children[active];
    if (!option) return;

    if (option.offsetTop < menu.scrollTop) {
      menu.scrollTop = option.offsetTop;
    } else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
    }
  }, [active, open]);

  function choose(index) {
    setActive(null);
    if (options[index]) onSelect(options[index].id);
  }

  function handleKey(event) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const first = direction > 0 ? 0 : options.length - 1;
        setActive(open
          ? Math.max(0, Math.min(options.length - 1, active + direction))
          : selected < 0 ? first : selected);
        break;
      }
      case 'Home':
      case 'End':
        event.preventDefault();
        setActive(event.key === 'Home' ? 0 : options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) choose(active);
        else setActive(Math.max(0, selected));
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setActive(null);
        }
        break;
    }
  }

  return (
    <div className="choice-select" ref={root}>
      <button type="button" className="choice-trigger filter-control" role="combobox" aria-label={label}
        aria-describedby={valueId} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled || !options.length} onKeyDown={handleKey} onBlur={() => setActive(null)}
        onClick={() => setActive(open ? null : Math.max(0, selected))}>
        {current?.badge}
        <span className="choice-name" id={valueId}>{current?.name ?? placeholder}</span>
        <ChevronDown className="choice-chevron" size={16} aria-hidden="true" />
      </button>
      <ul ref={list} className="choice-options" id={listId} role="listbox" aria-label={label} hidden={!open}>
        {options.map(({ id, name, badge, indicator, description }, index) => (
          <li key={id ?? 'clear'} id={`${listId}-${index}`} role="option" aria-selected={index === selected}
            aria-description={description} className={index === active ? 'is-active' : undefined}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
            {badge}
            <span className="choice-name">{name}</span>
            {indicator}
            {index === selected && <Check className="choice-selected" size={16} aria-hidden="true" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
