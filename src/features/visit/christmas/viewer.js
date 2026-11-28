import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHudScene } from '../hud/hudScene.js';
import { cartOrigin, departmentBounds, mapCenter, mapSize, walkFromCart, walkFromNoel } from '../departmentLayout.js';
import { walkFromCarrots } from '../carrot/layout.js';
import { walkFromSalads } from '../salads/layout.js';
import { walkFromGroceries } from '../groceries/layout.js';
import { walkFromBakery } from '../bakery/layout.js';
import { marketShiftZ, shiftMarket } from '../salads/marketPosition.js';
import { containsFootprint, coversFloor, halfExtents, localOffset, overlapsFootprint, worldOffset } from '../floorGeometry.js';
import { createFixtureEditor } from '../fixtureEditor.js';
import { maxCopies, openLayoutStorage, parseLayout } from '../layoutStorage.js';
import { createLayoutHistory } from '../layoutHistory.js';
import { nearbyPose } from '../sceneCopies.js';
import { originalItems, standBounds, types } from './layout.js';
import { makeMaterials } from './materials.js';
import { makeTree } from './tree.js';
import { buildWorld } from './world.js';
import { christmasFixtures } from './fixtures.js';
import { createInventory } from './inventory.js';
import { itemTop, noelBounds, onSurface, placementOnRay, placementSurfaces, rearrange, supportedHeight, withinAisle } from './arrangement.js';

const clamp = THREE.MathUtils.clamp;
const eye = 1.57;
const flightFloor = .38;
const overviewFov = 43;
const mapDiagonal = Math.hypot(mapSize.width, mapSize.depth);
const walkingKeys = {
  ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'forward', KeyZ: 'forward', KeyS: 'back',
  KeyA: 'strafeLeft', KeyQ: 'strafeLeft', KeyD: 'strafeRight',
};
const editingFields = 'dialog, input, textarea, select, [contenteditable]';
const walkStarts = {
  cart: walkFromCart, noel: shiftMarket(walkFromNoel), carrots: shiftMarket(walkFromCarrots),
  salads: walkFromSalads, groceries: walkFromGroceries, bakery: walkFromBakery,
};

function overviewHeight(aspect) {
  const span = Math.max(mapSize.depth, mapSize.width / aspect);
  return span / (2 * Math.tan(THREE.MathUtils.degToRad(overviewFov / 2))) + 1.1;
}

export async function openChristmasViewer(canvas, {
  signal, showDepartment, initialLayout, onLayoutChange, onFailure, onView, onSelection, onCount, onShake,
  hudLayer, onHudChange, onSaveFailure, onHistoryChange,
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
  const camera = new THREE.PerspectiveCamera(overviewFov, 1, 0.023, 68);
  const orbit = new OrbitControls(camera, canvas);
  orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  orbit.minDistance = 0.32;
  orbit.maxDistance = showDepartment ? 38 : 17.5;
  orbit.maxPolarAngle = Math.PI - .23;
  orbit.minPolarAngle = .009;
  orbit.zoomToCursor = true;
  orbit.listenToKeyEvents(canvas);

  const cleanup = [], held = new Map();
  const controls = canvas.closest('main') ?? canvas;
  const bounds = showDepartment ? departmentBounds : noelBounds;
  const storage = openLayoutStorage(initialLayout);
  const history = createLayoutHistory();
  let materials, tree, inventory, department, film, fixtures, hud;
  const rackEditors = new Map();
  let editing = false;
  let location = showDepartment ? 'cart' : 'noel';
  let items = storage.state.christmas ?? originalItems(), selected = null, moving = false, proposed = null, boards = [];
  let placementBlocked = false;
  let frame = 0, last = 0, ready = false, disposed = false, mode = 'free', adjusted = false;
  let yaw = 0, pitch = -0.17, gesture = null, bumpTime = -Infinity;
  const raycaster = new THREE.Raycaster(), point = new THREE.Vector2();
  const intersection = new THREE.Vector3();
  const flyForward = new THREE.Vector3(), flyRight = new THREE.Vector3();
  const flyStep = new THREE.Vector3(), flyEnd = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  function crateEditor(item) {
    return rackEditors.get(item?.kind);
  }

  function placeableBoards(excluded) {
    return [...fixtures.entries.values()].flatMap(({ id, boards = [] }) => {
      if (id === excluded) return [];
      const pose = fixtures.location(id);
      return boards.map((board) => ({ ...board, ...worldOffset(pose, board.x, board.z), yaw: pose.yaw, owner: id }));
    });
  }

  function boardFor(item, boards) {
    return boards.find((support) => item.y >= support.y - 0.027 &&
      (!support.hanging || item.type === 'giftBag' && item.y < .43) && onSurface(item.x, item.z, support, .024));
  }

  function withCarriedItems(id, pose) {
    if (!fixtures.entries.get(id).boards) return items;
    const from = fixtures.location(id);
    const boards = placeableBoards().sort((a, b) => b.y - a.y);
    return items.map((item) => {
      if (boardFor(item, boards)?.owner !== id) return item;
      const { x, z } = localOffset(from, item.x, item.z);
      return { ...item, ...worldOffset(pose, x, z), rotation: item.rotation + pose.yaw - from.yaw };
    });
  }

  function persistLayout(next, remember = true) {
    if (remember && !history.record(storage.state, next)) return;
    storage.replace(next);
    onLayoutChange?.(storage.state);
    onSaveFailure?.(!storage.persisted);
    onHistoryChange?.(history.buttons);
  }

  function save(patch) {
    persistLayout({ ...storage.state, ...patch });
  }

  function selectionKey() {
    if (!selected) return null;
    const editor = crateEditor(selected);
    return { kind: selected.kind, id: editor ? editor.ids[selected.id] : selected.id };
  }

  function resolveSelection(key) {
    if (!key) return null;
    if (!key.kind) return items.find(({ id }) => id === key.id) ?? null;
    if (key.kind === 'fixture') return fixtures.itemById(key.id);
    return crateEditor(key)?.itemById(key.id) ?? null;
  }

  function applyLayout(layout, key = selectionKey(), remember = true) {
    cancelGesture();
    const before = storage.state;
    if (layout.fixtures !== before.fixtures || layout.copies !== before.copies) {
      fixtures.apply(layout.fixtures, layout.copies);
    }
    if (layout.crates !== before.crates || layout.copies !== before.copies) {
      loadCrates(layout.crates, layout.copies);
    }
    if (layout.christmas !== before.christmas) showItems(layout.christmas ?? originalItems());
    persistLayout(layout, remember);
    select(resolveSelection(key));
    changed();
  }

  function historyStep(direction) {
    if (!editing) return;
    const layout = history[direction]();
    if (layout) applyLayout(layout, selectionKey(), false);
  }

  function floorCrates(excluded) {
    return [...rackEditors.values()].flatMap((editor) => editor === excluded ? [] : editor.floorCrates());
  }

  function cratesBlock(ray, distance, excluded) {
    for (const editor of rackEditors.values()) {
      if (editor !== excluded && editor.standId !== excluded && editor.pick(ray, undefined, distance - 0.003)) return true;
    }
    return false;
  }

  function requestDraw() {
    if (ready && !disposed && !frame) frame = requestAnimationFrame(draw);
  }
  function draw(time) {
    frame = 0;
    if (disposed) return;
    const dt = Math.min((time - last) / 1000, .225);
    if (mode === 'free' && held.size) fly(dt);
    if (mode === 'walk') {
      walk(dt);
      camera.rotation.set(pitch,yaw,0,'YXZ');
    }
    const shaking = tree.update(time);
    const settling = film?.update(time);
    const animatingHud = hud?.draw(time);
    renderer.render(scene,camera);
    last=time;
    if (held.size || shaking || settling || animatingHud) requestDraw();
  }

  function itemFootprint({ type, x, z, rotation }) {
    const [w, , d] = types[type].size;
    return { x, z, w, d, yaw: rotation };
  }

  function fixedPath(x, z, bumpTree = true) {
    const treePose = fixtures.location('noel-tree');
    const { radius } = fixtures.entries.get('noel-tree');
    const atTree = Math.hypot(x - treePose.x, z - treePose.z) < radius + .135;
    if (bumpTree && atTree && performance.now() - bumpTime > 3200) {
      bumpTime = performance.now();
      shake();
    }
    if (!containsFootprint(bounds, { x, z, w: 0, d: 0 }) || !fixtures.pathOpen(x, z) ||
        floorCrates().some((crate) => coversFloor(crate, x, z, .135))) return false;
    return !items.some((item) => item.y < .12 && types[item.type].size[1] > .08 &&
      coversFloor(itemFootprint(item), x, z, .12));
  }

  function fly(seconds) {
    const actions = new Set(held.values());
    const forward = Number(actions.has('forward')) - Number(actions.has('back'));
    const strafe = Number(actions.has('strafeRight')) - Number(actions.has('strafeLeft'));
    if (!forward && !strafe) return;
    camera.getWorldDirection(flyForward);
    flyRight.crossVectors(flyForward, up).normalize();
    flyStep.copy(flyForward).multiplyScalar(forward).addScaledVector(flyRight, strafe)
      .setLength(4.2 * seconds);
    flyEnd.copy(camera.position).add(flyStep);
    // Let a distant overview fly back in without snapping the first time a key is pressed.
    flyEnd.x = clamp(flyEnd.x, Math.min(camera.position.x, bounds.left - 4), Math.max(camera.position.x, bounds.right + 4));
    flyEnd.z = clamp(flyEnd.z, Math.min(camera.position.z, bounds.back - 4), Math.max(camera.position.z, bounds.front + 4));
    flyEnd.y = clamp(flyEnd.y, flightFloor, Math.max(camera.position.y, 36));
    orbit.target.add(flyStep.subVectors(flyEnd, camera.position));
    camera.position.copy(flyEnd);
    orbit.update();
    adjusted = true;
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
    if (held.has(input) || mode === 'top') return;
    const idle = held.size === 0;
    held.set(input, action);
    if (idle) {
      hud?.cancelFocus();
      if (mode === 'walk') walk(0.055);
      else fly(0.055);
      last = performance.now();
    }
    requestDraw();
  }

  function stop(input) { held.delete(input); }

  function walkEntry(start) {
    if (fixedPath(start.x, start.z, false)) return start;
    for (const step of [0.35, 0.65, 1, 1.4, 1.85]) {
      for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const x = start.x + dx, z = start.z + dz;
        if (fixedPath(x, z, false)) return { ...start, x, z };
      }
    }
    return start;
  }

  const landmarkFixtures = {
    cart: 'charrette', carrots: 'carrot-stand', noel: 'noel-table-redFront',
    salads: 'salad-stand', groceries: 'olive-stand', bakery: 'pastry',
  };

  function landmarkOffset(spot) {
    const id = landmarkFixtures[spot];
    const pose = fixtures.location(id);
    if (!pose) return { x: 0, z: 0 };
    const initial = fixtures.entries.get(id).initial;
    return { x: pose.x - initial.x, z: pose.z - initial.z };
  }

  function walkStart(spot) {
    if (spot === 'fences') return { x: -6.76, z: 1.40, yaw: Math.PI / 2, pitch: -0.16 };
    const start = walkStarts[spot];
    const offset = landmarkOffset(spot);
    return { ...start, x: start.x + offset.x, z: start.z + offset.z };
  }

  function cameraPose(view, keepTarget = false) {
    mode=view;
    held.clear();
    gesture=null;
    orbit.enabled=view!=='walk';
    hud?.cancelFocus();
    camera.fov=view==='walk' ? 62 : overviewFov;
    camera.updateProjectionMatrix();
    const height = department && view === 'top' ? overviewHeight(camera.aspect) : 0;
    if (department) {
      scene.fog.near = height ? height + 1 : 4.8;
      scene.fog.far = height ? height + 32 : 32;
    }
    if (view==='walk') {
      const start = walkEntry(walkStart(location));
      camera.position.set(start.x, eye, start.z);
      yaw = start.yaw;
      pitch = start.pitch;
      camera.rotation.set(pitch,yaw,0,'YXZ');
    } else if (view === 'top' && department) {
      orbit.target.set(mapCenter.x, 0.35, mapCenter.z);
      camera.position.set(mapCenter.x, height, mapCenter.z + 0.16);
      orbit.update();
    } else if (view==='top') {
      const centerX=(standBounds.left+standBounds.right)/2;
      orbit.target.set(centerX,.39,marketShiftZ);
      camera.position.set(centerX, Math.max(4.9,8.59/camera.aspect),marketShiftZ + .04);
      orbit.update();
    } else if (department && location === 'fences' && !keepTarget) {
      orbit.target.set(-8.15, 0.65, 2.3);
      camera.position.set(-2.9, 7.95, 11.9);
      orbit.update();
    } else if (department && location === 'cart' && !keepTarget) {
      const offset = landmarkOffset('cart');
      const targetHeight = canvas.clientWidth <= 640 ? 0.97 : 0.62;
      orbit.target.set(0.22 + offset.x, targetHeight, cartOrigin.z - 1.23 + offset.z);
      const distance = Math.max(7.4, 7.15 / camera.aspect);
      const elevation = camera.aspect < 1.48 ? 0.33 : 0.45;
      camera.position.copy(orbit.target).add(new THREE.Vector3(0.42, elevation, 0.93).normalize().multiplyScalar(distance));
      orbit.update();
    } else if (department && location === 'carrots' && !keepTarget) {
      const narrow = canvas.clientWidth <= 640;
      const pose = fixtures.location('carrot-stand');
      orbit.target.set(pose.x, narrow ? 0.96 : 0.61, pose.z);
      const distance = Math.max(narrow ? 4.4 : 3.42, 3.67 / camera.aspect);
      camera.position.copy(orbit.target).add(new THREE.Vector3(0.34, 0.58, -1).normalize().multiplyScalar(distance));
      orbit.update();
    } else if (department && location === 'salads' && !keepTarget) {
      const pose = fixtures.location('salad-stand');
      const initial = fixtures.entries.get('salad-stand').initial;
      const angle = pose.yaw - initial.yaw;
      orbit.target.copy(new THREE.Vector3(0, 0.68, 1.18).applyAxisAngle(up, angle))
        .add(new THREE.Vector3(pose.x, 0, pose.z));
      const distance = Math.max(6.18, 7.25 / camera.aspect);
      const direction = new THREE.Vector3(0.89, 1.05, 0.70).applyAxisAngle(up, angle);
      camera.position.copy(orbit.target).add(direction.setLength(distance));
      orbit.update();
    } else if (department && location === 'groceries' && !keepTarget) {
      const pose = fixtures.location('olive-stand');
      const initial = fixtures.entries.get('olive-stand').initial;
      const angle = pose.yaw - initial.yaw;
      orbit.target.set(0, 0.83, 0.92).applyAxisAngle(up, angle).add(new THREE.Vector3(pose.x, 0, pose.z));
      const distance = Math.max(5.34, 6.24 / camera.aspect);
      const direction = new THREE.Vector3(-1, 0.77, 0.45).applyAxisAngle(up, angle);
      camera.position.copy(orbit.target).add(direction.setLength(distance));
      orbit.update();
    } else if (department && location === 'bakery' && !keepTarget) {
      const pose = fixtures.location('pastry');
      const angle = pose.yaw - fixtures.entries.get('pastry').initial.yaw;
      const narrow = canvas.clientWidth <= 640;
      orbit.target.set(0.77, narrow ? 1.53 : 1.05, 2.1).applyAxisAngle(up, angle).add(new THREE.Vector3(pose.x, 0, pose.z));
      const distance = Math.max(8.3, (narrow ? 10.75 : 9.36) / camera.aspect);
      const direction = new THREE.Vector3(-1, 0.37, 0.66).applyAxisAngle(up, angle);
      camera.position.copy(orbit.target).add(direction.setLength(distance));
      orbit.update();
    } else {
      const aspect = camera.aspect;
      if (!keepTarget) {
        const offset = landmarkOffset('noel');
        orbit.target.set(.13 + offset.x, 1.00, .055 + marketShiftZ + offset.z);
      }
      const angle = aspect<1.1 ? -.28 : -.18;
      const distance = Math.max(4.95,8.65/aspect) + .15;
      camera.position.copy(orbit.target).add(new THREE.Vector3(angle,.278,1).normalize().multiplyScalar(distance));
      orbit.update();
    }
    onView(view);
    requestDraw();
  }
  function view(preset) {
    if (department && mode === 'walk') {
      const { x, z } = camera.position;
      const nearby = [...Object.keys(walkStarts), 'fences'].map((spot) => {
        const start = walkStart(spot);
        return [spot, Math.hypot(start.x - x, start.z - z)];
      });
      location = nearby.reduce((first, second) => first[1] < second[1] ? first : second)[0];
    }
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
    if (department) {
      orbit.maxDistance = Math.max(mapDiagonal + 4, overviewHeight(camera.aspect) + 5);
      camera.far = orbit.maxDistance + mapDiagonal + 10;
    }
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

  function highlight() {
    const active = placing() || Boolean(proposed);
    inventory.highlight(selected?.kind ? null : proposed || selected, active);
    for (const editor of rackEditors.values()) {
      editor.highlight(selected?.kind === editor.kind ? selected.id : undefined, proposed, active);
    }
    fixtures.highlight(selected?.kind === 'fixture' ? selected.id : undefined, proposed, active);
  }
  function placing() {
    return moving || Boolean(gesture?.drag && gesture.moved);
  }
  function sendSelection() {
    highlight();
    const step = crateEditor(selected)?.step(selected.id);
    const key = selectionKey();
    const isCopy = Boolean(key?.kind && Object.hasOwn(storage.state.copies, key.id));
    onSelection(selected ? { ...selected, moving: placing(), placementBlocked, step, isCopy } : null);
    requestDraw();
  }
  function clearPreview() {
    if (!proposed || !selected) return;
    const editor = crateEditor(selected);
    if (editor) editor.preview(selected.id, null);
    else if (selected.kind === 'fixture') {
      fixtures.preview(selected.id, null);
      if (fixtures.entries.get(selected.id).boards) inventory.show(items);
    } else inventory.preview(selected);
    proposed = null;
  }
  function select(item) {
    clearPreview();
    selected = editing ? item : null;
    moving = placementBlocked = false;
    sendSelection();
  }
  function aimForPlacement() {
    if (!editing || !selected || placing()) return;
    moving = true;
    placementBlocked = false;
    if (!selected.kind) boards = placementSurfaces(items, selected.id, placeableBoards());
    sendSelection();
  }
  function cancelMove() {
    if (!editing || !selected || !placing()) return;
    cancelGesture();
    select(selected);
  }
  function changed() {
    renderer.shadowMap.needsUpdate = true;
    requestDraw();
  }
  function place(item, preserveStack = false) {
    if (!editing || !selected || !item) return;
    if (['x', 'y', 'z', 'rotation', 'tiltX', 'tiltZ'].every((field) => Math.abs(selected[field] - item[field]) < 0.0001)) {
      select(selected);
      return;
    }
    const next = preserveStack ? items.map((piece) => piece.id === item.id ? item : piece) :
      rearrange(items, selected.id, item, placeableBoards());
    commitItems(next, item.id);
  }
  function showItems(next) {
    items = next;
    inventory.show(next);
    onCount(next.length);
  }
  function commitItems(next, id) {
    clearPreview();
    showItems(next);
    save({ christmas: next });
    select(next.find((item) => item.id === id) ?? null);
    changed();
  }
  function saveCrateRecords(editors) {
    const next = { ...storage.state.crates };
    for (const editor of editors) {
      editor.ids.forEach((id) => delete next[id]);
      Object.assign(next, editor.record());
    }
    save({ crates: next });
  }
  function commitCrates(editor, next) {
    proposed = null;
    editor.commit(next);
    saveCrateRecords([editor]);
    select(selected);
    changed();
  }
  function commitFixture(pose) {
    const { id } = selected;
    const from = fixtures.location(id);
    if (['x', 'z', 'yaw'].every((field) => Math.abs(from[field] - pose[field]) < 0.0001)) {
      select(selected);
      return;
    }
    proposed = null;
    const carriesItems = Boolean(fixtures.entries.get(id).boards);
    const next = withCarriedItems(id, pose);
    fixtures.commit(id, pose);
    if (next !== items) showItems(next);
    const record = { ...storage.state.fixtures, [id]: pose };
    save(carriesItems ? { fixtures: record, christmas: items } : { fixtures: record });
    select(selected);
    changed();
  }
  function withoutEntries(record, excluded) {
    return Object.fromEntries(Object.entries(record).filter(([id]) => !excluded.has(id)));
  }
  function remove() {
    if (!editing || !selected) return;
    if (!selected.kind) {
      commitItems(rearrange(items, selected.id, null, placeableBoards()), null);
      return;
    }
    const { id, kind } = selectionKey();
    const layout = storage.state;
    if (!Object.hasOwn(layout.copies, id)) return;
    const excluded = new Set([id]);
    const field = kind === 'fixture' ? 'fixtures' : 'crates';
    const christmas = kind === 'fixture' ? itemsAfterFixtureRemoval(id) : items;
    applyLayout({
      ...layout, [field]: withoutEntries(layout[field], excluded), copies: withoutEntries(layout.copies, excluded),
      christmas: christmas === items ? layout.christmas : christmas,
    }, null);
  }
  function itemsAfterFixtureRemoval(id) {
    if (!fixtures.entries.get(id).boards) return items;
    const boards = placeableBoards().sort((a, b) => b.y - a.y);
    const displaced = items.filter((item) => boardFor(item, boards)?.owner === id).sort((a, b) => a.y - b.y);
    if (!displaced.length) return items;
    const removed = new Set(displaced.map(({ id }) => id));
    const remaining = items.filter(({ id }) => !removed.has(id));
    const supports = boards.filter(({ owner }) => owner !== id);
    for (const item of displaced) {
      const y = supportedHeight(item.x, item.z, placementSurfaces(remaining, item.id, supports), item.y + 0.002);
      remaining.push({ ...item, y, tiltX: 0, tiltZ: 0 });
    }
    return remaining;
  }
  function turn(direction = 1) {
    if (!editing || !selected) return;
    const editor = crateEditor(selected);
    if (selected.kind) {
      clearPreview();
      moving = false;
      const obstacles = placementObstacles(selected);
      const next = editor ? editor.rotate(selected.id, direction, obstacles) :
        fixtures.rotate(selected.id, direction * Math.PI / 12, obstacles);
      if (next) {
        if (editor) commitCrates(editor, next);
        else commitFixture(next);
      } else {
        placementBlocked = true;
        sendSelection();
      }
    } else {
      place({ ...selected, rotation: (selected.rotation + direction * Math.PI / 6) % (Math.PI * 2) }, true);
    }
  }
  function lift(delta) {
    if (!editing || !selected || selected.kind) return;
    const support = supportedHeight(selected.x, selected.z, placementSurfaces(items, selected.id, placeableBoards()), selected.y + .005);
    const y = clamp(selected.y + delta, delta < 0 ? support : 0, 3.1);
    if (Math.abs(y - selected.y) > .0001) place({ ...selected, y });
  }
  function nudge(dx, dz) {
    if (!editing || !selected || selected.kind) return;
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    right.y = 0;
    right.normalize();
    const { x, z } = withinAisle(selected.x + right.x * dx - right.z * dz,
      selected.z + right.z * dx + right.x * dz, selected.type, bounds, selected.rotation);
    const available = placementSurfaces(items, selected.id, placeableBoards());
    const before = supportedHeight(selected.x, selected.z, available, selected.y + .01);
    const after = supportedHeight(x, z, available, Math.max(selected.y + .014, before + .065));
    const target = { ...selected, x, z, y: Math.min(3.1, after + Math.max(0, selected.y - before)) };
    if (giftFits(target)) place(target);
  }
  function newId() {
    return globalThis.crypto?.randomUUID?.() || 'objet-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function giftCopyPose(item) {
    const shape = itemFootprint(item);
    const surfaces = placementSurfaces(items, item.id, placeableBoards());
    function open(pose, y) {
      const box = { ...shape, ...pose };
      const target = { ...item, ...pose, y };
      return giftFits(target) && !items.some((other) => y < itemTop(other) - 0.002 &&
        itemTop(target) > other.y + 0.002 && overlapsFootprint(box, itemFootprint(other)));
    }
    const originalSurface = surfaces.filter((board) => Math.abs(board.y - item.y) <= 0.008 && !board.hanging);
    if (item.y > 0.012 && originalSurface.length) {
      const beside = nearbyPose(shape, shape, (pose) => originalSurface.some((board) => {
        const relative = localOffset(board, pose.x, pose.z);
        const half = halfExtents(shape, (pose.yaw ?? 0) - (board.yaw ?? 0));
        return board.radius ? Math.hypot(Math.abs(relative.x) + half.x, Math.abs(relative.z) + half.z) <= board.radius :
          Math.abs(relative.x) + half.x <= board.w / 2 && Math.abs(relative.z) + half.z <= board.d / 2;
      }) && open(pose, item.y));
      if (beside) return { x: beside.x, z: beside.z, y: item.y };
    }
    const floor = nearbyPose(shape, shape, (pose) => open(pose, 0) &&
      (mode !== 'walk' || !overlapsFootprint({ ...shape, ...pose }, { x: camera.position.x, z: camera.position.z, w: 0.28, d: 0.28 })));
    return floor ? { x: floor.x, z: floor.z, y: 0 } : null;
  }

  function duplicate() {
    if (!editing || !selected || placing()) return null;
    if (!selected.kind) {
      if (items.length >= 4000) return 'limit';
      const pose = giftCopyPose(selected);
      if (!pose) return 'space';
      const item = { ...selected, ...pose, id: newId() };
      commitItems([...items, item], item.id);
      return 'created';
    }

    const layout = storage.state;
    if (Object.keys(layout.copies).length >= maxCopies) return 'limit';
    const key = selectionKey();
    const editor = crateEditor(selected);
    const obstacles = placementObstacles(selected);
    const pose = editor ? editor.copyDestination(selected.id, obstacles) : fixtures.copyDestination(key.id, obstacles);
    if (!pose) return 'space';
    const id = 'copy-' + newId();
    const source = layout.copies[key.id] ?? key.id;
    const field = editor ? 'crates' : 'fixtures';
    applyLayout({ ...layout, [field]: { ...layout[field], [id]: pose }, copies: { ...layout.copies, [id]: source } },
      { kind: key.kind, id });
    return 'created';
  }

  function add(type) {
    if (!editing || !Object.hasOwn(types, type)) return;
    if (department && (location !== 'noel' || mode === 'top')) goTo('noel');
    const viewpoint = mode === 'walk' ? camera.position : orbit.target;
    const offset = landmarkOffset('noel');
    const baseX = clamp(viewpoint.x, standBounds.left + .28 + offset.x, standBounds.right - .28 + offset.x);
    const centerZ = marketShiftZ + offset.z;
    const rear = camera.position.z < centerZ;
    const [w, , d] = types[type].size;
    for (let trial = 0; trial < 160; trial++) {
      const sx = (trial % 8 - 3.5) * .31, sz = Math.floor(trial / 8) * .22;
      const { x, z } = withinAisle(baseX + sx, centerZ + (rear ? standBounds.back - .42 - sz : standBounds.front + .42 + sz), type, bounds);
      const item = { type, x, y: 0, z, rotation: rear ? Math.PI : 0, tiltX: 0, tiltZ: 0 };
      if (!giftFits(item) || items.some((piece) => piece.y < .085 &&
        Math.abs(piece.x - x) < (types[piece.type].size[0] + w) * .48 + .015 &&
        Math.abs(piece.z - z) < (types[piece.type].size[2] + d) * .48 + .015)) continue;
      item.id = newId();
      commitItems([...items, item], item.id);
      aimForPlacement();
      return;
    }
  }

  function resetCrates(...kinds) {
    if (!editing) return;
    const ids = new Set(kinds.flatMap((kind) => rackEditors.get(kind)?.ids ?? []));
    if (!ids.size) return;
    const layout = storage.state;
    for (const [copy, source] of Object.entries(layout.copies)) {
      if (ids.has(source)) ids.add(copy);
    }
    applyLayout({ ...layout, crates: withoutEntries(layout.crates, ids), copies: withoutEntries(layout.copies, ids) }, null);
  }

  function loadCrates(record, copies) {
    rackEditors.forEach((editor) => editor.load(record, copies));
  }
  function restoreNoel() {
    if (!editing) return;
    const layout = storage.state;
    const ids = new Set(Object.keys(layout.fixtures).filter((id) => id.startsWith('noel-')));
    for (const [copy, source] of Object.entries(layout.copies)) {
      if (source.startsWith('noel-')) ids.add(copy);
    }
    applyLayout({
      ...layout, fixtures: withoutEntries(layout.fixtures, ids), copies: withoutEntries(layout.copies, ids),
      christmas: originalItems(),
    }, null);
  }
  function importArrangement(text) {
    if (!editing) return false;
    const layout = parseLayout(text);
    if (!layout) return false;
    applyLayout(layout, null);
    return true;
  }
  function inspect() {
    if (!selected || selected.kind) return;
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
  function placementObstacles(item) {
    const editor = crateEditor(item);
    const solid = editor ? fixtures.footprints() : [];
    solid.push(...floorCrates(editor));
    solid.push(...items.filter(({ y }) => y < .12).map(itemFootprint));
    if (mode === 'walk') solid.push({ x: camera.position.x, z: camera.position.z, w: .28, d: .28 });
    return solid;
  }

  function fixtureBlocks(ray, distance, except, hudRay = false) {
    const limit = distance - 0.003;
    return Boolean(fixtures.pick(ray, { except, limit, blockersOnly: true, hud: hudRay }));
  }

  function giftFits(item) {
    const box = itemFootprint(item);
    if (!containsFootprint(bounds, box)) return false;
    return item.y >= .012 || !fixtures.footprints().concat(floorCrates()).some((solid) => overlapsFootprint(box, solid));
  }

  function targetFor(e, grip) {
    if (!editing || !selected) return null;
    // A stand and its previewed contents must never block their own destination.
    if (selected.kind === 'fixture') clearPreview();
    const ray = pointerRay(e);
    const editor = crateEditor(selected);
    if (editor || selected.kind === 'fixture') {
      const { id } = selected;
      if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1) return null;
      const except = editor?.standId ?? id;
      const prop = grip ? null : inventory.pick(ray);
      const blocked = (distance) => fixtureBlocks(ray, distance, except) ||
        cratesBlock(ray, distance, editor ?? id) ||
        Boolean(prop && prop.distance < distance - .003);
      const obstacles = placementObstacles(selected);
      return editor ? editor.destination(ray, id, blocked, obstacles) :
        fixtures.destination(ray, id, blocked, obstacles, grip);
    }
    const target = placementOnRay(ray, boards, selected, bounds);
    if (!target || !giftFits(target)) return null;
    const distance = intersection.set(target.x, target.y, target.z).distanceTo(ray.origin);
    if (fixtureBlocks(ray, distance) || cratesBlock(ray, distance)) return null;
    return target;
  }
  function hover(e) {
    const target=targetFor(e, gesture?.grip);
    if (!target) clearPreview();
    proposed=target;
    if (target) {
      const editor = crateEditor(selected);
      if (editor) editor.preview(selected.id, target);
      else if (selected.kind === 'fixture') {
        fixtures.preview(selected.id, target);
        const carried = withCarriedItems(selected.id, target);
        if (carried !== items) inventory.show(carried);
      } else inventory.preview(target);
    }
    highlight();
    if (target && placementBlocked) {
      placementBlocked=false;
      sendSelection();
    }
    requestDraw();
  }
  function pointerDown(e) {
    if (e.button !== 0 || disposed) return;
    if (gesture) { gesture.moved = true; return; }
    canvas.focus({ preventScroll: true });
    hud?.cancelFocus();
    const ray = pointerRay(e);
    const unitsPerPixel = 2 * Math.max(0, camera.position.y) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) /
      Math.max(1, canvas.clientHeight);
    const padding = Math.min(.17, unitsPerPixel * (e.pointerType === 'touch' ? 2 : .7));
    const fixture = fixtures.pick(ray, { padding: editing ? padding : 0 });
    const picks = [fixture];
    if (editing) {
      picks.push(inventory.pick(ray));
      for (const editor of rackEditors.values()) picks.push(editor.pick(ray));
    }
    const object = picks.reduce((best, candidate) => candidate && (!best || candidate.distance < best.distance) ? candidate : best, null);
    const filmHit = editing && !moving && !e.shiftKey ? film?.pick(ray) : null;
    const grabbingFilm = Boolean(filmHit && (!object || filmHit.distance < object.distance + .002));
    const hit = object?.item;
    const same = selected && hit?.kind === selected.kind && hit?.id === selected.id;
    const drag = !grabbingFilm && editing && !e.shiftKey && Boolean(!moving && hit && e.pointerType !== 'touch' ||
      same && moving && !hit.kind);
    const grip = drag && hit?.kind === 'fixture' ? fixtures.grab(hit.id, ray, object.distance) : null;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
      moved: false, drag, hit, grip, placement: moving, film: grabbingFilm, unitsPerPixel };
    if (grabbingFilm) film.grab(filmHit.uv);
    if (drag || grabbingFilm) orbit.enabled = false;
    if (drag || grabbingFilm || mode === 'walk') canvas.setPointerCapture(e.pointerId);
  }

  function pointerMove(e) {
    const current = gesture;
    if (!current || e.pointerId !== current.id) {
      if (moving && e.pointerType !== 'touch' && !current) hover(e);
      return;
    }
    const dx = e.clientX - current.x, dy = e.clientY - current.y;
    current.x = e.clientX;
    current.y = e.clientY;
    const startedDrag = !current.moved && Math.hypot(current.x - current.sx, current.y - current.sy) > 6;
    if (startedDrag) current.moved = true;
    if (current.film) {
      film.lift((current.sy - e.clientY) * Math.min(.04, current.unitsPerPixel * 1.3));
      requestDraw();
    } else if (current.drag && current.moved) {
      if (current.hit.kind !== selected?.kind || current.hit.id !== selected?.id) select(current.hit);
      else if (startedDrag) sendSelection();
      if (!current.hit.kind) boards = placementSurfaces(items, selected.id, placeableBoards());
      hover(e);
    } else if (mode === 'walk' && current.moved) {
      yaw -= dx * .0051;
      pitch = clamp(pitch - dy * .0051, -1.49, 1.42);
      requestDraw();
    }
  }

  function pointerUp(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const { drag, hit, grip, moved, placement, film: grabbedFilm } = gesture;
    gesture = null;
    orbit.enabled = mode !== 'walk';
    if (grabbedFilm) {
      film.release(performance.now());
    } else if (!moved && !placement && hud?.selectFromRay(pointerRay(e))) {
      select(null);
    } else if (!editing && !moved && hit?.id === 'noel-tree') {
      shake();
    } else if (editing && (drag && moved || placement && !moved)) {
      const target = targetFor(e, grip);
      const editor = crateEditor(selected);
      if (target && editor) commitCrates(editor, target.locations);
      else if (target && selected.kind === 'fixture') commitFixture(target);
      else if (target) place(target);
      else if (selected) {
        clearPreview();
        placementBlocked = true;
        sendSelection();
      }
    } else if (editing && !moved && !placement) {
      select(hit ?? null);
    }
    requestDraw();
  }

  function cancelGesture() {
    const pointer = gesture?.id;
    const dragged = gesture?.drag && gesture.moved;
    if (gesture?.film) film.release(performance.now());
    gesture = null;
    if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    orbit.enabled = mode !== 'walk';
    clearPreview();
    if (dragged) sendSelection();
    else {
      highlight();
      requestDraw();
    }
  }

  function editKeyAction(event) {
    if (!editing || event.defaultPrevented || event.target.closest?.(editingFields)) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const direction = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' && !event.metaKey ? 'redo' : null;
      if (direction) {
        event.preventDefault();
        historyStep(direction);
      }
      return;
    }
    if (key === 'escape' && selected) {
      event.preventDefault();
      if (placing()) cancelMove();
      else select(null);
    }
    if ((key === 'delete' || key === 'backspace') && selected && event.target === canvas &&
        (!selected.kind || Object.hasOwn(storage.state.copies, selectionKey().id))) {
      event.preventDefault();
      remove();
    }
  }

  function walkKeyAction(event) {
    if (mode === 'top' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.(editingFields)) return;
    const key = event.key.length === 1 ? `Key${event.key.toUpperCase()}` : event.key;
    const action = walkingKeys[event.code] ?? walkingKeys[key];
    if (action && (mode === 'walk' || !key.startsWith('Arrow'))) {
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
    fixtures?.dispose();
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
      department.editors.forEach((editor) => rackEditors.set(editor.kind, editor));
      film = department.film;
    }
    tree = makeTree(materials);
    tree.root.traverse((node) => {
      if (node.isMesh && !node.isInstancedMesh) node.castShadow = node.receiveShadow = true;
    });
    const noel = christmasFixtures(materials, tree);
    noel.forEach(({ node }) => scene.add(node));
    const specs = [...noel, ...(department?.fixtures ?? [])];
    cleanup.push(buildWorld(scene, renderer, materials, department, specs));
    fixtures = createFixtureEditor(scene, specs, bounds, storage.state.fixtures, storage.state.copies);
    loadCrates(storage.state.crates, storage.state.copies);
    if (department && hudLayer) {
      hud = createHudScene({
        scene, camera, sources: department.hudSources, layer: hudLayer, orbit, redraw: requestDraw,
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
        hides: (ray, distance) => fixtureBlocks(ray, distance, undefined, true) || cratesBlock(ray, distance),
        aimOnFoot(point) {
          const dx = camera.position.x - point.x, dz = camera.position.z - point.z;
          yaw = Math.atan2(dx, dz);
          pitch = clamp(Math.atan2(point.y - camera.position.y, Math.hypot(dx, dz)), -1.49, 1.42);
        },
      });
      cleanup.push(hud.dispose);
    }
    inventory=createInventory(scene,materials);
    inventory.show(items);
    onCount(items.length);
    orbit.addEventListener('change', () => {
      if (mode === 'free' && camera.position.y < flightFloor) {
        orbit.target.y += flightFloor - camera.position.y;
        camera.position.y = flightFloor;
        camera.updateMatrixWorld();
      }
      requestDraw();
    });
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
    listen(controls, 'keydown', editKeyAction);
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
      view,goTo,zoom,start,stop,add,remove,turn,lift,nudge,inspect,aimForPlacement,cancelMove,duplicate,
      undo: () => historyStep('undo'),
      redo: () => historyStep('redo'),
      clearSelection: () => select(null),
      setEditing(value) {
        cancelGesture();
        editing = value;
        select(null);
        if (value) hud?.setEnabled(false);
      },
      setHudEnabled: (enabled) => hud?.setEnabled(enabled && !editing),
      closeHud: hud?.close,
      restore: restoreNoel,
      restorePears: () => resetCrates('pear-crate'),
      restoreCarrots: () => resetCrates('crate'),
      restoreSalads: () => resetCrates('salad-crate', 'mushroom-crate'),
      restoreGroceries: () => resetCrates('olive-pack', 'herb-bunch'),
      restorePastry: () => resetCrates('chilled-pastry', 'counter-pastry'),
      empty: () => { if (editing) commitItems([], null); },
      exportArrangement: storage.export,
      importArrangement,
      resetLayout(layout) {
        history.clear();
        applyLayout(layout, null, false);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
