import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHudScene } from '../hud/hudScene.js';
import { cartOrigin, cartPathOpen, departmentBounds, mapCenter, walkFromCart, walkFromNoel } from '../departmentLayout.js';
import { aisle, originalItems, standBounds, treePosition, types } from './layout.js';
import { makeMaterials } from './materials.js';
import { makeTree } from './tree.js';
import { buildWorld, walkable } from './world.js';
import { createInventory } from './inventory.js';
import { placementOnRay, placementSurfaces, readArrangement, rearrange, saveArrangement, supportedHeight, withinAisle } from './arrangement.js';

const clamp = THREE.MathUtils.clamp;
const eye = 1.57;
const walkingKeys = {
  ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'forward', KeyZ: 'forward', KeyS: 'back',
  KeyA: 'strafeLeft', KeyQ: 'strafeLeft', KeyD: 'strafeRight',
};
const editingFields = 'dialog, input, textarea, select, [contenteditable]';

export async function openChristmasViewer(canvas, {
  signal, showDepartment, onFailure, onView, onSelection, onCount, onShake, hudLayer, onHudChange,
}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const density = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.60 : 1.65);
  renderer.setPixelRatio(density);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, 0.023, 68);
  const orbit = new OrbitControls(camera, canvas);
  orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  orbit.minDistance = 0.32;
  orbit.maxDistance = showDepartment ? 38 : 17.5;
  orbit.maxPolarAngle = 1.532;
  orbit.minPolarAngle = .009;
  orbit.zoomToCursor = true;
  orbit.listenToKeyEvents(canvas);

  const cleanup = [], held = new Map();
  const controls = canvas.closest('main') ?? canvas;
  let materials, tree, inventory, department, hud;
  let location = showDepartment ? 'cart' : 'noel';
  let items = readArrangement(), selected = null, moving = false, proposed = null, boards = [];
  let frame = 0, last = 0, ready = false, disposed = false, mode = 'free', adjusted = false;
  let yaw = 0, pitch = -0.17, gesture = null, bumpTime = -Infinity;
  const raycaster = new THREE.Raycaster(), point = new THREE.Vector2();

  function requestDraw() {
    if (ready && !disposed && !frame) frame = requestAnimationFrame(draw);
  }
  function draw(time) {
    frame = 0;
    if (disposed) return;
    const dt = Math.min((time - last) / 1000, .225);
    if (mode === 'walk') {
      walk(dt);
      camera.rotation.set(pitch,yaw,0,'YXZ');
    }
    const shaking = tree.update(time);
    const animatingHud = hud?.draw(time);
    renderer.render(scene,camera);
    last=time;
    if (held.size || shaking || animatingHud) requestDraw();
  }

  function fixedPath(x,z) {
    const blockedByTree = Math.hypot(x-treePosition.x,z-treePosition.z) < treePosition.radius+.135;
    if (blockedByTree && performance.now()-bumpTime>3200) {
      bumpTime=performance.now();
      shake();
    }
    if (department) {
      if (!walkable(x, z, departmentBounds) || !cartPathOpen(x, z)) return false;
    } else if (!walkable(x, z)) {
      return false;
    }
    return !items.some((item) => {
      const [w,h,d]=types[item.type].size;
      return item.y < .12 && h > .08 && Math.abs(item.x-x) < w*.48+.12 && Math.abs(item.z-z) < d*.48+.12;
    });
  }
  function walk(seconds) {
    const actions = new Set(held.values());
    const forward = Number(actions.has('forward')) - Number(actions.has('back'));
    const strafe = Number(actions.has('strafeRight')) - Number(actions.has('strafeLeft'));
    const turn = Number(actions.has('left')) - Number(actions.has('right'));
    yaw += turn * seconds * 1.62;
    if (!forward && !strafe) return;

    const step = 1.24 * seconds / Math.hypot(forward, strafe);
    const { x, z } = camera.position;
    const nextX = x + (Math.cos(yaw) * strafe - Math.sin(yaw) * forward) * step;
    const nextZ = z - (Math.cos(yaw) * forward + Math.sin(yaw) * strafe) * step;
    if (fixedPath(nextX, z)) camera.position.x = nextX;
    if (fixedPath(camera.position.x, nextZ)) camera.position.z = nextZ;
  }

  function start(action, input = action) {
    if (mode !== 'walk' || held.has(input)) return;
    const idle = held.size === 0;
    held.set(input, action);
    if (idle) {
      walk(0.055);
      last = performance.now();
    }
    requestDraw();
  }

  function stop(input) { held.delete(input); }

  function cameraPose(view, keepTarget = false) {
    mode=view;
    held.clear();
    gesture=null;
    orbit.enabled=view!=='walk';
    hud?.cancelFocus();
    camera.fov=view==='walk' ? 62 : 43;
    camera.updateProjectionMatrix();
    if (department) {
      scene.fog.near = view === 'top' ? 22 : 4.8;
      scene.fog.far = view === 'top' ? 54 : 32;
    }
    if (view==='walk') {
      const standStart = department ? walkFromNoel : { x: .67, z: 2.48, yaw: .105, pitch: -.104 };
      const start = location === 'cart' ? walkFromCart : standStart;
      camera.position.set(start.x, eye, start.z);
      yaw = start.yaw;
      pitch = start.pitch;
      camera.rotation.set(pitch,yaw,0,'YXZ');
    } else if (view === 'top' && department) {
      const width = departmentBounds.right - departmentBounds.left;
      const depth = departmentBounds.front - departmentBounds.back;
      const height = Math.max(depth, width / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      orbit.target.set(mapCenter.x, 0.35, mapCenter.z);
      camera.position.set(mapCenter.x, height + 1.1, mapCenter.z + 0.16);
      orbit.update();
    } else if (view==='top') {
      const centerX=(standBounds.left+standBounds.right)/2;
      orbit.target.set(centerX,.39,0);
      camera.position.set(centerX, Math.max(4.9,8.59/camera.aspect),.04);
      orbit.update();
    } else if (department && location === 'cart' && !keepTarget) {
      orbit.target.set(0.06, 0.59, cartOrigin.z - 0.92);
      const distance = Math.max(8.5, 8.3 / camera.aspect);
      const elevation = camera.aspect < 1.48 ? 0.27 : 0.39;
      camera.position.copy(orbit.target).add(new THREE.Vector3(0.32, elevation, 0.93).normalize().multiplyScalar(distance));
      orbit.update();
    } else {
      const aspect = camera.aspect;
      if (!keepTarget) orbit.target.set(.13, 1.00, .055);
      const angle = aspect<1.1 ? -.28 : -.18;
      const distance = Math.max(4.95,8.65/aspect) + .15;
      camera.position.copy(orbit.target).add(new THREE.Vector3(angle,.278,1).normalize().multiplyScalar(distance));
      orbit.update();
    }
    onView(view);
    requestDraw();
  }
  function view(preset) {
    if (department && mode === 'walk') location = camera.position.z > cartOrigin.z / 2 ? 'cart' : 'noel';
    adjusted = false;
    cancelGesture();
    cameraPose(preset);
  }
  function goTo(spot) {
    if (!department) return;
    location = spot;
    adjusted = false;
    cancelGesture();
    cameraPose(mode === 'top' ? 'free' : mode);
  }
  function resize() {
    const w=Math.max(1,canvas.clientWidth), h=Math.max(1,canvas.clientHeight);
    renderer.setSize(w,h,false);
    hud?.resize(w, h);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
    if (!adjusted && mode!=='walk') cameraPose(mode);
    requestDraw();
  }
  function zoom(multiplier) {
    if (mode==='walk') return;
    adjusted=true;
    const offset = camera.position.clone().sub(orbit.target);
    camera.position.copy(orbit.target).add(offset.setLength(clamp(offset.length()*multiplier,orbit.minDistance,orbit.maxDistance)));
    orbit.update();
    requestDraw();
  }

  function sendSelection() {
    inventory.highlight(selected, moving);
    onSelection(selected ? { ...selected, moving } : null);
    requestDraw();
  }
  function select(item) {
    if (proposed && selected) inventory.preview(selected);
    proposed=null;
    selected=item;
    moving=false;
    sendSelection();
  }
  function aimForPlacement() {
    if (!selected) return;
    if (moving) {
      select(selected);
    } else {
      moving=true;
      boards=placementSurfaces(items,selected.id);
      sendSelection();
    }
  }
  function place(item, preserveStack = false) {
    if (!selected || !item) return;
    const next = preserveStack ? items.map((piece) => piece.id===item.id ? item : piece) : rearrange(items,selected.id,item);
    commit(next, item.id);
  }
  function commit(next,id) {
    proposed=null;
    items=next;
    inventory.show(next);
    saveArrangement(next);
    onCount(next.length);
    select(next.find((item)=>item.id===id) || null);
    renderer.shadowMap.needsUpdate=true;
    requestDraw();
  }
  function remove() {
    if (selected) commit(rearrange(items,selected.id),null);
  }
  function turn() {
    if (selected) place({...selected,rotation:(selected.rotation + Math.PI/6)%(Math.PI*2)},true);
  }
  function lift(delta) {
    if (!selected) return;
    const support=supportedHeight(selected.x,selected.z,placementSurfaces(items,selected.id),selected.y+.005);
    const y=clamp(selected.y+delta, delta<0 ? support : 0,3.1);
    if (Math.abs(y-selected.y)>.0001) place({...selected,y});
  }
  function nudge(dx,dz) {
    if (!selected) return;
    camera.updateMatrixWorld();
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
    right.y=0;
    right.normalize();
    const {x,z}=withinAisle(
      selected.x+right.x*dx-right.z*dz, selected.z+right.z*dx+right.x*dz, selected.type,
    );
    const available=placementSurfaces(items,selected.id);
    const before=supportedHeight(selected.x,selected.z,available,selected.y+.01);
    const after=supportedHeight(x,z,available,Math.max(selected.y+.014,before+.065));
    place({...selected,x,y:Math.min(3.1,after+Math.max(0,selected.y-before)),z});
  }
  function add(type) {
    if (!Object.hasOwn(types,type)) return;
    const viewpoint = mode === 'walk' ? camera.position : orbit.target;
    if (department && (mode === 'top' || viewpoint.z > standBounds.front + aisle + 1)) goTo('noel');
    const closeTo = mode==='walk' ? camera.position.x : orbit.target.x;
    const baseX = clamp(closeTo,standBounds.left+.28,standBounds.right-.28);
    const rear = camera.position.z<0;
    const [w,,d]=types[type].size;
    for (let trial=0; trial<160; trial++) {
      const sx=(trial%8-3.5)*.31, sz=Math.floor(trial/8)*.22;
      const {x,z}=withinAisle(baseX+sx,rear ? standBounds.back-.42-sz : standBounds.front+.42+sz,type);
      if (!items.some((piece)=>piece.y<.085 && Math.abs(piece.x-x)<(types[piece.type].size[0]+w)*.48+.015 &&
        Math.abs(piece.z-z)<(types[piece.type].size[2]+d)*.48+.015) || trial===159) {
        const id=globalThis.crypto?.randomUUID?.() || `objet-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
        const item={id,type,x,y:0,z,rotation:rear?Math.PI:0,tiltX:0,tiltZ:0};
        commit([...items,item],id);
        aimForPlacement();
        return;
      }
    }
  }
  function inspect() {
    if (!selected) return;
    cancelGesture();
    const target=new THREE.Vector3(selected.x,selected.y+types[selected.type].size[1]*.51,selected.z);
    const direction=camera.position.clone().sub(target);
    direction.y=Math.max(direction.y,.36*direction.length());
    const size=types[selected.type].size;
    cameraPose('free',true);
    adjusted=true;
    orbit.target.copy(target);
    const distance=Math.max(.48,Math.max(...size)*2.65 / Math.min(camera.aspect,1));
    camera.position.copy(target).add(direction.setLength(distance));
    orbit.update();
    requestDraw();
  }
  function shake() {
    tree.shake(performance.now());
    onShake();
    requestDraw();
  }

  function pointerRay(e) {
    const bounds=canvas.getBoundingClientRect();
    point.set(((e.clientX-bounds.left)/bounds.width)*2-1,1-((e.clientY-bounds.top)/bounds.height)*2);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(point,camera);
    return raycaster.ray;
  }
  function targetFor(e) {
    if (!selected) return null;
    const ray = pointerRay(e);
    return placementOnRay(ray, boards, selected);
  }
  function hover(e) {
    const target=targetFor(e);
    if (proposed && !target) inventory.preview(selected);
    proposed=target;
    if(target) inventory.preview(target);
    inventory.highlight(target || selected,true);
    requestDraw();
  }
  function pointerDown(e) {
    if (e.button!==0 || disposed) return;
    if (gesture) { gesture.moved = true; return; }
    canvas.focus({preventScroll:true});
    hud?.cancelFocus();
    const ray=pointerRay(e);
    const object=inventory.pick(ray);
    const treeHit=raycaster.intersectObject(tree.proxy,false)[0];
    const treeFirst = treeHit && (!object || treeHit.distance < object.distance);
    const distance = treeFirst ? treeHit.distance : object?.distance;
    const hit = department && distance && department.hides(ray, distance) ? null : treeFirst ? 'tree' : object?.item;
    const drag=Boolean(!e.shiftKey && selected && hit?.id===selected.id && (e.pointerType!=='touch' || moving));
    gesture={ id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false,drag,hit,placement:moving };
    if (drag) {
      orbit.enabled=false;
      boards=placementSurfaces(items,selected.id);
    }
    if (drag || mode==='walk') canvas.setPointerCapture(e.pointerId);
  }
  function pointerMove(e) {
    const current=gesture;
    if (!current || e.pointerId!==current.id) {
      if (moving && e.pointerType!=='touch' && !current) hover(e);
      return;
    }
    const dx=e.clientX-current.x, dy=e.clientY-current.y;
    current.x=e.clientX;
    current.y=e.clientY;
    if (Math.hypot(current.x-current.sx,current.y-current.sy)>6) current.moved=true;
    if (current.drag && current.moved) {
      hover(e);
    } else if (mode==='walk' && !current.drag && current.moved) {
      yaw-=dx*.0051;
      pitch=clamp(pitch-dy*.0051,-1.49,1.42);
      requestDraw();
    }
  }
  function pointerUp(e) {
    if (!gesture || e.pointerId!==gesture.id) return;
    const {drag,hit,moved,placement} = gesture;
    gesture=null;
    orbit.enabled=mode!=='walk';
    if (!moved && !placement && hud?.selectFromRay(pointerRay(e))) {
      select(null);
      return;
    }
    if (!moved && hit==='tree') {
      if (!placement) select(null);
      shake();
      return;
    }
    if (drag && moved || placement && !moved) {
      const target=targetFor(e);
      if (target) place(target);
      else if (selected) {
        inventory.preview(selected);
        inventory.highlight(selected,moving);
        proposed=null;
      }
    } else if (!moved && !placement) {
      select(hit || null);
    }
    requestDraw();
  }
  function cancelGesture() {
    gesture=null;
    orbit.enabled=mode!=='walk';
    if (proposed && selected) {
      inventory.preview(selected);
      inventory.highlight(selected,moving);
      proposed=null;
    }
    requestDraw();
  }
  function editKeyAction(event) {
    if (event.key === 'Escape') select(moving ? selected : null);
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
      event.preventDefault();
      remove();
    }
  }

  function walkKeyAction(event) {
    if (mode !== 'walk' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.(editingFields)) return;
    const key = event.key.length === 1 ? `Key${event.key.toUpperCase()}` : event.key;
    const action = walkingKeys[event.code] ?? walkingKeys[key];
    if (action) {
      event.preventDefault();
      start(action, event.code || key);
    }
  }

  function listen(target,type,handler,options) {
    target.addEventListener(type,handler,options);
    cleanup.push(()=>target.removeEventListener(type,handler,options));
  }
  function dispose() {
    if(disposed) return;
    disposed=true;
    cancelAnimationFrame(frame);
    orbit.dispose();
    cleanup.forEach((fn)=>fn());
    inventory?.dispose();
    tree?.dispose();
    const geometries=new Set();
    scene.traverse((node)=>{
      if (node.geometry && !node.isInstancedMesh) geometries.add(node.geometry);
      if (node.isInstancedMesh && node.parent !== scene) {
        node.dispose();
        geometries.add(node.geometry);
      }
    });
    geometries.forEach((g)=>g.dispose());
    department?.dispose();
    materials?.dispose();
    renderer.dispose();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
  }

  listen(signal,'abort',dispose,{once:true});
  if (signal.aborted) { dispose(); return; }
  try {
    const departmentModule = showDepartment ? await import('../department.js') : null;
    if (disposed) return;
    const loaded = await makeMaterials(renderer, { includeFloor: !showDepartment });
    if (disposed) { loaded.dispose(); return; }
    materials = loaded;
    if (departmentModule) {
      department = await departmentModule.createDepartment(materials, renderer, signal);
      if (disposed) {
        department?.dispose();
        return;
      }
    }
    cleanup.push(buildWorld(scene,renderer,materials,department));
    if (department && hudLayer) {
      hud = createHudScene({
        scene, camera, cart: department.charrette, layer: hudLayer, orbit, redraw: requestDraw,
        onChange(selection) {
          if (selection && orbit.enabled) {
            adjusted = true;
            if (mode === 'top') {
              mode = 'free';
              onView(mode);
            }
          }
          onHudChange?.(selection);
        },
        hides: (ray, distance) => department.hides(ray, distance, false),
        aimOnFoot(point) {
          const dx = camera.position.x - point.x, dz = camera.position.z - point.z;
          yaw = Math.atan2(dx, dz);
          pitch = clamp(Math.atan2(point.y - camera.position.y, Math.hypot(dx, dz)), -1.49, 1.42);
        },
      });
      cleanup.push(hud.dispose);
    }
    tree=makeTree(materials);
    tree.root.traverse((node)=>{
      if (node.isMesh && !node.isInstancedMesh) {
        node.castShadow=true;
        node.receiveShadow=true;
      }
    });
    scene.add(tree.root);
    inventory=createInventory(scene,materials);
    inventory.show(items);
    onCount(items.length);
    orbit.addEventListener('change',requestDraw);
    orbit.addEventListener('start',()=>{
      hud?.cancelFocus();
      adjusted=true;
      if (mode==='top') { mode='free'; onView(mode); }
    });
    listen(canvas,'pointerdown',pointerDown,true);
    listen(canvas,'pointermove',pointerMove);
    listen(canvas,'pointerup',pointerUp,true);
    listen(canvas,'pointercancel',cancelGesture);
    listen(canvas,'lostpointercapture',(e)=>{ if (gesture?.id===e.pointerId) cancelGesture(); });
    listen(canvas,'pointerleave',()=>{ if (!gesture && proposed) cancelGesture(); });
    listen(canvas,'contextmenu',(e)=>e.preventDefault());
    listen(canvas, 'keydown', editKeyAction);
    listen(controls, 'keydown', walkKeyAction);
    listen(window, 'keyup', (event) => stop(event.code || (event.key.length === 1 ? `Key${event.key.toUpperCase()}` : event.key)));
    listen(controls, 'focusout', (event) => {
      if (!controls.contains(event.relatedTarget) || event.relatedTarget?.closest?.(editingFields)) held.clear();
    });
    listen(document, 'visibilitychange', () => { if (document.hidden) held.clear(); });
    listen(window,'blur',()=>{ held.clear(); cancelGesture(); });
    listen(canvas,'webglcontextlost',(e)=>{
      e.preventDefault();
      dispose();
      onFailure();
    });
    const observer=new ResizeObserver(resize);
    observer.observe(canvas);
    cleanup.push(()=>observer.disconnect());
    resize();
    renderer.render(scene,camera);
    ready=true;
    requestDraw();
    return {
      view,goTo,zoom,start,stop,add,remove,turn,lift,nudge,inspect,aimForPlacement,
      clearSelection:()=>select(null),
      setHudEnabled: (enabled) => {
        if (hud && enabled) select(null);
        hud?.setEnabled(enabled);
      },
      closeHud: hud?.close,
      restore:()=>commit(originalItems(),null),
      empty:()=>commit([],null),
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
