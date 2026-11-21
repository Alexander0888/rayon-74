import { useMemo, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Search } from 'lucide-react';
import { waste } from '../../content/fr.js';
import { allCategories, categories, compareNames, groupKey, hasCoverage, periodRange, subgroupRows, tableRows } from './wasteData.js';
import { CategoryFilter, FilterMenu, PeriodFilter, ReportLabel, selectedRange, useExpandedRows, visibleRows } from './WasteControls.jsx';
import { formatCurrency, rangeLabel } from './wasteFormat.js';

function SortColumn({ field, label, order, onSort }) {
  const current = order.field === field;
  const Icon = current ? (order.direction === 'ascending' ? ArrowUp : ArrowDown) : ArrowDownUp;
  return <th scope="col" aria-sort={current ? order.direction : undefined}>
    <button type="button" className="waste-sort-trigger" onClick={() => onSort(field)}>
      {label}<Icon size={14} aria-hidden="true" />
    </button>
  </th>;
}

export function WasteTable({ history, today, metric }) {
  const [period, setPeriod] = useState('last30');
  const [custom, setCustom] = useState(() => periodRange('last30', history.latest, today));
  const [selected, setSelected] = useState(allCategories);
  const [groups, setGroups] = useState(null);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState({ field: 'amount', direction: 'descending' });
  const { expanded, toggle, clear } = useExpandedRows();
  const range = useMemo(() => selectedRange(history, today, period, custom), [history, today, period, custom]);
  const subgroups = useMemo(() => subgroupRows(history, range).filter(({ category }) => selected.has(category)), [history, range, selected]);
  const groupOptions = useMemo(() => [...new Map(subgroups.map((row) => {
    const id = groupKey(row);
    return [id, { id, name: row.group, detail: selected.size > 1 ? row.category : undefined }];
  })).values()].sort((a, b) => compareNames(a.name, b.name)), [subgroups, selected]);
  const rows = useMemo(() => tableRows(subgroups, groups, query, order), [subgroups, groups, query, order]);
  const status = !range ? waste.invalidRange : !selected.size ? waste.noCategories
    : !hasCoverage(history, range) ? waste.missingPeriod : query.trim() ? waste.noSearch : waste.noLosses;

  function changePeriod(setter, value) {
    setter(value);
    setGroups(null);
    clear();
  }

  function sortBy(field) {
    setOrder(({ field: previous, direction }) => ({
      field, direction: previous === field ? (direction === 'ascending' ? 'descending' : 'ascending')
        : field === 'label' ? 'ascending' : 'descending',
    }));
  }

  return (
    <section className="waste-panel waste-detail" aria-labelledby="waste-detail-title">
      <header className="waste-section-head">
        <h2 id="waste-detail-title">{waste.detail}</h2>
        <div className="waste-filters">
          <label className="waste-control waste-search">
            <span>{waste.search}</span>
            <div><Search size={16} aria-hidden="true" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </label>
          <PeriodFilter history={history} today={today} period={period} onPeriod={(next) => changePeriod(setPeriod, next)}
            custom={custom} onCustom={(next) => changePeriod(setCustom, next)} />
        </div>
      </header>
      {range && <p className="waste-note waste-detail-range">{rangeLabel(range)}</p>}
      <div className="waste-table-scroll" tabIndex={0} role="region" aria-label={waste.detail}>
        <table aria-labelledby="waste-detail-title">
          <thead><tr>
            <SortColumn field="label" label={waste.product} order={order} onSort={sortBy} />
            <th scope="col"><CategoryFilter column selected={selected} onChange={(next) => {
              setSelected(next);
              setGroups(null);
              clear();
            }} /></th>
            <th scope="col"><FilterMenu label={waste.group} caption={waste.group} options={groupOptions}
              selected={groups ?? new Set(groupOptions.map(({ id }) => id))} onChange={setGroups}
              allLabel={waste.allGroups} disabled={selected.size === categories.length || !groupOptions.length} /></th>
            <SortColumn field="amount" label={waste.lossColumn[metric]} order={order} onSort={sortBy} />
          </tr></thead>
          <tbody>
            {visibleRows(rows, expanded).map(({ row, depth }) => (
              <tr key={row.key} className={depth ? 'waste-detail-child' : undefined}>
                <th scope="row"><ReportLabel row={row} expanded={expanded} toggle={toggle} /></th>
                <td>{row.category}</td><td>{row.group}</td><td>{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="waste-empty" role="status">{status}</p>}
    </section>
  );
}
