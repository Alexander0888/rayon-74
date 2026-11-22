import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, Search } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { AppHeader } from '../../app/AppHeader.jsx';
import { SectionBreadcrumb } from '../../app/SectionBreadcrumb.jsx';
import { ChoiceSelect } from '../../components/ChoiceSelect.jsx';
import { fr, orders, pageTitle } from '../../content/fr.js';
import { supabase } from '../../services/supabase.js';
import {
  categoryKeys, groupOrders, initialDeliveryDay, isBio, orderOrigin, orderTotals, packageLabel, priceLabel, quantityLabel,
} from './ordersData.js';
import './orders.css';

const title = fr.sections.orders.title;
const sortOptions = Object.entries(orders.sort).map(([id, name]) => ({ id, name }));
const columns = ['product', 'packaging', 'origin', 'ordered', 'confirmed', 'price'];

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

function OrderRow({ line }) {
  const cancelled = line.counting_status === 'cancelled';
  const pending = !cancelled && line.validated_quantity == null;
  const adjusted = !cancelled && !pending && (Number(line.validated_quantity) !== Number(line.ordered_quantity)
    || line.validated_unit_id !== line.ordered_unit_id);
  return (
    <tr role="row" className={cancelled ? 'orders-cancelled' : undefined}>
      <th role="rowheader" scope="row" className="orders-product">
        <span>{line.product_name}</span>
        {isBio(line) && <span className="orders-bio">{orders.bio}</span>}
        {cancelled && <span className="orders-cancelled-label">{orders.cancelled}</span>}
      </th>
      <OrdersCell column="packaging">{packageLabel(line)}</OrdersCell>
      <OrdersCell column="origin"><Origin line={line} /></OrdersCell>
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
      <OrdersCell column="price" className="orders-number">{priceLabel(line)}</OrdersCell>
    </tr>
  );
}

function OrderGroup({ category, lines }) {
  const heading = `orders-${category}`;
  return (
    <section className="orders-group" aria-labelledby={heading}>
      <h2 id={heading} tabIndex={-1}>{orders.groups[category]}</h2>
      {lines.length ? (
        <table role="table" className="orders-table" aria-labelledby={heading}>
          <thead role="rowgroup"><tr role="row">
            {columns.map((column) => <th key={column} role="columnheader" scope="col">{orders[column]}</th>)}
          </tr></thead>
          <tbody role="rowgroup">{lines.map((line) => <OrderRow key={line.id} line={line} />)}</tbody>
        </table>
      ) : <p className="orders-empty-group">{orders.emptyGroup}</p>}
    </section>
  );
}

function QuantitySummary({ totals }) {
  return (
    <dl className="orders-summary" aria-label={orders.summary}>
      {Object.entries(totals).map(([key, byUnit]) => (
        <div key={key}>
          <dt>{orders[key]}</dt>
          <dd>{[...byUnit].sort(([a], [b]) => b - a).map(([unit, count]) => quantityLabel(count, unit)).join(' · ') || '0'}</dd>
        </div>
      ))}
    </dl>
  );
}

function OrdersDashboard() {
  const [day, setDay] = useState(initialDeliveryDay);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('nameAsc');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!day) return;
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_orders_for_delivery', { p_delivery_date: day })
          .abortSignal(controller.signal);
        if (error || !Array.isArray(data?.lines)) throw new Error(orders.loadError);
        if (!controller.signal.aborted) setResult({ day, attempt, data });
      } catch {
        if (!controller.signal.aborted) setResult({ day, attempt, error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [day, attempt]);

  const current = result?.day === day && result.attempt === attempt ? result : null;
  const data = current?.data;
  const grouped = useMemo(() => data && groupOrders(data.lines, query, sort), [data, query, sort]);
  const totals = useMemo(() => data && orderTotals(data.lines), [data]);
  const hasMatches = grouped && Object.values(grouped).some((lines) => lines.length);

  function jumpTo(category) {
    const heading = document.getElementById(`orders-${category}`);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  return (
    <>
      <div className="orders-toolbar">
        <div className="orders-controls">
          <label className="orders-field">{orders.deliveryDate}
            <input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          </label>
          <label className="orders-field">{orders.search}
            <span className="orders-search">
              <Search size={16} aria-hidden="true" />
              <input type="search" value={query} placeholder={orders.searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)} />
            </span>
          </label>
          <div className="orders-field">
            <span aria-hidden="true">{orders.sortLabel}</span>
            <ChoiceSelect label={orders.sortLabel} options={sortOptions} value={sort} onSelect={setSort} />
          </div>
        </div>
        <nav className="orders-jump" aria-label={orders.jumpLabel}>
          {categoryKeys.map((category) => (
            <button className="button orders-jump-button" key={category} type="button" disabled={!hasMatches}
              onClick={() => jumpTo(category)}>
              {orders.groups[category]}<ArrowDown size={14} aria-hidden="true" />
            </button>
          ))}
        </nav>
      </div>
      {!day && <p className="orders-message" role="status">{orders.chooseDate}</p>}
      {day && !current && <p className="orders-message" role="status">{fr.loading}</p>}
      {current?.error && <div className="orders-message" role="alert">
        <p>{orders.loadError}</p>
        <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>{fr.retry}</button>
      </div>}
      {data && !data.lines.length && <div className="orders-message" role="status">
        <p>{orders.empty}</p>
        {data.latestDate && data.latestDate !== day && <button className="button" type="button"
          onClick={() => setDay(data.latestDate)}>{orders.latest}</button>}
      </div>}
      {data?.lines.length > 0 && <QuantitySummary totals={totals} />}
      {data?.lines.length > 0 && !hasMatches && <p className="orders-message" role="status">{orders.noMatches}</p>}
      {hasMatches && <div className="orders-groups">
        {categoryKeys.map((category) => <OrderGroup key={category} category={category} lines={grouped[category]} />)}
        {grouped.unclassified.length > 0 && <OrderGroup category="unclassified" lines={grouped.unclassified} />}
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
        {supabase && account.canEdit ? <OrdersDashboard key={account.workspaceKey} />
          : <p className="orders-message" role="status">{supabase ? orders.access : orders.unavailable}</p>}
      </main>
    </>
  );
}
