import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, CalendarDays, ChartNoAxesColumn, ScanLine, Trash2, X } from 'lucide-react';
import { shiftDay } from '../../../app/calendar.js';
import { fr, productHud as copy } from '../../../content/fr.js';
import { supabase } from '../../../services/supabase.js';
import { summarizeProduct } from './productData.js';
import './productHud.css';

const dateLabel = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'full', timeZone: 'UTC' });
const countLabel = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 3 });
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

function ProductHudCard({ product, label, onClose, account }) {
  const [period, setPeriod] = useState(7);
  const [response, setResponse] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const demo = account?.isDemo;
  const accessPending = account?.accessPending;
  const canRead = Boolean(supabase && (demo || account?.canEdit));
  const offline = demo && !supabase ? __RAYON_HUD_PREVIEW__?.[product] : null;
  const accountId = account?.workspaceKey;
  const current = canRead && response && response.accountId === accountId && response.demo === demo ? response : null;
  const snapshot = offline ?? current?.data;
  const failed = (demo && !supabase && !offline) || current?.error;
  const data = snapshot && summarizeProduct(snapshot, period);
  const name = label ?? snapshot?.name ?? copy.product;

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    const rpc = demo ? 'get_demo_product_hud' : 'get_cart_product_hud';
    async function load() {
      try {
        const { data, error } = await supabase.rpc(rpc, { p_product: String(product) }).abortSignal(controller.signal);
        if (error || !data) throw new Error();
        if (!controller.signal.aborted) setResponse({ accountId, demo, data });
      } catch {
        if (!controller.signal.aborted) setResponse({ accountId, demo, error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [accountId, attempt, canRead, demo, product]);

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
          <p className="hud-note">{data.percentage === null ? copy.noRate : data.comparedDays < data.workingDays
            ? copy.partial(data.comparedDays, data.workingDays) : copy.unitsNote}</p>
          {offline && <p className="hud-note">{copy.snapshot(fullDate.format(dateOf(data.today)))}</p>}
        </>
      ) : (
        <div className="hud-message" role="status">
          <p>{failed ? copy.unavailable : accessPending || canRead ? copy.loading : copy.restricted}</p>
          {!accessPending && !canRead && account?.signIn && <button type="button" onClick={account.signIn}>{fr.signIn}</button>}
          {failed && canRead && (
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
      {hud.selection && createPortal(
        <ProductHudCard key={hud.selection.product} product={hud.selection.product} label={hud.selection.label}
          account={account} onClose={() => hud.close(true)} />,
        hud.selection.mount,
      )}
    </div>
  );
}
