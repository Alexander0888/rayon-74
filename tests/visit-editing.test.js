import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createLayoutHistory } from '../src/features/visit/layoutHistory.js';
import { parseLayout } from '../src/features/visit/layoutStorage.js';
import { createFixtureEditor } from '../src/features/visit/fixtureEditor.js';
import { crateRecord, loadCrateCopies, loadCrateRecord, swapCrates } from '../src/features/visit/carrot/arrangement.js';
import { loadProducts, productRecord } from '../src/features/visit/groceries/arrangement.js';

const bounds = { left: -6, right: 6, back: -6, front: 6 };

test('undo and redo treat a swap as one edit and retain redo after an unchanged placement', () => {
  const history = createLayoutHistory();
  const before = { crates: { a: { slot: '1' }, b: { slot: '2' } } };
  const swapped = { crates: { a: { slot: '2' }, b: { slot: '1' } } };
  const rotated = { crates: { ...swapped.crates, a: { slot: '2', yaw: Math.PI } } };
  history.record(before, swapped);
  history.record(swapped, rotated);
  assert.equal(history.undo(), swapped);
  assert.equal(history.undo(), before);
  assert.deepEqual(history.buttons, { undo: false, redo: true });
  assert.equal(history.record(before, { crates: { b: { slot: '2' }, a: { slot: '1' } } }), false);
  assert.equal(history.redo(), swapped);
  assert.equal(history.record(swapped, { crates: {} }), true);
  assert.equal(history.redo(), null);
  assert.equal(history.undo(), swapped);
});

test('a portable layout restores independent partition copies and frees their footprints on removal', () => {
  const root = new THREE.Group(), node = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.08), new THREE.MeshBasicMaterial());
  mesh.position.y = 1;
  node.add(mesh);
  root.add(node);
  const editor = createFixtureEditor(root, [
    { id: 'fence-01', type: 'fence', node, w: 1.2, d: 0.2, height: 2, panel: true },
  ], bounds, {});
  const pose = editor.copyDestination('fence-01', []);
  assert.ok(Math.hypot(pose.x, pose.z) < 1);
  const copyId = 'copy-fence-1';
  const saved = parseLayout(JSON.stringify({
    format: 'rayon74-visit-layout', version: 1, copies: { [copyId]: 'fence-01' },
    fixtures: { [copyId]: pose }, crates: {},
  }));
  editor.apply(saved.fixtures, saved.copies);
  assert.equal(editor.entries.get(copyId).node.children[0].geometry, mesh.geometry);
  assert.deepEqual(editor.location(copyId), pose);
  const moved = { x: 3, z: 2, yaw: Math.PI / 12 };
  editor.commit(copyId, moved);
  assert.deepEqual(editor.location('fence-01'), { x: 0, z: 0, yaw: 0 });
  assert.deepEqual(editor.location(copyId), moved);
  editor.apply({}, {});
  assert.equal(root.getObjectByName(copyId), undefined);
  assert.equal(editor.pathOpen(moved.x, moved.z), true);
  assert.equal(parseLayout(JSON.stringify({ ...saved, copies: { [copyId]: copyId } })), null);
  editor.dispose();
});

test('a copied crate can exchange its floor position with a crate in a rack slot and reload', () => {
  const dimensions = { width: 0.4, depth: 0.3, height: 0.15 };
  const originals = ['crate-a', 'crate-b'];
  const slots = [{ id: '1' }, { id: '2' }];
  const copy = { id: 'copy-crate-a', index: 0 };
  const floor = { x: 1.2, z: 2, yaw: Math.PI };
  const base = loadCrateRecord({}, originals, slots);
  const swapped = swapCrates([...base, floor], 2, 0);
  const record = crateRecord(swapped, [...originals, copy.id], slots, originals.length);
  const reloaded = loadCrateRecord(record, originals, slots);
  const extras = loadCrateCopies(record, [copy], slots, reloaded, bounds, dimensions);
  assert.deepEqual(reloaded[0], floor);
  assert.deepEqual(extras, [{ ...copy, location: { slot: 0, yaw: 0 } }]);
  const invalid = { [copy.id]: { slot: '1', yaw: 0 } };
  assert.deepEqual(loadCrateCopies(invalid, [copy], slots, base, bounds, dimensions), []);
});

test('a copied pack preserves its place in a stack and removing it settles the remaining packs', () => {
  const seats = [{ id: 'olive-1' }, { id: 'olive-2' }];
  const packs = [{ id: 'original-a', slot: 0, layer: 0 }, { id: 'original-b', slot: 1, layer: 0 }];
  const copy = { id: 'copy-pack' };
  const saved = {
    'original-a': { slot: 'olive-1:2', yaw: 0 },
    [copy.id]: { slot: 'olive-1:1', yaw: Math.PI },
  };
  const layout = loadProducts(saved, packs, seats, true, () => true, true, [copy]);
  assert.equal(layout[0].layer, 1);
  assert.equal(layout[2].layer, 0);
  assert.deepEqual(productRecord(layout, [...packs, copy], seats, true), saved);
  const withoutCopy = loadProducts(saved, packs, seats, true);
  assert.equal(withoutCopy[0].layer, 0);
});
