import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Construction, Crosshair, Footprints, Grid2X2,
  Maximize, Minimize, Minus, MoreHorizontal, Move, MoveDown, MoveUp, Orbit, Plus, RotateCcw, RotateCw, Search, ShoppingBasket, Trash2, TreePine, X,
} from 'lucide-react';
import { PlanDialog } from '../../../components/PlanDialog.jsx';
import { christmas as copy, departmentVisit, fr, pageTitle, productHud, visit } from '../../../content/fr.js';
import { ProductHudLayer, ProductHudToggle, useProductHud } from '../hud/ProductHud.jsx';
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

function ObjectToolbar({ selection, viewer }) {
  return (
    <div className="noel-object-toolbar" role="group" aria-label={copy.selection}>
      <div className="noel-object-name">
        <span>{copy.selection}</span>
        <strong>{copy.objects[selection.type]}</strong>
        <output aria-live="polite" data-elevation={selection.y}>{copy.itemElevation(Math.round(selection.y*100))}</output>
      </div>
      <div className="noel-object-buttons">
        <button type="button" className="noel-move" aria-pressed={selection.moving} onClick={()=>viewer.current?.aimForPlacement()}>
          <Move size={17} aria-hidden="true" />{selection.moving ? copy.cancelMove : copy.move}
        </button>
        <IconAction icon={ArrowLeft} label={copy.left} onClick={()=>viewer.current?.nudge(-.05,0)} />
        <IconAction icon={ArrowRight} label={copy.right} onClick={()=>viewer.current?.nudge(.05,0)} />
        <IconAction icon={ArrowUp} label={copy.away} onClick={()=>viewer.current?.nudge(0,-.05)} />
        <IconAction icon={ArrowDown} label={copy.near} onClick={()=>viewer.current?.nudge(0,.05)} />
        <IconAction icon={MoveUp} label={copy.lift} onClick={()=>viewer.current?.lift(.05)} />
        <IconAction icon={MoveDown} label={copy.lower} onClick={()=>viewer.current?.lift(-.05)} />
        <IconAction icon={RotateCw} label={copy.turn} onClick={()=>viewer.current?.turn()} />
        <IconAction icon={Crosshair} label={copy.inspect} onClick={()=>viewer.current?.inspect()} />
        <IconAction icon={Trash2} label={copy.remove} className="noel-remove" onClick={()=>viewer.current?.remove()} />
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
  const page = useRef(null);
  const fullscreenPending = useRef(false);
  const [status,setStatus]=useState('loading');
  const [attempt,setAttempt]=useState(0);
  const [mode,setMode]=useState('free');
  const [selection,setSelection]=useState(null);
  const [count,setCount]=useState(null);
  const [showCatalog,setShowCatalog]=useState(false);
  const [confirmation,setConfirmation]=useState(null);
  const [shakes,setShakes]=useState(0);
  const [fullscreen, setFullscreen] = useState(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const ready=status==='ready';
  const scene = showDepartment ? departmentVisit : copy;
  const hud = useProductHud(viewer, canvas, ready && showDepartment);
  const { layer: hudLayer, setSelection: setHudSelection } = hud;

  useEffect(() => { document.title = pageTitle(scene.title); }, [scene.title]);
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
        setHudSelection(null);
        setStatus('error');
      }
    }
    async function start() {
      try {
        const {openChristmasViewer}=await import('./viewer.js');
        if (controller.signal.aborted) return;
        const active=await openChristmasViewer(canvas.current,{
          signal:controller.signal, showDepartment, onFailure:fail, onView:setMode, onSelection:setSelection, onCount:setCount,
          onShake:()=>setShakes((n)=>n+1),
          hudLayer: hudLayer.current, onHudChange: setHudSelection,
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
  },[attempt, showDepartment, hudLayer, setHudSelection]);

  function closeCatalog() {
    setShowCatalog(false);
    requestAnimationFrame(()=>addTrigger.current?.focus());
  }
  function choose(type) {
    viewer.current?.add(type);
    closeCatalog();
  }
  function confirm(command) {
    operations.current?.removeAttribute('open');
    setConfirmation(command);
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
  return (
    <main ref={page} className="noel-page" id="main-content" tabIndex={-1} data-fullscreen={fullscreen ?? undefined}>
      {back}
      <header className="noel-heading">
        <h1>{scene.title}</h1>
        <div className="noel-heading-actions">
          {showDepartment && <ProductHudToggle hud={hud} ready={ready} />}
          <details ref={operations} className="noel-scene-actions">
            <summary aria-label={copy.sceneActions} title={copy.sceneActions} tabIndex={ready?0:-1}>
              <MoreHorizontal size={20} aria-hidden="true" />
            </summary>
            <div>
              <button type="button" disabled={!ready} onClick={()=>confirm('restore')}><RotateCcw size={16} />{scene.restore}</button>
              <button type="button" disabled={!ready || count===0} onClick={()=>confirm('empty')}><Trash2 size={16} />{scene.empty}</button>
            </div>
          </details>
          <button ref={addTrigger} type="button" className="noel-add" onClick={()=>setShowCatalog(true)} disabled={!ready}>
            <Plus size={18} aria-hidden="true" />{copy.add}<ChevronDown className="noel-add-arrow" size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <figure className="noel-figure">
        <div className={selection?.moving ? 'noel-stage noel-placing' : 'noel-stage'} data-hud-open={Boolean(hud.selection)}>
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
                    <button type="button" className="button" onClick={()=>{ setStatus('loading'); setAttempt((n)=>n+1); }}>{fr.retry}</button>
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
              {mode==='walk' && (
                <div className="noel-directions" data-hud-motion role="group" aria-label={visit.walkControls}>
                  {directions.map(([action,Icon,label])=>(
                    <IconAction key={action} icon={Icon} label={label} data-action={action}
                      onPointerDown={(e)=>{
                        e.currentTarget.setPointerCapture(e.pointerId);
                        viewer.current?.start(action);
                      }}
                      onPointerUp={()=>viewer.current?.stop(action)}
                      onPointerCancel={()=>viewer.current?.stop(action)}
                      onLostPointerCapture={()=>viewer.current?.stop(action)}
                      onClick={(e)=>{
                        if (e.detail===0) { viewer.current?.start(action); viewer.current?.stop(action); }
                      }} />
                  ))}
                </div>
              )}
              {selection?.moving && <div className="noel-placement-note" role="status">{copy.placeHelp}</div>}
              <span className="noel-screen-reader" role="status" aria-live="polite" data-tree-touches={shakes} key={shakes}>
                {shakes ? copy.treeShake : ''}
              </span>
            </>
          )}
          {(ready || fullscreen) && (
            <div className="noel-camera-actions" role="group" aria-label={visit.views}>
              {ready && mode!=='walk' && (
                <>
                  <IconAction icon={Plus} label={visit.zoomIn} data-hud-motion onClick={()=>viewer.current?.zoom(.80)} />
                  <IconAction icon={Minus} label={visit.zoomOut} data-hud-motion onClick={()=>viewer.current?.zoom(1.25)} />
                </>
              )}
              {ready && <IconAction icon={Crosshair} label={visit.reset} onClick={()=>viewer.current?.view('free')} />}
              <IconAction icon={fullscreen ? Minimize : Maximize} label={fullscreen ? copy.exitFullscreen : copy.fullscreen} onClick={toggleFullscreen} />
            </div>
          )}
        </div>
        {ready && selection && <ObjectToolbar selection={selection} viewer={viewer} />}
        <figcaption className="noel-caption">
          <span id="noel-help">
            {ready && (mode==='walk' ? (
              <>{copy.walkHelp} <span className="noel-desktop-help">{copy.keyboardWalkHelp}</span></>
            ) : (
              <><span className="noel-desktop-help">{copy.desktopHelp}</span><span className="noel-touch-help">{copy.touchHelp}</span></>
            ))}
            {ready && !selection && (
              hud.enabled ? <span className="hud-help">{productHud.help}</span> : <span className="noel-pick-help">{scene.pickHelp}</span>
            )}
          </span>
          <span className="noel-source">{scene.source}{ready && count!==null && (
            <span className="noel-count" data-count={count}> · {scene.objectCount(count)}</span>
          )}</span>
        </figcaption>
      </figure>
      {showDepartment && account?.isDemo && !draftDismissed && <DraftNotice onClose={() => setDraftDismissed(true)} />}
      {ready && showCatalog && <Catalog onChoose={choose} onClose={closeCatalog} />}
      {ready && confirmation && (
        <PlanDialog title={scene[confirmation]} descriptions={[scene[`${confirmation}Help`]]} action={scene[confirmation]}
          danger={confirmation==='empty'} onClose={()=>setConfirmation(null)} onConfirm={()=>{
            viewer.current?.[confirmation]();
            setConfirmation(null);
          }} />
      )}
    </main>
  );
}
