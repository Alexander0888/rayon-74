import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { waste } from '../../content/fr.js';
import { hasCoverage, heatRows, periodRange } from './wasteData.js';
import { formatCurrency, longDay, rangeLabel, shortDay } from './wasteFormat.js';
import { PeriodFilter, ReportLabel, selectedRange, useExpandedRows, visibleRows, WasteSelect } from './WasteControls.jsx';

const pageSize = 50;
const maxCustomDays = 30;
const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const heatGroups = ['subgroup', 'category', 'group'].map((id) => ({ id, name: waste[id === 'subgroup' ? 'product' : id] }));

function averagePositive(values) {
  const losses = [...values.values()].filter((value) => value > 0);
  return losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : 0;
}

function cellColor(value, average) {
  if (value === null) return { className: 'is-missing' };
  if (value < 0) return { className: 'is-correction' };
  if (!value) return { className: 'is-zero' };
  const ratio = Math.min(value / average, 3) / 3;
  return { style: { '--heat-lightness': `${89 - 45 * ratio}%` } };
}

export function WasteHeatmap({ history, today }) {
  const [period, setPeriod] = useState('last30');
  const [custom, setCustom] = useState(() => periodRange('last30', history.latest, today));
  const [grouping, setGrouping] = useState('subgroup');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [active, setActive] = useState(null);
  const { expanded, toggle, clear } = useExpandedRows();
  const range = useMemo(() => selectedRange(history, today, period, custom, maxCustomDays), [history, today, period, custom]);
  const { days, covered, rows } = useMemo(() => heatRows(history, range, grouping, query), [history, range, grouping, query]);
  const visibleCount = Math.min(pageSize, rows.length - page * pageSize);
  const visible = useMemo(() => visibleRows(rows.slice(page * pageSize, (page + 1) * pageSize), expanded)
    .map(({ row, depth }) => ({ row, depth, average: averagePositive(row.values) })), [rows, page, expanded]);
  const currentRow = visible.find(({ row }) => row.key === active?.key)?.row;
  const activeDay = currentRow ? active.day : null;
  const indexOfDay = days.indexOf(activeDay);
  const value = indexOfDay >= 0 && covered[indexOfDay] ? currentRow?.values.get(active.day) ?? 0 : null;
  const visibleCoverage = range && hasCoverage(history, range);

  function update(setter, next) {
    setter(next);
    setPage(0);
    setActive(null);
    clear();
  }

  function changePage(next) {
    setPage(next);
    setActive(null);
  }

  function navigate(event) {
    const change = directions[event.key];
    const button = event.target.closest('button[data-row]');
    if (!change || !button) return;
    event.preventDefault();
    const row = Number(button.dataset.row) + change[0];
    const day = Number(button.dataset.day) + change[1];
    event.currentTarget.querySelector(`button[data-row="${row}"][data-day="${day}"]`)?.focus();
  }

  return (
    <section className="waste-panel waste-heat" aria-labelledby="waste-heat-title">
      <h2 id="waste-heat-title">{waste.heatmap}</h2>
      <div className="waste-filters">
        <PeriodFilter history={history} today={today} period={period} onPeriod={(next) => update(setPeriod, next)}
          custom={custom} onCustom={(next) => update(setCustom, next)} maxDays={maxCustomDays} />
        <WasteSelect label={waste.heatRows} value={grouping} options={heatGroups} caption onSelect={(next) => update(setGrouping, next)} />
        <label className="waste-control waste-search">
          <span>{waste.heatSearch}</span>
          <div><Search size={16} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => update(setQuery, event.target.value)} />
          </div>
        </label>
      </div>
      {range && <p className="waste-note">{rangeLabel(range)}</p>}
      {visible.length ? (
        <>
          <div className="waste-heat-key">
            <span><i className="is-zero" />{waste.zero}</span>
            <span><i className="is-intense" />{waste.intensity}</span>
            <span><i className="is-missing" />{waste.missing}</span>
            {visible.some(({ row }) => [...row.values.values()].some((amount) => amount < 0)) &&
              <span><i className="is-correction" />{waste.correction}</span>}
          </div>
          <div className="waste-heat-selection" aria-live="polite">
            {currentRow && indexOfDay >= 0 &&
              <><strong>{currentRow.label}</strong><span>{longDay(active.day)}</span><b>{formatCurrency(value)}</b></>}
          </div>
          <div className="waste-heat-scroll" tabIndex={0} role="region" aria-label={waste.heatmap}>
            <table aria-label={waste.heatmap} onKeyDown={navigate} style={{ '--heat-days': days.length }}>
              <thead>
                <tr>
                  <th scope="col">{waste[grouping === 'subgroup' ? 'product' : grouping]}</th>
                  {days.map((day) => {
                    const label = shortDay(day);
                    const [number, month] = label.split(/\s+/);
                    return <th scope="col" key={day} aria-label={label} className={activeDay === day ? 'is-active' : ''}>
                      <time className="waste-heat-date" dateTime={day}><span>{number}</span><small>{month}</small></time>
                    </th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, depth, average }, rowIndex) => (
                  <tr key={row.key} className={depth ? 'waste-heat-child' : undefined}>
                    <th scope="row" className={currentRow === row ? 'is-active' : ''}>
                      <ReportLabel row={row} expanded={expanded} toggle={toggle}
                        detail={grouping === 'group' && !depth ? row.category : undefined} />
                    </th>
                    {days.map((day, dayIndex) => {
                      const amount = covered[dayIndex] ? row.values.get(day) ?? 0 : null;
                      const focused = currentRow === row && activeDay === day;
                      const color = cellColor(amount, average);
                      const select = () => setActive({ key: row.key, day });
                      return (
                        <td key={day}>
                          <button type="button" className={`waste-heat-cell ${color.className ?? ''}`}
                            style={color.style} data-row={rowIndex} data-day={dayIndex}
                            aria-label={`${row.label} · ${longDay(day)} · ${formatCurrency(amount)}`}
                            tabIndex={focused || (!currentRow && rowIndex === 0 && dayIndex === 0) ? 0 : -1}
                            aria-pressed={focused} onFocus={select} onPointerEnter={(event) => {
                              if (event.pointerType === 'mouse') select();
                            }} onClick={select} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > pageSize && (
            <div className="waste-pagination">
              <button className="button" type="button" disabled={!page} onClick={() => changePage(page - 1)}>
                {waste.previousPage}
              </button>
              <span>{waste.pageCount(page * pageSize + 1, page * pageSize + visibleCount, rows.length)}</span>
              <button className="button" type="button" disabled={(page + 1) * pageSize >= rows.length}
                onClick={() => changePage(page + 1)}>{waste.nextPage}</button>
            </div>
          )}
        </>
      ) : range && <p className="waste-empty" role="status">{visibleCoverage ? query.trim() ? waste.noSearch : waste.noLosses : waste.missingPeriod}</p>}
    </section>
  );
}
