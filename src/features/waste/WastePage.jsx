import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { AppHeader } from '../../app/AppHeader.jsx';
import { SectionBreadcrumb } from '../../app/SectionBreadcrumb.jsx';
import { fr, pageTitle, waste } from '../../content/fr.js';
import { supabase } from '../../services/supabase.js';
import { allCategories, buildHistory, hasCoverage, periodRange, todayInZurich, trend } from './wasteData.js';
import { importStamp, longDay, rangeLabel } from './wasteFormat.js';
import { CategoryFilter, PeriodFilter, selectedRange, WasteSelect } from './WasteControls.jsx';
import { WasteHeatmap } from './WasteHeatmap.jsx';
import { WasteSummary } from './WasteSummary.jsx';
import { WasteTrend } from './WasteTrend.jsx';
import { WasteTable } from './WasteTable.jsx';
import './waste.css';

function WasteDashboard({ snapshot }) {
  const today = todayInZurich();
  const [metric, setMetric] = useState('pa');
  const history = useMemo(() => buildHistory(snapshot, metric), [snapshot, metric]);
  const [period, setPeriod] = useState('last30');
  const [custom, setCustom] = useState(() => periodRange('last30', history.latest, today));
  const [selected, setSelected] = useState(allCategories);
  const [averageDays, setAverageDays] = useState(30);
  const range = useMemo(() => selectedRange(history, today, period, custom), [history, today, period, custom]);
  const points = useMemo(() => trend(history, range, selected, averageDays), [history, range, selected, averageDays]);
  const status = !range ? waste.invalidRange : !selected.size ? waste.noCategories
    : !hasCoverage(history, range) ? waste.missingPeriod : null;

  function reset() {
    setPeriod('last30');
    setCustom(periodRange('last30', history.latest, today));
    setSelected(allCategories());
    setAverageDays(30);
  }

  return (
    <>
      <header className="waste-heading page-heading">
        <div>
          <h1>{fr.sections.waste.title}</h1>
          <WasteSelect className="waste-metric" label={waste.metric} value={metric} onSelect={setMetric}
            options={Object.entries(waste.metrics).map(([id, name]) => ({ id, name }))} />
        </div>
        <dl className="waste-freshness">
          <div><dt>{waste.lastImport}</dt><dd><time dateTime={history.importedAt}>{importStamp(history.importedAt)}</time></dd></div>
          <div><dt>{waste.lastDay}</dt><dd><time dateTime={history.latest}>{longDay(history.latest)}</time></dd></div>
        </dl>
      </header>
      <div className="waste-summaries">
        <WasteSummary history={history} today={today} options={['latest', 'yesterday', 'today', 'beforeYesterday', 'date']} />
        <WasteSummary history={history} today={today} options={['last7', 'week']} />
        <WasteSummary history={history} today={today} options={['last30', 'month']} />
      </div>
      <section className="waste-panel waste-trend" aria-labelledby="waste-trend-title">
        <h2 id="waste-trend-title">{waste.trend}</h2>
        <div className="waste-filters">
          <CategoryFilter selected={selected} onChange={setSelected} />
          <PeriodFilter history={history} today={today} period={period} onPeriod={setPeriod} custom={custom} onCustom={setCustom} />
          <WasteSelect label={waste.movingAverage} value={averageDays} onSelect={setAverageDays} caption
            options={[7, 14, 30, 60, 90].map((id) => ({ id, name: waste.averageDays(id) }))} />
          <button className="button waste-reset filter-control" type="button" onClick={reset}>
            <RotateCcw size={15} aria-hidden="true" />{waste.reset}
          </button>
        </div>
        {range && <p className="waste-note">{rangeLabel(range)}</p>}
        {status || !points.some(({ amount }) => amount !== null) ? (
          <p className="waste-empty" role="status">{status || waste.missingPeriod}</p>
        ) : (
          <>
            <WasteTrend points={points} />
            {points.some(({ amount }) => amount === null) && <p className="waste-note">{waste.partialCoverage}</p>}
          </>
        )}
      </section>
      <WasteTable history={history} today={today} metric={metric} />
      <WasteHeatmap history={history} today={today} />
    </>
  );
}

function WasteStatus({ children, error = false }) {
  return (
    <>
      <header className="page-heading waste-heading"><h1>{fr.sections.waste.title}</h1></header>
      <section className="waste-panel waste-status" role={error ? 'alert' : 'status'}>{children}</section>
    </>
  );
}

function SharedWaste() {
  const [state, setState] = useState({ pending: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_waste_dashboard').abortSignal(controller.signal);
        if (error || !data) throw error;
        if (!controller.signal.aborted) setState({ snapshot: data });
      } catch {
        if (!controller.signal.aborted) setState({ error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  if (state.pending) return <WasteStatus>{fr.loading}</WasteStatus>;
  if (state.error) return (
    <WasteStatus error>
      <p>{fr.connectionError}</p>
      <button className="button" type="button" onClick={() => {
        setState({ pending: true });
        setAttempt((value) => value + 1);
      }}>{fr.retry}</button>
    </WasteStatus>
  );
  if (!state.snapshot.coverage.length) return <WasteStatus>{waste.emptyHistory}</WasteStatus>;
  return <WasteDashboard snapshot={state.snapshot} />;
}

export default function WastePage() {
  const account = useOutletContext();
  useEffect(() => { document.title = pageTitle(fr.sections.waste.title); }, []);

  return (
    <>
      <AppHeader {...account} />
      <main className="page-width main waste-page" id="main-content" tabIndex={-1}>
        <SectionBreadcrumb title={fr.sections.waste.title} />
        {account.signOutError && <p className="notice error" role="alert">{fr.connectionError}</p>}
        {supabase && account.canEdit ? <SharedWaste key={account.workspaceKey} />
          : <WasteStatus>{supabase ? waste.access : waste.unavailable}</WasteStatus>}
      </main>
    </>
  );
}
