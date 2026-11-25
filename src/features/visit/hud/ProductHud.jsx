import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, CalendarDays, ChartNoAxesColumn, ScanLine, Trash2, X } from 'lucide-react';
import { shiftDay } from '../../../app/calendar.js';
import { fr, productHud as copy } from '../../../content/fr.js';
import { supabase } from '../../../services/supabase.js';
import { demoProduct, summarizeProduct } from './productData.js';
import './productHud.css';

const dateLabel = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'full', timeZone: 'UTC' });
const countLabel = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 });
const percentLabel = new Intl.NumberFormat('fr-CH', { style: 'percent', maximumFractionDigits: 1 });
const dateOf = (day) => new Date(`${day}T00:00:00Z`);

export function useProductHud(viewer, canvas, ready) {
  const layer = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    if (ready) viewer.current?.setHudEnabled?.(enabled);
  }, [enabled, ready, viewer]);

  function close(returnFocus = false) {
    viewer.current?.closeHud?.();
    if (returnFocus) canvas.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!selection) return;
    function onClick(event) {
      const { target } = event;
      if (target === canvas.current || target.closest?.('.hud-face, [data-hud-product], [data-hud-toggle], [data-hud-motion]')) return;
      viewer.current?.closeHud?.();
    }
    function onEscape(event) {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        viewer.current?.closeHud?.();
        canvas.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onEscape, true);
    };
  }, [canvas, selection, viewer]);

  return {
    layer, enabled, selection, setSelection, close,
    toggle: () => setEnabled((active) => !active),
    open: (id, byKeyboard) => viewer.current?.openHud?.(id, byKeyboard),
  };
}

export function ProductHudToggle({ hud, ready }) {
  return (
    <button type="button" className="hud-toggle" data-hud-toggle aria-pressed={hud.enabled} disabled={!ready} onClick={hud.toggle}>
      <ScanLine size={17} aria-hidden="true" />{copy.mode}
    </button>
  );
}

function Amount({ values }) {
  if (!values.length) return <span className="hud-missing">—</span>;
  return values.map(({ quantity, unit }) => (
    <span className="hud-amount" key={unit}>{countLabel.format(quantity)} <small>{copy.unit[unit]}</small></span>
  ));
}

function History({ kind, title, detail, icon: Icon, rows }) {
  return (
    <section className="hud-history" data-source={kind} aria-label={title}>
      <header className="hud-history-title">
        <span className="hud-history-icon"><Icon size={15} aria-hidden="true" /></span>
        <div><h3>{title}</h3><p>{detail}</p></div>
      </header>
      <div className="hud-history-scroll" tabIndex={0} aria-label={title}>
        <table>
          <thead><tr><th scope="col">{kind === 'orders' ? copy.delivery : copy.date}</th><th scope="col">{copy.amount}</th></tr></thead>
          <tbody>{rows.map(({ day, phase, values }) => (
            <tr key={day} data-phase={phase}>
              <th scope="row">
                {phase === 'today' ? <span>{copy.today}</span> : <span className="hud-phase-dot" aria-hidden="true" />}
                <time dateTime={day} title={fullDate.format(dateOf(day))}>{dateLabel.format(dateOf(day))}</time>
                {kind === 'orders' && phase !== 'today' && <span className="hud-sr-only"> · {copy[phase]}</span>}
              </th>
              <td><Amount values={values} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function ProductHudCard({ id, onClose, account }) {
  const [period, setPeriod] = useState(7);
  const [response, setResponse] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const demo = account?.isDemo;
  const accessPending = account?.accessPending;
  const canRead = !demo && Boolean(account?.canEdit && supabase);
  const accountId = account?.workspaceKey;
  const snapshot = demo ? demoProduct(id) : canRead && response?.accountId === accountId ? response?.data : null;
  const failed = !demo && canRead && response?.accountId === accountId && response?.error;
  const data = snapshot && summarizeProduct(snapshot, period);
  const coverage = data?.comparedDays;
  const name = copy.products[id];

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_cart_product_hud', { p_product: id }).abortSignal(controller.signal);
        if (error || !data) throw new Error();
        if (!controller.signal.aborted) setResponse({ accountId, data });
      } catch {
        if (!controller.signal.aborted) setResponse({ accountId, error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [accountId, attempt, canRead, id]);

  return (
    <article className="hud-card" aria-label={name} tabIndex={-1}>
      <header className="hud-header">
        <span className="hud-product-icon"><ChartNoAxesColumn size={21} aria-hidden="true" /></span>
        <div>
          <p>{demo ? copy.sample : copy.sources}</p>
          <h2>{name}</h2>
        </div>
        <button className="hud-close" type="button" aria-label={copy.close} onClick={onClose}><X size={17} aria-hidden="true" /></button>
      </header>
      {data ? (
        <>
          <div className="hud-timeline">
            <div className="hud-range">
              <CalendarDays size={13} aria-hidden="true" />
              <span>{copy.range(period)} <small>· {dateLabel.format(dateOf(shiftDay(data.today, 1 - period)))} – {dateLabel.format(dateOf(data.today))}</small></span>
            </div>
            <div className="hud-period" role="group" aria-label={copy.period}>
              {[7, 30].map((days) => (
                <button type="button" key={days} aria-label={copy.days(days)} aria-pressed={days === period} onClick={() => setPeriod(days)}>
                  {days} j
                </button>
              ))}
            </div>
          </div>
          <div className="hud-columns">
            <History kind="waste" title={copy.waste} detail={copy.wasteDetail} icon={Trash2} rows={data.wasteRows} />
            <History kind="orders" title={copy.orders} detail={copy.ordersDetail} icon={Box} rows={data.orderRows} />
          </div>
          <div className="hud-summary" aria-live="polite">
            <div><span>{copy.discarded}</span><strong><Amount values={data.totalWaste} /></strong></div>
            <div><span>{copy.ordered}</span><strong><Amount values={data.totalOrders} /></strong></div>
            <div className="hud-loss">
              <span>{copy.loss}</span>
              <strong title={copy.lossFormula}>{data.percentage === null ? '—' : percentLabel.format(data.percentage)}</strong>
              {data.percentage !== null && <div className="hud-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, data.percentage * 100)}%` }} /></div>}
            </div>
          </div>
          <p className="hud-note">{data.percentage === null ? copy.noRate : coverage < period ? copy.partial(coverage, period) : copy.unitsNote}</p>
        </>
      ) : (
        <div className="hud-message" role="status">
          <p>{failed ? copy.unavailable : accessPending || canRead ? copy.loading : copy.restricted}</p>
          {!accessPending && !canRead && account?.signIn && <button type="button" onClick={account.signIn}>{fr.signIn}</button>}
          {failed && (
            <button type="button" onClick={() => { setResponse(null); setAttempt((tries) => tries + 1); }}>
              {fr.retry}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function ProductHudLayer({ hud, account }) {
  return (
    <div className="product-hud-layer" ref={hud.layer}>
      {Object.entries(copy.products).map(([id, name]) => (
        <button type="button" className="hud-hotspot" key={id} hidden aria-label={copy.inspect(name)}
          data-hud-product={id} data-label={name} onClick={(event) => hud.open(id, event.detail === 0)}>
          <span aria-hidden="true" />
        </button>
      ))}
      {hud.selection && createPortal(
        <ProductHudCard key={hud.selection.id} id={hud.selection.id} account={account} onClose={() => hud.close(true)} />,
        hud.selection.mount,
      )}
    </div>
  );
}
