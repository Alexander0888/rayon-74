import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CakeSlice, Carrot, ChevronDown, Construction, Copy, Crosshair, Download, Footprints, Grid2X2,
  Leaf, Maximize, Minimize, Minus, MoreHorizontal, Move, MoveDown, MoveUp, Orbit, Plus, Redo2, RotateCcw, RotateCw, Save, Search, ShoppingBasket, Sprout, Trash2, TreePine, Undo2, Upload, X,
} from 'lucide-react';
import { useBlocker } from 'react-router';
import { AppHeader } from '../../../app/AppHeader.jsx';
import { PlanDialog } from '../../../components/PlanDialog.jsx';
import { christmas as copy, departmentVisit, fr, pageTitle, productHud, visit, visitPublication } from '../../../content/fr.js';
import { herbById } from '../../herbs/data/herbs.js';
import { ProductHudLayer, ProductHudToggle, useProductHud } from '../hud/ProductHud.jsx';
import { useVisitPublication } from '../useVisitPublication.js';
import { types } from './layout.js';
import './christmas.css';

const thumbnails = import.meta.glob(['./assets/*.webp', '../assets/department-preview.webp'], {
  eager: true, query: '?url', import: 'default',
});

function IconAction({ icon: Icon, label, ...props }) {
  return <button type="button" title={label} aria-label={label} {...props}><Icon size={17} aria-hidden="true" /></button>;
}

const views = [
  ['free', Orbit, visit.overview],
  ['walk', Footprints, visit.walk],
  ['top', Grid2X2, visit.top],
];
const spots = [
  ['cart', ShoppingBasket, departmentVisit.cart, departmentVisit.cartView],
  ['noel', TreePine, departmentVisit.noel, departmentVisit.noelView],
  ['carrots', Carrot, departmentVisit.carrots, departmentVisit.carrotsView],
  ['salads', Leaf, departmentVisit.salads, departmentVisit.saladsView],
  ['groceries', Sprout, departmentVisit.groceries, departmentVisit.groceriesView],
  ['bakery', CakeSlice, departmentVisit.bakery, departmentVisit.bakeryView],
];
const directions = [
  ['forward', ArrowUp, visit.forward], ['left', ArrowLeft, visit.left],
  ['back', ArrowDown, visit.back], ['right', ArrowRight, visit.right],
];

function Catalog({ onChoose, onClose }) {
  const dialog = useRef(null);
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  function searchText(value) {
    return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }
  const chosen = Object.entries(types).filter(([id, spec]) => (
    (!family || spec.family===family) && searchText(copy.objects[id]).includes(searchText(query.trim()))
  ));
  useEffect(() => {
    const current = dialog.current;
    current.showModal();
    return () => current.close();
  }, []);
  return (
    <dialog ref={dialog} className="noel-catalog" aria-labelledby="catalog-title" onCancel={(e)=>{ e.preventDefault(); onClose(); }}>
      <div className="noel-catalog-head">
        <h2 id="catalog-title">{copy.catalogTitle}</h2>
        <IconAction icon={X} label={fr.cancel} onClick={onClose} autoFocus />
      </div>
      <label className="noel-search">
        <Search size={17} aria-hidden="true" />
        <input type="search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={copy.search} aria-label={copy.search} />
      </label>
      <div className="noel-filters" role="group" aria-label={copy.catalogTitle}>
        {[['',copy.all],...Object.entries(copy.families)].map(([key,label])=>(
          <button key={key} type="button" aria-pressed={family===key} onClick={()=>setFamily(key)}>{label}</button>
        ))}
      </div>
      <div className="noel-catalog-scroll">
        {chosen.length ? (
          <ul className="noel-catalog-grid">
            {chosen.map(([id,spec])=>{
              const thumbnail=thumbnails[`./assets/${spec.front || spec.tag || ''}.webp`];
              const color=`#${spec.ink.toString(16).padStart(6,'0')}`;
              const ribbon=spec.ribbon ? `#${spec.ribbon.toString(16).padStart(6,'0')}` : color;
              return (
                <li key={id}>
                  <button type="button" onClick={()=>onChoose(id)}>
                    <span className={spec.family==='wrap' ? 'noel-swatch noel-swatch-wrap' : 'noel-swatch'} style={{'--ink':color,'--ribbon':ribbon}} aria-hidden="true">
                      {thumbnail && spec.family!=='wrap' && <img src={thumbnail} alt="" loading="lazy" />}
                    </span>
                    <span>{copy.objects[id]}</span>
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="noel-no-results" role="status">{copy.noMatch}</p>}
      </div>
    </dialog>
  );
}

function ObjectToolbar({ selection, viewer, onDuplicate }) {
  const { kind, type, id, source, step = 15, moving, isCopy } = selection;
  const crate = kind === 'crate' || kind?.endsWith('-crate');
  const label = departmentVisit.productSelection[kind]?.label ?? (crate ? departmentVisit.crateSelection : copy.selection);
  const crateName = departmentVisit.crateTypes[type] ?? departmentVisit.pearTypes[type] ?? departmentVisit.vegetableTypes[type];
  const name = kind === 'fixture' ? (type === 'fence' ? departmentVisit.fenceName((source ?? id).slice(-2)) : departmentVisit.fixtureTypes[type]) :
    crate ? crateName : departmentVisit.pastryTypes[type] ?? departmentVisit.oliveTypes[type] ?? herbById[type]?.name ?? copy.objects[type];
  return (
    <div className="noel-object-toolbar" role="group" aria-label={label}>
      <div className="noel-object-name" title={name}>
        <span>{label}</span>
        <strong>{name}</strong>
        {!kind && <output aria-live="polite" data-elevation={selection.y}>{copy.itemElevation(Math.round(selection.y*100))}</output>}
      </div>
      <div className="noel-object-buttons">
        <button type="button" className="noel-move" aria-pressed={moving}
          onClick={() => moving ? viewer.current?.cancelMove() : viewer.current?.aimForPlacement()}>
          {moving ? <X size={17} aria-hidden="true" /> : <Move size={17} aria-hidden="true" />}
          {moving ? copy.cancelMove : copy.move}
        </button>
        <button type="button" className="noel-duplicate" onClick={onDuplicate} disabled={moving}>
          <Copy size={16} aria-hidden="true" />{copy.duplicate}
        </button>
        {kind && (
          <>
            <IconAction icon={RotateCcw} label={copy.turnLeft(step)} onClick={()=>viewer.current?.turn(1)} />
            <IconAction icon={RotateCw} label={copy.turnRight(step)} onClick={()=>viewer.current?.turn(-1)} />
          </>
        )}
        {!kind && (
          <>
            <IconAction icon={ArrowLeft} label={copy.left} onClick={()=>viewer.current?.nudge(-.05,0)} />
            <IconAction icon={ArrowRight} label={copy.right} onClick={()=>viewer.current?.nudge(.05,0)} />
            <IconAction icon={ArrowUp} label={copy.away} onClick={()=>viewer.current?.nudge(0,-.05)} />
            <IconAction icon={ArrowDown} label={copy.near} onClick={()=>viewer.current?.nudge(0,.05)} />
            <IconAction icon={MoveUp} label={copy.lift} onClick={()=>viewer.current?.lift(.05)} />
            <IconAction icon={MoveDown} label={copy.lower} onClick={()=>viewer.current?.lift(-.05)} />
            <IconAction icon={RotateCw} label={copy.turn} onClick={()=>viewer.current?.turn()} />
            <IconAction icon={Crosshair} label={copy.inspect} onClick={()=>viewer.current?.inspect()} />
          </>
        )}
        {(!kind || isCopy) && (
          <IconAction icon={Trash2} label={copy.remove} className="noel-remove" onClick={() => viewer.current?.remove()} />
        )}
        <IconAction icon={X} label={copy.deselect} onClick={()=>viewer.current?.clearSelection()} />
      </div>
    </div>
  );
}

function DraftNotice({ onClose }) {
  const dialog = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog ref={dialog} className="noel-draft-notice" aria-labelledby="noel-draft-title"
      aria-describedby="noel-draft-description" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <Construction className="noel-draft-icon" size={21} aria-hidden="true" />
      <h2 id="noel-draft-title">{departmentVisit.draftTitle}</h2>
      <p id="noel-draft-description">{departmentVisit.draftDescription}</p>
      <div className="dialog-actions">
        <button type="button" className="button primary" onClick={onClose}>{departmentVisit.acknowledge}</button>
      </div>
    </dialog>
  );
}

export function ChristmasStage({ back, showDepartment = false, account }) {
  const canvas=useRef(null), viewer=useRef(null), addTrigger=useRef(null), operations=useRef(null);
  const page = useRef(null), importFile = useRef(null);
  const fullscreenPending = useRef(false);
  const pointerStartedOnCanvas = useRef(false);
  const [status,setStatus]=useState('loading');
  const [attempt,setAttempt]=useState(0);
  const [mode,setMode]=useState('free');
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [importText, setImportText] = useState(null);
  const [selection,setSelection]=useState(null);
  const [count,setCount]=useState(null);
  const [showCatalog,setShowCatalog]=useState(false);
  const [confirmation,setConfirmation]=useState(null);
  const [shakes,setShakes]=useState(0);
  const [fullscreen, setFullscreen] = useState(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const ready=status==='ready';
  const scene = showDepartment ? departmentVisit : copy;
  const hud = useProductHud(viewer, canvas, ready && showDepartment);
  const { layer: hudLayer, setSelection: setHudSelection } = hud;
  const publication = useVisitPublication(account.canPublishVisit);
  const { open: openLayout, change: changeLayout, dirty, saving } = publication;
  const editable = !publication.shared || (account.canPublishVisit && !publication.loadFailed);
  const leaveBlocked = dirty || saving;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    leaveBlocked && currentLocation.pathname !== nextLocation.pathname);
  const leavingPage = blocker.state === 'blocked';
  const leaveDialog = leavingPage || confirmSignOut;

  useEffect(() => { document.title = pageTitle(scene.title); }, [scene.title]);
  useEffect(() => {
    if (blocker.state === 'blocked' && !leaveBlocked) blocker.proceed();
  }, [blocker, leaveBlocked]);
  useEffect(() => {
    if (!leaveBlocked) return;
    function warn(event) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [leaveBlocked]);
  useEffect(() => {
    if (editable) return;
    viewer.current?.setEditing(false);
    setEditing(false);
    setShowCatalog(false);
    setConfirmation(null);
    setImportText(null);
  }, [editable]);
  useEffect(() => {
    function syncFullscreen() {
      setFullscreen((mode) => {
        if (document.fullscreenElement === page.current && page.current) return 'native';
        return mode === 'native' ? null : mode;
      });
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);
  useEffect(() => {
    if (fullscreen !== 'viewport') return;
    function exitOnEscape(event) {
      if (event.key === 'Escape' && !event.defaultPrevented && !page.current?.querySelector('dialog[open]')) {
        event.preventDefault();
        setFullscreen(null);
      }
    }
    document.addEventListener('keydown', exitOnEscape);
    return () => document.removeEventListener('keydown', exitOnEscape);
  }, [fullscreen]);
  useEffect(()=>{
    const controller=new AbortController();
    function fail() {
      if (!controller.signal.aborted) {
        viewer.current=null;
        setSelection(null);
        setEditing(false);
        setHistory({ undo: false, redo: false });
        setHudSelection(null);
        setStatus('error');
      }
    }
    async function start() {
      try {
        const [{ openChristmasViewer }, initialLayout] = await Promise.all([import('./viewer.js'), openLayout(controller.signal)]);
        if (controller.signal.aborted) return;
        const active=await openChristmasViewer(canvas.current,{
          signal:controller.signal, showDepartment, initialLayout, onLayoutChange:changeLayout,
          onFailure:fail, onView:setMode, onSelection:setSelection, onCount:setCount,
          onShake:()=>setShakes((n)=>n+1),
          hudLayer: hudLayer.current, onHudChange: setHudSelection, onSaveFailure: setStorageBlocked, onHistoryChange: setHistory,
        });
        if (!controller.signal.aborted && active) {
          viewer.current=active;
          setStatus('ready');
        }
      } catch {
        fail();
      }
    }
    start();
    return ()=>{ controller.abort(); viewer.current=null; };
  },[attempt, showDepartment, hudLayer, setHudSelection, openLayout, changeLayout]);

  function closeCatalog() {
    setShowCatalog(false);
    requestAnimationFrame(()=>addTrigger.current?.focus());
  }
  function choose(type) {
    viewer.current?.add(type);
    closeCatalog();
  }
  function changeEditing(active) {
    if (active && !editable) return;
    viewer.current?.setEditing(active);
    setEditing(active);
    setNotice('');
    if (active) hud.disable();
    else {
      setShowCatalog(false);
      setConfirmation(null);
      setImportText(null);
    }
  }
  function signOut() {
    changeEditing(false);
    setConfirmSignOut(false);
    void account.signOut?.();
  }
  function requestSignOut() {
    if (dirty) setConfirmSignOut(true);
    else signOut();
  }
  async function saveAndLeave() {
    if (await publication.save() && !leavingPage) signOut();
  }
  function stay() {
    if (leavingPage) blocker.reset();
    setConfirmSignOut(false);
  }
  function discardAndLeave() {
    if (leavingPage) {
      blocker.proceed();
      return;
    }
    const saved = publication.discard();
    if (saved) viewer.current?.resetLayout(saved);
    signOut();
  }
  function retryLayout() {
    closeOperations();
    setStatus('loading');
    setAttempt((value) => value + 1);
  }
  function duplicate() {
    const result = viewer.current?.duplicate();
    setNotice(result === 'space' ? copy.duplicateBlocked : result === 'limit' ? copy.duplicateLimit : '');
  }
  function closeOperations() {
    operations.current?.removeAttribute('open');
  }
  function confirm(command) {
    closeOperations();
    setNotice('');
    setConfirmation(command);
  }
  function downloadLayout() {
    const data = viewer.current?.exportArrangement();
    if (!data) return;
    closeOperations();
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rayon74-disposition.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function chooseLayout(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editing) return;
    try {
      if (file.size > 1000000) throw new Error();
      setImportText(await file.text());
      confirm('importArrangement');
    } catch {
      setNotice(copy.importError);
    }
  }
  async function toggleFullscreen() {
    const element = page.current;
    if (!element || fullscreenPending.current) return;
    if (fullscreen === 'viewport') {
      setFullscreen(null);
      return;
    }

    const exiting = document.fullscreenElement === element;
    if (!exiting && (!document.fullscreenEnabled || !element.requestFullscreen)) {
      setFullscreen('viewport');
      return;
    }

    fullscreenPending.current = true;
    try {
      if (exiting) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch {
      if (!exiting && element.isConnected) setFullscreen('viewport');
    } finally {
      fullscreenPending.current = false;
    }
  }
  const preview = thumbnails[showDepartment ? '../assets/department-preview.webp' : './assets/scene-preview.webp'];
  const kind = selection?.kind;
  const crate = kind === 'crate' || kind?.endsWith('-crate');
  const product = departmentVisit.productSelection[kind];
  const placementHelp = product?.help ?? (kind === 'fixture' ? copy.fixturePlaceHelp : crate ? departmentVisit.cratePlaceHelp : copy.placeHelp);
  const placementBlocked = product?.blocked ?? (crate ? departmentVisit.cratePlaceBlocked : copy.fixturePlaceBlocked);
  const placementNote = selection?.placementBlocked ? placementBlocked : selection?.moving ? placementHelp : '';
  const layoutNotice = publication.notice?.message || (publication.loadFailed ? visitPublication.loadFailed : '') ||
    notice || (storageBlocked ? copy.saveFailure : '');
  const dialogCopy = confirmation === 'importArrangement' ? copy : scene;
  const editRequired = editing ? undefined : copy.enableEdit;
  return <>
    <AppHeader {...account} signOut={account.signOut && requestSignOut} pending={saving} />
    <main ref={page} className="noel-page" id="main-content" tabIndex={-1} data-fullscreen={fullscreen ?? undefined}>
      {back}
      <header className="noel-heading">
        <h1>{scene.title}</h1>
        <div className="noel-heading-actions">
          {dirty && editable && (
            <button type="button" className="noel-add noel-publish-layout" aria-label={visitPublication.save}
              title={visitPublication.save} aria-busy={saving} disabled={saving || selection?.moving}
              onClick={() => void publication.save()}>
              <Save size={17} aria-hidden="true" /><span>{saving ? fr.saving : fr.save}</span>
            </button>
          )}
          {editable && (
            <button type="button" className="hud-toggle noel-layout-toggle" aria-pressed={editing}
              disabled={!ready} onClick={() => changeEditing(!editing)}>
              <Move size={17} aria-hidden="true" />{copy.editMode}
            </button>
          )}
          {editing && (
            <div className="noel-history-buttons" role="group" aria-label={copy.editHistory}>
              <IconAction icon={Undo2} label={copy.undo} disabled={!history.undo}
                aria-keyshortcuts="Control+Z Meta+Z" onClick={() => viewer.current?.undo()} />
              <IconAction icon={Redo2} label={copy.redo} disabled={!history.redo}
                aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z" onClick={() => viewer.current?.redo()} />
            </div>
          )}
          {showDepartment && <ProductHudToggle hud={hud} ready={ready} onToggle={() => {
            if (editing) changeEditing(false);
            hud.toggle();
          }} />}
          <details ref={operations} className="noel-scene-actions">
            <summary aria-label={copy.sceneActions} title={copy.sceneActions} tabIndex={ready ? 0 : -1}>
              <MoreHorizontal size={20} aria-hidden="true" />
            </summary>
            <div>
              {publication.loadFailed && <button type="button" onClick={retryLayout}>{fr.retry}</button>}
              {showDepartment && <button type="button" disabled={!ready} onClick={() => {
                closeOperations();
                viewer.current?.goTo('fences');
              }}><Grid2X2 size={16} aria-hidden="true" />{departmentVisit.reserveView}</button>}
              {editable && (
                <>
                  <button type="button" disabled={!ready || !editing} title={editRequired} onClick={() => confirm('restore')}>
                    <RotateCcw size={16} aria-hidden="true" />{scene.restore}
                  </button>
                  {showDepartment && ['restorePears', 'restoreCarrots', 'restoreSalads', 'restoreGroceries', 'restorePastry'].map((action) => (
                    <button key={action} type="button" disabled={!ready || !editing} title={editRequired} onClick={() => confirm(action)}>
                      <RotateCcw size={16} aria-hidden="true" />{departmentVisit[action]}
                    </button>
                  ))}
                  <button type="button" disabled={!ready || !editing || count === 0} title={editRequired} onClick={() => confirm('empty')}>
                    <Trash2 size={16} aria-hidden="true" />{scene.empty}
                  </button>
                </>
              )}
              <button type="button" disabled={!ready} onClick={downloadLayout}>
                <Download size={16} aria-hidden="true" />{copy.exportArrangement}
              </button>
              {editable && <button type="button" disabled={!ready || !editing} title={editRequired} onClick={() => {
                closeOperations();
                importFile.current?.click();
              }}><Upload size={16} aria-hidden="true" />{copy.importArrangement}</button>}
            </div>
          </details>
          <input type="file" ref={importFile} accept=".json,application/json" hidden onChange={chooseLayout} />
          {editable && <button ref={addTrigger} type="button" className="noel-add" aria-label={copy.add}
            onClick={() => setShowCatalog(true)} title={editRequired ?? copy.add} disabled={!ready || !editing}>
            <Plus size={18} aria-hidden="true" /><span>{copy.add}</span><ChevronDown className="noel-add-arrow" size={15} aria-hidden="true" />
          </button>}
        </div>
      </header>
      <figure className="noel-figure">
        <div className={selection?.moving ? 'noel-stage noel-placing' : 'noel-stage'}
          data-hud-open={Boolean(hud.selection)} data-editing={editing}
          onPointerDownCapture={(event) => { pointerStartedOnCanvas.current = event.target === canvas.current; }}
          onClickCapture={(event) => {
            // A tap on the canvas can reveal an action under the finger before the click is dispatched.
            if (event.detail && pointerStartedOnCanvas.current && event.target.closest('.noel-stage-bottom')) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}>
          <canvas
            key={attempt} ref={canvas} className="noel-canvas" tabIndex={ready?0:-1}
            aria-hidden={!ready} aria-label={scene.canvas} aria-describedby="noel-help" data-ready={ready}
          />
          {showDepartment && <ProductHudLayer hud={hud} account={account} />}
          {!ready && (
            <div className="noel-loading" role="status">
              {preview && <img src={preview} alt={status==='error' ? scene.preview : ''} />}
              <div>
                {status==='error' ? (
                  <>
                    <span>{copy.unavailable}</span>
                    <button type="button" className="button" onClick={retryLayout}>{fr.retry}</button>
                  </>
                ) : <span>{copy.loading}</span>}
              </div>
            </div>
          )}
          {ready && (
            <>
              <div className="noel-views" role="group" aria-label={visit.views}>
                {views.map(([id,Icon,label])=>(
                  <button key={id} type="button" aria-label={label} aria-pressed={mode===id} onClick={()=>{
                    viewer.current?.view(id);
                    if (id==='walk') canvas.current?.focus({ preventScroll:true });
                  }}>
                    <Icon size={16} aria-hidden="true" /><span>{label}</span>
                  </button>
                ))}
              </div>
              {showDepartment && (
                <div className="noel-landmarks" role="group" aria-label={departmentVisit.spots}>
                  {spots.map(([id, Icon, label, description]) => (
                    <button key={id} type="button" title={description} aria-label={description} onClick={() => {
                      viewer.current?.goTo(id);
                      if (mode === 'walk') canvas.current?.focus({ preventScroll: true });
                    }}>
                      <Icon size={16} aria-hidden="true" /><span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
              <span className="noel-screen-reader" role="status" aria-live="polite" data-tree-touches={shakes} key={shakes}>
                {shakes ? copy.treeShake : ''}
              </span>
            </>
          )}
          <div className="noel-stage-bottom">
            {ready && mode === 'walk' && (
              <div className="noel-directions" data-hud-motion role="group" aria-label={visit.walkControls}>
                {directions.map(([action, Icon, label]) => (
                  <IconAction key={action} icon={Icon} label={label} data-action={action}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      viewer.current?.start(action);
                    }}
                    onPointerUp={() => viewer.current?.stop(action)}
                    onPointerCancel={() => viewer.current?.stop(action)}
                    onLostPointerCapture={() => viewer.current?.stop(action)}
                    onClick={(e) => {
                      if (e.detail === 0) { viewer.current?.start(action); viewer.current?.stop(action); }
                    }} />
                ))}
              </div>
            )}
            {((ready && selection) || placementNote || layoutNotice) && (
              <div className="noel-stage-context">
                {ready && selection && <ObjectToolbar selection={selection} viewer={viewer} onDuplicate={duplicate} />}
                {placementNote && <div className="noel-placement-note" role="status">{placementNote}</div>}
                {layoutNotice && <div className="noel-placement-note" role={publication.notice?.error ? 'alert' : 'status'}>{layoutNotice}</div>}
              </div>
            )}
            {(ready || fullscreen) && (
              <div className="noel-camera-actions" role="group" aria-label={visit.views}>
                {ready && mode !== 'walk' && (
                  <>
                    <IconAction icon={Plus} label={visit.zoomIn} data-hud-motion onClick={() => viewer.current?.zoom(.80)} />
                    <IconAction icon={Minus} label={visit.zoomOut} data-hud-motion onClick={() => viewer.current?.zoom(1.25)} />
                  </>
                )}
                {ready && <IconAction icon={Crosshair} label={visit.reset} onClick={() => viewer.current?.view('free')} />}
                <IconAction icon={fullscreen ? Minimize : Maximize} label={fullscreen ? copy.exitFullscreen : copy.fullscreen} onClick={toggleFullscreen} />
              </div>
            )}
          </div>
        </div>
        <figcaption className="noel-caption">
          <span id="noel-help">
            {ready && (mode==='walk' ? (
              <>{copy.walkHelp} <span className="noel-desktop-help">{copy.keyboardWalkHelp}</span></>
            ) : (
              <><span className="noel-desktop-help">{copy.desktopHelp}{mode === 'free' && ' ' + copy.keyboardFlightHelp}</span><span className="noel-touch-help">{copy.touchHelp}</span></>
            ))}
            {ready && (
              hud.enabled ? <span className="hud-help">{productHud.help}</span> :
                <span className="noel-pick-help">{editing ? copy.editHelp : scene.pickHelp}</span>
            )}
          </span>
          <span className="noel-source">{scene.source}{ready && count!==null && (
            <span className="noel-count" data-count={count}> · {scene.objectCount(count)}</span>
          )}</span>
        </figcaption>
      </figure>
      {showDepartment && account.isDemo && !draftDismissed && !leaveDialog && <DraftNotice onClose={() => setDraftDismissed(true)} />}
      {ready && showCatalog && !leaveDialog && <Catalog onChoose={choose} onClose={closeCatalog} />}
      {ready && confirmation && !leaveDialog && (
        <PlanDialog title={dialogCopy[confirmation]} descriptions={[dialogCopy[`${confirmation}Help`]]} action={dialogCopy[confirmation]}
          danger={confirmation === 'empty'} onClose={() => {
            setConfirmation(null);
            setImportText(null);
          }} onConfirm={() => {
            if (confirmation === 'importArrangement') {
              setNotice(viewer.current?.importArrangement(importText) ? copy.importSuccess : copy.importError);
              setImportText(null);
            } else viewer.current?.[confirmation]();
            setConfirmation(null);
          }} />
      )}
      {leaveDialog && (
        <PlanDialog title={visitPublication.leaveTitle}
          descriptions={[editable ? visitPublication.leaveDescription : visitPublication.signInToPublish]}
          action={saving ? fr.saving : visitPublication.saveAndLeave} cancelLabel={visitPublication.stay}
          extraAction={{ label: visitPublication.discardAndLeave, onClick: discardAndLeave }}
          pending={saving} confirmDisabled={!editable} error={publication.notice?.error ? publication.notice.message : null}
          onClose={stay} onConfirm={saveAndLeave} />
      )}
    </main>
  </>;
}
