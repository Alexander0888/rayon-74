import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, Search } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { AppHeader } from '../../app/AppHeader.jsx';
import { isSunday, shiftDay } from '../../app/calendar.js';
import { SectionBreadcrumb } from '../../app/SectionBreadcrumb.jsx';
import { ChoiceSelect } from '../../components/ChoiceSelect.jsx';
import { fr, locale, orders, pageTitle } from '../../content/fr.js';
import { supabase } from '../../services/supabase.js';
import {
  categoryKeys, groupOrdersByDay, initialDeliveryDay, isBio, orderOrigin, orderSummaries, packageLabel, priceLabel, quantityLabel, readDemoOrders,
} from './ordersData.js';
import './orders.css';

const title = fr.sections.orders.title;
const sortOptions = Object.entries(orders.sort).map(([id, name]) => ({ id, name }));
const columns = ['product', 'ordered', 'confirmed', 'origin', 'packaging', 'price'];
const groupDay = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
const isDeliveryDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const batchSize = 5;

async function loadDeliveryDay(date, signal) {
  const { data, error } = await supabase.rpc('get_orders_for_delivery', { p_delivery_date: date }).abortSignal(signal);
  if (error || !Array.isArray(data?.lines)) throw new Error(orders.loadError);
  return data;
}

async function loadDeliveryPeriod(from, to, signal) {
  const first = await loadDeliveryDay(from, signal);
  const deliveries = isSunday(from) ? [] : [{ date: from, lines: first.lines }];
  const end = first.latestDate && first.latestDate < to ? first.latestDate : to;
  let date = from;
  while (first.latestDate && date < end) {
    signal.throwIfAborted();
    const batch = [];
    while (batch.length < batchSize && date < end) {
      date = shiftDay(date, 1);
      if (!isSunday(date)) batch.push(date);
    }
    deliveries.push(...await Promise.all(batch.map(async (date) => ({
      date, lines: (await loadDeliveryDay(date, signal)).lines,
    }))));
  }
  return { latestDate: first.latestDate, deliveries };
}

async function loadDemoOrders(from, to, filters, signal) {
  const { data, error } = await supabase.rpc('get_demo_orders', {
    p_from: from, p_to: to, p_query: filters.query, p_sort: filters.sort, p_offsets: filters.offsets,
  }).abortSignal(signal);
  if (error || !Array.isArray(data?.lines)) throw new Error(orders.loadError);
  return readDemoOrders(data);
}

function showCalendar(event) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // The input still has its native calendar control where showPicker is unavailable.
  }
}

function DeliveryControls({ from, to, onFrom, onTo, onToggle, invalid }) {
  const period = to !== null;
  return (
    <div className={`orders-delivery${period ? ' orders-delivery-period' : ''}`}>
      <label className="orders-field">
        {period ? orders.fromDate : orders.deliveryDate}
        <input type="date" className="filter-control" value={from} aria-invalid={invalid || undefined}
          onClick={showCalendar} onChange={(event) => onFrom(event.target.value)} />
      </label>
      {period && <label className="orders-field" id="orders-end-date">
        {orders.toDate}
        <input type="date" className="filter-control" value={to} min={from || undefined} aria-invalid={invalid || undefined}
          onClick={showCalendar} onChange={(event) => onTo(event.target.value)} />
      </label>}
      <button type="button" className="orders-period-toggle filter-control" aria-expanded={period}
        aria-controls={period ? 'orders-end-date' : undefined} onClick={onToggle}>
        {period ? orders.closePeriod : orders.openPeriod}
      </button>
    </div>
  );
}

function Origin({ line }) {
  const { flag, name } = orderOrigin(line);
  const [open, setOpen] = useState(false);
  if (name === orders.noOrigin) return <span className="orders-origin-note" title={name}>
    <span aria-hidden="true">{orders.unavailableValue}</span><span className="orders-visually-hidden">{name}</span>
  </span>;
  if (!flag) return <span className="orders-origin-note">{name}</span>;

  return (
    <span className="orders-origin">
      <button type="button" aria-label={name} aria-expanded={open} className="orders-flag"
        onClick={() => setOpen(!open)} onBlur={() => setOpen(false)} onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}>
        <span aria-hidden="true">{flag}</span>
      </button>
      <span className="orders-origin-tooltip" aria-hidden="true">{name}</span>
    </span>
  );
}

function OrdersCell({ column, className = '', children }) {
  return (
    <td role="cell" className={className}>
      <span className="orders-mobile-label" aria-hidden="true">{orders[column]}</span>
      {children}
    </td>
  );
}

function OrderRow({ line, isDemo }) {
  const cancelled = line.counting_status === 'cancelled';
  const pending = !cancelled && line.validated_quantity == null;
  const adjusted = !cancelled && !pending && (Number(line.validated_quantity) !== Number(line.ordered_quantity)
    || line.validated_unit_id !== line.ordered_unit_id);
  return (
    <tr role="row" className={cancelled ? 'orders-cancelled' : undefined}>
      <th role="rowheader" scope="row" className="orders-product">
        <span>{line.product_name}</span>
        {isDemo && <small className="orders-reference" title={[line.manor_article, line.internal_ref, line.gtin].join(' · ')}>
          {line.manor_variant}
        </small>}
        {isBio(line) && <span className="orders-bio">{orders.bio}</span>}
        {cancelled && <span className="orders-cancelled-label">{orders.cancelled}</span>}
      </th>
      <OrdersCell column="ordered" className="orders-number">
        {quantityLabel(line.ordered_quantity, line.ordered_unit_id)}
      </OrdersCell>
      <OrdersCell column="confirmed" className="orders-number">
        {cancelled ? orders.unavailableValue : pending ? <span className="orders-pending">{orders.pending}</span>
          : <span className={adjusted ? 'orders-adjusted' : undefined}>
            {adjusted && <span className="orders-visually-hidden">{orders.adjusted}. </span>}
            {quantityLabel(line.validated_quantity, line.validated_unit_id)}
          </span>}
      </OrdersCell>
      <OrdersCell column="origin"><Origin line={line} /></OrdersCell>
      <OrdersCell column="packaging" className="orders-secondary">{packageLabel(line)}</OrdersCell>
      <OrdersCell column="price" className="orders-number orders-secondary">{priceLabel(line)}</OrdersCell>
    </tr>
  );
}

function OrderGroup({ category, days, totals, multipleDays, pager }) {
  const heading = `orders-${category}`;
  return (
    <section className="orders-group" aria-labelledby={heading}>
      <header className="orders-group-header">
        <h2 id={heading} tabIndex={-1}>{orders.groups[category]}</h2>
        <QuantitySummary totals={totals} />
      </header>
      {days.length ? days.map(({ date, lines }) => {
        const dayHeading = `${heading}-${date}`;
        return (
          <div key={date} className="orders-day">
            {multipleDays && <h3 className="orders-day-heading" id={dayHeading}>
              <time dateTime={date}>{groupDay.format(new Date(`${date}T00:00:00Z`))}</time>
            </h3>}
            <table role="table" className="orders-table" aria-labelledby={multipleDays ? `${heading} ${dayHeading}` : heading}>
              <thead role="rowgroup"><tr role="row">
                {columns.map((column) => <th key={column} role="columnheader" scope="col">{orders[column]}</th>)}
              </tr></thead>
              <tbody role="rowgroup">{lines.map((line) => <OrderRow key={line.id} line={line} isDemo={Boolean(pager)} />)}</tbody>
            </table>
          </div>
        );
      }) : <p className="orders-empty-group">{orders.emptyGroup}</p>}
      {pager?.total > pager?.size && (
        <nav className="orders-pages" aria-label={orders.groups[category]}>
          <span aria-live="polite">{orders.lineRange(pager.offset + 1, Math.min(pager.offset + pager.size, pager.total), pager.total)}</span>
          <button type="button" className="button filter-control" disabled={pager.pending || pager.offset === 0}
            onClick={() => pager.change(pager.offset - pager.size)}>{orders.previousPage}</button>
          <button type="button" className="button filter-control" disabled={pager.pending || pager.offset + pager.size >= pager.total}
            onClick={() => pager.change(pager.offset + pager.size)}>{orders.nextPage}</button>
        </nav>
      )}
    </section>
  );
}

function formatTotal(byUnit) {
  return [...byUnit].sort(([a], [b]) => b - a).map(([unit, count]) => quantityLabel(count, unit)).join(' · ') || '0';
}

function QuantitySummary({ totals }) {
  return (
    <dl className="orders-category-totals">
      {['ordered', 'confirmed'].map((key) => (
        <div key={key}>
          <dt>{orders[key]}</dt>
          <dd>{formatTotal(totals[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryRow({ label, totals }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{formatTotal(totals.ordered)}</td>
      <td>{formatTotal(totals.confirmed)}</td>
    </tr>
  );
}

function CategorySummary({ totals, groups }) {
  return (
    <section className="orders-summary-section" aria-labelledby="orders-summary-title">
      <h2 id="orders-summary-title">{orders.summary}</h2>
      <table className="orders-summary-table" aria-labelledby="orders-summary-title">
        <thead>
          <tr>
            <th scope="col">{orders.summaryCategory}</th>
            <th scope="col">{orders.ordered}</th>
            <th scope="col">{orders.summaryConfirmed}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((category) => (
            <SummaryRow key={category} label={orders.groups[category]} totals={totals.categories[category]} />
          ))}
        </tbody>
        <tfoot>
          <SummaryRow label={orders.summaryTotal} totals={totals.total} />
        </tfoot>
      </table>
    </section>
  );
}

function OrdersDashboard({ isDemo }) {
  const [from, setFrom] = useState(initialDeliveryDay);
  const [endDate, setEndDate] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('nameAsc');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [offsets, setOffsets] = useState({});
  const serverQuery = isDemo ? query.trim() : '';
  const serverSort = isDemo ? sort : 'nameAsc';
  const to = endDate ?? from;
  const hasDates = isDeliveryDate(from) && isDeliveryDate(to);
  const invalidPeriod = hasDates && to < from;
  const valid = hasDates && !invalidPeriod;
  const multipleDays = from !== to;

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    async function load() {
      const request = { from, to, attempt, serverQuery, serverSort, offsets };
      try {
        const data = isDemo ? await loadDemoOrders(from, to, {
          query: serverQuery, sort: serverSort, offsets,
        }, controller.signal) : await loadDeliveryPeriod(from, to, controller.signal);
        if (!controller.signal.aborted) setResult({ ...request, data });
      } catch {
        if (!controller.signal.aborted) setResult({ ...request, error: true });
      }
    }
    // Debounce the server-side search while typing in a multi-month report.
    const timer = setTimeout(load, serverQuery ? 160 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [from, to, valid, attempt, isDemo, serverQuery, serverSort, offsets]);

  const current = result?.from === from && result.to === to && result.attempt === attempt &&
    result.serverQuery === serverQuery && result.serverSort === serverSort ? result : null;
  const data = current?.data;
  const grouped = useMemo(() => data && (isDemo ? data.grouped : groupOrdersByDay(data.deliveries, query, sort)), [data, isDemo, query, sort]);
  const totals = useMemo(() => data && (isDemo ? data.totals : orderSummaries(data.deliveries)), [data, isDemo]);
  const hasLines = data && (isDemo ? data.hasLines : data.deliveries.some(({ lines }) => lines.length > 0));
  const hasMatches = grouped && Object.values(grouped).some((days) => days.length);
  const groups = isDemo && totals?.categories.unclassified.ordered.size ? [...categoryKeys, 'unclassified'] : categoryKeys;

  function update(setValue, value) {
    if (isDemo) setOffsets({});
    setValue(value);
  }

  function pager(category) {
    if (!isDemo) return undefined;
    const label = orders.groups[category];
    return {
      offset: current.offsets[label] ?? 0, total: data.counts[label] ?? 0, size: data.pageSize,
      pending: current.offsets !== offsets,
      change: (offset) => setOffsets({ ...offsets, [label]: offset }),
    };
  }

  function jumpTo(category) {
    const heading = document.getElementById(`orders-${category}`);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  return (
    <>
      <div className="orders-overview">
        <div className="orders-toolbar">
          <div className="orders-controls">
            <DeliveryControls from={from} to={endDate} onFrom={(value) => update(setFrom, value)}
              onTo={(value) => update(setEndDate, value)} onToggle={() => update(setEndDate, endDate === null ? from : null)}
              invalid={invalidPeriod} />
            <label className="orders-field">{orders.search}
              <span className="orders-search">
                <Search size={16} aria-hidden="true" />
                <input type="search" className="filter-control" value={query} placeholder={orders.searchPlaceholder}
                  onChange={(event) => update(setQuery, event.target.value)} />
              </span>
            </label>
            <div className="orders-field">
              <span aria-hidden="true">{orders.sortLabel}</span>
              <ChoiceSelect label={orders.sortLabel} options={sortOptions} value={sort} onSelect={(value) => update(setSort, value)} />
            </div>
          </div>
          <nav className="orders-jump" aria-label={orders.jumpLabel}>
            {groups.map((category) => (
              <button className="button orders-jump-button" key={category} type="button" disabled={!hasMatches}
                onClick={() => jumpTo(category)}>
                {orders.groups[category]}<ArrowDown size={14} aria-hidden="true" />
              </button>
            ))}
          </nav>
        </div>
        {hasLines && <CategorySummary totals={totals} groups={groups} />}
      </div>
      {!hasDates && <p className="orders-message" role="status">{endDate === null ? orders.chooseDate : orders.choosePeriod}</p>}
      {invalidPeriod && <p className="orders-message" role="status">{orders.invalidPeriod}</p>}
      {valid && !current && <p className="orders-message" role="status">{fr.loading}</p>}
      {current?.error && <div className="orders-message" role="alert">
        <p>{multipleDays ? orders.periodLoadError : orders.loadError}</p>
        <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>{fr.retry}</button>
      </div>}
      {data && !hasLines && <div className="orders-message" role="status">
        <p>{multipleDays ? orders.emptyPeriod : orders.empty}</p>
        {data.latestDate && (data.latestDate < from || data.latestDate > to) && <button className="button" type="button"
          onClick={() => { update(setFrom, data.latestDate); setEndDate(null); }}>{isDemo ? orders.latestDemo : orders.latest}</button>}
      </div>}
      {hasLines && !hasMatches && <p className="orders-message" role="status">{orders.noMatches}</p>}
      {hasMatches && <div className="orders-groups">
        {[...new Set([...groups, ...(grouped.unclassified.length ? ['unclassified'] : [])])].map((category) => (
          <OrderGroup key={category} category={category} days={grouped[category]} totals={totals.categories[category]}
            multipleDays={multipleDays} pager={pager(category)} />
        ))}
      </div>}
    </>
  );
}

export default function OrdersPage() {
  const account = useOutletContext();
  useEffect(() => { document.title = pageTitle(title); }, []);
  return (
    <>
      <AppHeader {...account} />
      <main className="page-width main orders-page" id="main-content" tabIndex={-1}>
        <SectionBreadcrumb title={title} />
        <header className="page-heading orders-heading"><h1>{title}</h1></header>
        {account.signOutError && <p className="notice error" role="alert">{fr.connectionError}</p>}
        {supabase && (account.canEdit || account.isDemo)
          ? <OrdersDashboard key={account.workspaceKey} isDemo={account.isDemo} />
          : <p className="orders-message" role="status">{account.accessPending ? fr.loading : supabase ? orders.access : orders.unavailable}</p>}
      </main>
    </>
  );
}
