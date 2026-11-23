import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ChoiceSelect } from '../../components/ChoiceSelect.jsx';
import { waste } from '../../content/fr.js';
import { categories, periodRange, shiftDay, validCustomRange } from './wasteData.js';
import { periodLabel } from './wasteFormat.js';

const periods = ['last7', 'week', 'last30', 'month', 'previous', 'custom'];
const categoryOptions = categories.map(({ name }) => ({ id: name, name }));

export function WasteSelect({ label, options, value, onSelect, caption = false, className = '' }) {
  return <div className={`waste-select ${className}`}>
    {caption && <span className="waste-control-caption">{label}</span>}
    <ChoiceSelect label={label} options={options} value={value} onSelect={onSelect} fitViewport />
  </div>;
}

function FilterPopover({ label, caption, filtered, disabled, onOpen, children }) {
  const id = useId();
  const trigger = useRef(null);
  const panel = useRef(null);
  const [open, setOpen] = useState(false);

  function placeMenu() {
    const { left, top, bottom, width } = trigger.current.getBoundingClientRect();
    const menu = panel.current;
    const inset = 12;
    const minWidth = onOpen ? 240 : 200;
    const menuWidth = Math.min(window.innerWidth - inset * 2, Math.max(minWidth, width));
    const below = window.innerHeight - bottom - inset;
    const above = top - inset;
    const preferredHeight = onOpen ? 350 : 220;
    const upward = below < preferredHeight && above > below;
    const style = {
      width: `${menuWidth}px`, left: `${Math.max(inset, Math.min(left, window.innerWidth - menuWidth - inset))}px`,
      maxHeight: `${Math.max(40, Math.min(350, (upward ? above : below) - 6))}px`,
      top: upward ? 'auto' : `${bottom + 6}px`, bottom: upward ? `${window.innerHeight - top + 6}px` : 'auto',
    };
    Object.assign(menu.style, style);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open]);

  return (
    <div className="waste-filter-menu">
      <button ref={trigger} type="button" className={`waste-menu-trigger filter-control${filtered ? ' is-filtered' : ''}`} popoverTarget={id}
        aria-label={label} aria-expanded={open} disabled={disabled} title={disabled ? waste.chooseCategoryFirst : undefined}>
        <span>{caption}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      <div id={id} ref={panel} popover="auto" className="waste-menu-options" role="group" aria-label={label}
        onBeforeToggle={(event) => {
          if (event.nativeEvent.newState === 'open') {
            onOpen?.();
            placeMenu();
          }
        }}
        onToggle={(event) => setOpen(event.nativeEvent.newState === 'open')}>
        {children}
      </div>
    </div>
  );
}

function toggleMember(set, item) {
  const next = new Set(set);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

export function FilterMenu({ label, caption, options, selected, onChange, allLabel, disabled }) {
  const all = selected.size === options.length;
  return (
    <FilterPopover label={label} caption={caption} filtered={!all} disabled={disabled}>
      <button type="button" aria-pressed={all} onClick={() => onChange(new Set(options.map(({ id }) => id)))}>{allLabel}</button>
      {options.map(({ id, name, detail }) => (
        <button key={id} type="button" aria-pressed={!all && selected.has(id)}
          onClick={() => onChange(toggleMember(all ? [] : selected, id))}>
          {name}{detail && <small>{detail}</small>}
        </button>
      ))}
    </FilterPopover>
  );
}

export function CategoryFilter({ selected, onChange, column = false }) {
  const [draft, setDraft] = useState(selected);
  const filtered = selected.size !== categoryOptions.length;
  const caption = filtered ? waste.selectedCategories(selected.size) : waste.allCategories;

  function apply(event) {
    if (draft.size !== selected.size || [...draft].some((id) => !selected.has(id))) onChange(draft);
    event.currentTarget.closest('[popover]').hidePopover();
  }

  return (
    <FilterPopover label={column ? waste.category : waste.chooseCategories} caption={column ? waste.category : caption}
      filtered={filtered} onOpen={() => setDraft(selected)}>
      <div className="waste-category-actions">
        <button type="button" onClick={() => setDraft(new Set(categoryOptions.map(({ id }) => id)))}>{waste.selectAll}</button>
        <button type="button" onClick={() => setDraft(new Set())}>{waste.clearAll}</button>
      </div>
      <div className="waste-category-choices">
        {categoryOptions.map(({ id, name }) => (
          <label className="waste-category-option" key={id}>
            <input type="checkbox" checked={draft.has(id)} onChange={() => setDraft((current) => toggleMember(current, id))} />
            {name}
          </label>
        ))}
      </div>
      <div className="waste-category-actions waste-category-footer">
        <button type="button" onClick={apply}>{waste.applyFilter}</button>
      </div>
    </FilterPopover>
  );
}

export function useExpandedRows() {
  const [expanded, setExpanded] = useState(() => new Set());
  function toggle(key) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return { expanded, toggle, clear: () => setExpanded(new Set()) };
}

export function visibleRows(rows, expanded, depth = 0) {
  return rows.flatMap((row) => [{ row, depth }, ...(
    expanded.has(row.key) ? visibleRows(row.children, expanded, depth + 1) : []
  )]);
}

export function ReportLabel({ row, expanded, toggle, detail }) {
  const text = <span>{row.label}{(row.reference || detail) && <small>{row.reference || detail}</small>}</span>;
  if (!row.children.length) return <span className="waste-report-name">{text}</span>;
  return <button type="button" className="waste-report-name" aria-expanded={expanded.has(row.key)} onClick={() => toggle(row.key)}>
    <ChevronRight size={14} aria-hidden="true" />{text}
  </button>;
}

export function PeriodFilter({ history, today, period, onPeriod, custom, onCustom, maxDays }) {
  const valid = validCustomRange(custom, history, maxDays);
  const overLimit = !valid && maxDays && validCustomRange(custom, history);
  const limitEnd = maxDays && custom[0] >= history.first && custom[0] <= history.latest;
  const lastDay = limitEnd ? shiftDay(custom[0], maxDays - 1) : history.latest;
  return (
    <>
      <WasteSelect label={waste.period} value={period} onSelect={onPeriod} caption
        options={periods.map((id) => ({ id, name: periodLabel(id, today) }))} />
      {period === 'custom' && (
        <>
          {[waste.from, waste.to].map((label, index) => (
            <label key={label} className="waste-control">
              <span>{label}</span>
              <input type="date" className="filter-control" min={index === 1 && maxDays && custom[0] ? custom[0] : history.first}
                max={index === 1 && lastDay < history.latest ? lastDay : history.latest} value={custom[index]}
                aria-invalid={!valid} onChange={(event) => {
                  const next = [...custom];
                  next[index] = event.target.value;
                  onCustom(next);
                }} />
            </label>
          ))}
          {!valid && <p className="waste-range-error" role="status">{overLimit ? waste.rangeTooLong(maxDays) : waste.invalidRange}</p>}
        </>
      )}
    </>
  );
}

export function selectedRange(history, today, period, custom, maxDays) {
  return period === 'custom' && !validCustomRange(custom, history, maxDays)
    ? null : periodRange(period, history.latest, today, custom);
}
