import { useEffect, useMemo, useRef, useState } from 'react';
import { waste } from '../../content/fr.js';
import { graphDates, hasCoverage, isCovered, periodRange, summary } from './wasteData.js';
import { formatCurrency, longDay, periodLabel, rangeLabel } from './wasteFormat.js';
import { ReportLabel, useExpandedRows, WasteSelect } from './WasteControls.jsx';

const percent = new Intl.NumberFormat('fr-CH', { style: 'percent', maximumFractionDigits: 1 });

function CategoryRing({ breakdown }) {
  const [active, setActive] = useState(null);
  const positive = breakdown.reduce((sum, { amount }) => sum + Math.max(0, amount), 0);
  let end = 0;
  const slices = breakdown.filter(({ amount }) => amount > 0).map(({ name, amount, color }) => {
    const start = end;
    end += amount / positive;
    const midpoint = (start + end) * Math.PI;
    return { name, start, end, style: {
      background: `conic-gradient(transparent 0turn ${start}turn, ${color} ${start}turn ${end}turn, transparent ${end}turn 1turn)`,
      '--slice-x': `${Math.sin(midpoint) * 5}px`, '--slice-y': `${-Math.cos(midpoint) * 5}px`,
    } };
  });
  const activeAmount = breakdown.find(({ name }) => name === active)?.amount;

  function pickSlice(event) {
    const { left, top, width } = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - left) / width - .5;
    const y = (event.clientY - top) / width - .5;
    const distance = Math.hypot(x, y);
    const angle = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1;
    const slice = distance >= .30 && distance <= .56
      ? slices.find(({ start, end: finish }) => angle >= start && angle < finish) : null;
    setActive(slice?.name ?? null);
  }

  return (
    <>
      <figure className="waste-breakdown" aria-label={waste.categoryShares}>
        <span className="waste-ring" aria-hidden="true"
          onPointerMove={(event) => { if (event.pointerType === 'mouse') pickSlice(event); }}
          onPointerDown={pickSlice} onPointerLeave={(event) => { if (event.pointerType === 'mouse') setActive(null); }}>
          {slices.length ? slices.map(({ name, style }) => (
            <span key={name} data-category={name} className={`waste-ring-slice${active === name ? ' is-active' : ''}`} style={style} />
          )) : <span className="waste-ring-slice is-empty" />}
          {activeAmount != null && <b className="waste-ring-value">{formatCurrency(activeAmount)}</b>}
        </span>
        <ul>
          {breakdown.map(({ name, color, amount }) => (
            <li key={name}>
              <button type="button" aria-pressed={active === name} aria-description={formatCurrency(amount)}
                onPointerEnter={(event) => { if (event.pointerType === 'mouse') setActive(name); }}
                onPointerLeave={(event) => { if (event.pointerType === 'mouse') setActive(null); }}
                onFocus={() => setActive(name)} onBlur={() => setActive(null)} onClick={() => setActive(name)}>
                <i style={{ backgroundColor: color }} aria-hidden="true" />
                <span>{name}</span>
                <b>{amount < 0 ? formatCurrency(amount) : percent.format(positive ? amount / positive : 0)}</b>
              </button>
            </li>
          ))}
        </ul>
      </figure>
      {breakdown.some(({ amount }) => amount < 0) && <p className="waste-note">{waste.positiveShares}</p>}
    </>
  );
}

function RankedRow({ row, disclosure, showCategory }) {
  const open = disclosure.expanded.has(row.key);
  const label = useRef(null);
  const [preview, setPreview] = useState(null);

  function showName(input) {
    const title = label.current.querySelector('.waste-report-title');
    if (title.scrollWidth > title.clientWidth) {
      setPreview((current) => input === 'touch' && current === 'touch' ? null : input);
    }
  }

  useEffect(() => {
    if (preview !== 'touch') return;
    function dismiss(event) {
      if (!label.current.contains(event.target)) setPreview(null);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [preview]);

  return <li>
    <div className="waste-ranking-row">
      <div className="waste-ranking-label" ref={label}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') showName('mouse'); }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setPreview(null); }}
        onPointerDown={(event) => { if (event.isPrimary && event.pointerType !== 'mouse') showName('touch'); }}
        onPointerCancel={() => setPreview(null)}
        onFocus={(event) => { if (event.target.matches(':focus-visible')) showName('keyboard'); }}
        onBlur={() => { if (preview === 'keyboard') setPreview(null); }}
        onKeyDown={(event) => { if (event.key === 'Escape') setPreview(null); }}>
        <ReportLabel row={row} {...disclosure} detail={showCategory ? row.category : undefined} />
        {preview && <span className="waste-ranking-tooltip" aria-hidden="true">{row.label}</span>}
      </div>
      <b>{formatCurrency(row.amount)}</b>
    </div>
    {open && <ul>{row.children.map((child) => <RankedRow key={child.key} row={child} disclosure={disclosure} />)}</ul>}
  </li>;
}

export function WasteSummary({ history, today, options, isDemo }) {
  const [period, setPeriod] = useState(options[0]);
  const [chosenDay, setChosenDay] = useState(() => history.latest < today ? history.latest : today);
  const [rankBy, setRankBy] = useState('subgroup');
  const [expanded, setExpanded] = useState(false);
  const disclosure = useExpandedRows();
  const periodEnd = period === 'latest' && !isDemo ? history.latestRecorded : history.latest;
  const range = useMemo(() => period === 'date'
    ? (chosenDay && chosenDay >= history.first && chosenDay <= today ? [chosenDay, chosenDay] : null)
    : periodRange(period, periodEnd, today), [period, history.first, periodEnd, today, chosenDay]);
  const { total, breakdown, top } = useMemo(() => summary(history, range, rankBy), [history, range, rankBy]);
  const covered = hasCoverage(history, range);
  const days = graphDates(range);
  const coverageNote = days.at(-1) > history.latest ? waste.partial(longDay(history.latest))
    : days.some((day) => !isCovered(history, day)) ? waste.partialCoverage : null;
  const title = periodLabel(period, today, isDemo);

  function changeDate(setter, value) {
    setter(value);
    setExpanded(false);
    disclosure.clear();
  }

  return (
    <article className="waste-panel waste-summary" aria-label={title}>
      <header className="waste-summary-head">
        <div className="waste-summary-controls">
          <WasteSelect className="waste-summary-period" label={waste.period} value={period}
            options={options.map((id) => ({ id, name: periodLabel(id, today, isDemo) }))} onSelect={(next) => changeDate(setPeriod, next)} />
          {period === 'date' && (
            <input type="date" className="waste-summary-date filter-control" aria-label={waste.reportDate} aria-invalid={!range}
              min={history.first} max={today} value={chosenDay} onChange={(event) => changeDate(setChosenDay, event.target.value)} />
          )}
        </div>
        {period !== 'date' && range && <p className="waste-note">{rangeLabel(range)}</p>}
      </header>
      <p className="waste-total">{covered ? formatCurrency(total) : '—'}</p>
      {covered ? (
        <>
          {coverageNote && <p className="waste-note">{coverageNote}</p>}
          <CategoryRing breakdown={breakdown} />
          <div className="waste-ranking">
            <div className="waste-ranking-head">
              <h3>{waste.top}</h3>
              <WasteSelect label={waste.rankBy} value={rankBy} onSelect={(next) => {
                setRankBy(next);
                disclosure.clear();
              }} options={[{ id: 'subgroup', name: waste.product }, { id: 'group', name: waste.group }]} />
            </div>
            {top.length ? (
              <>
                <ol role="list" className={expanded ? 'is-expanded' : ''}>
                  {top.map((row) => <RankedRow key={row.key} row={row} disclosure={disclosure} showCategory={rankBy === 'group'} />)}
                </ol>
                {top.length > 5 && (
                  <button className="waste-show-top" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                    {expanded ? waste.showLess : waste.showTop}
                  </button>
                )}
              </>
            ) : <p className="waste-note">{waste.noLosses}</p>}
          </div>
        </>
      ) : <p className="waste-note waste-summary-empty">{range && !days.length ? waste.closedDay : waste.missingPeriod}</p>}
    </article>
  );
}
