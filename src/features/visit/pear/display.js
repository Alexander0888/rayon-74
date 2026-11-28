import * as THREE from 'three';
import { Model } from '../model.js';
import { cartRacks, departmentBounds } from '../departmentLayout.js';
import { loadDisplayTextures } from '../texture.js';
import { coverProduce, workCard } from '../workInProgress.js';
import { makeRack } from '../carrot/fixtures.js';
import { crateShell } from '../carrot/crates.js';
import { cellWidth, rackCells } from '../carrot/layout.js';
import { createRackCrateEditor } from '../carrot/rackCrateEditor.js';
import { makeFloorBaskets } from './baskets.js';
import { fillFruitCrate, makePearCrates, orchardMaterials } from './fruit.js';
import { pearIds, pearSlots, pearTypes, pearVisibleColumns } from './layout.js';
import { makeLocalSign } from './localSign.js';
import { makeCoverFilm } from './coverFilm.js';

const urls = import.meta.glob('./assets/*.webp', { eager: true, query: '?url', import: 'default' });
const coveredFruit = [
  ['williams', 'blush', 'blush', 'golden', 'red', 'red'],
  ['williams', 'golden', 'blush', 'golden', 'blush', 'red'],
];

function finishCoveredRack(group, stand, orchard, work, m, detailed) {
  const props = new Model();
  const shelf = props.child([0, stand.y, 0], [stand.slope, 0, 0]);
  const offset = detailed ? pearVisibleColumns : 0;
  const slots = rackCells(stand.columns);
  for (const [index, { x, z }] of slots.entries()) {
    const col = index % stand.columns;
    if (col < offset) continue;
    const crate = shelf.child([x, 0, z]);
    if (detailed) fillFruitCrate(crate, orchard, coveredFruit[Math.floor(index / stand.columns)][col - offset], 9301 + index * 76, false);
    else crateShell(crate, orchard);
  }

  let film;
  if (detailed) {
    film = makeCoverFilm(m, (stand.columns - offset) * cellWidth, stand, offset * cellWidth / 2);
    group.add(film.node);
    workCard(shelf, work, 0.95, 0.265, 0.061);
  } else {
    coverProduce(shelf, stand.columns * cellWidth + 0.025, work, { halfDepth: 0.675, elevation: 0.184 });
    workCard(shelf, work, -0.13, 0.249, 0.16);
  }
  group.add(props.finish(detailed ? 'Fruits sous film transparent' : 'Caisses et protection textile'));
  return film;
}

export async function createOrchardDisplay(m, cartMaterials, work, renderer, signal, cartZ) {
  const textures = await loadDisplayTextures(m, urls, renderer.capabilities.getMaxAnisotropy(), signal, 'orchard-');
  if (!textures || signal.aborted) return null;
  const orchard = orchardMaterials(m, textures);
  const wood = m.textures['carrot-stand-oak'];
  const [left, rightLayout] = cartRacks;
  const right = { ...rightLayout, id: 'pear-stand' };
  const covered = makeRack(m, wood, left);
  const pears = makeRack(m, wood, right);
  finishCoveredRack(covered.group, left, orchard, work, m, false);
  const film = finishCoveredRack(pears.group, right, orchard, work, m, true);

  const local = makeLocalSign(m, textures['local-sign']);
  const models = makePearCrates(orchard);
  const root = new THREE.Group();
  root.name = 'Présentoirs et panneau près de la charrette';
  root.add(covered.group, pears.group, local.node, ...models);
  const crates = createRackCrateEditor({
    root, stand: right, slots: pearSlots, types: pearTypes, models, proxy: pears.proxy, bounds: departmentBounds,
    kind: 'pear-crate', ids: pearIds, pickHeight: 0.238,
  });
  const floor = makeFloorBaskets(m, cartMaterials, orchard, textures, cartZ);
  root.add(floor.group);
  return {
    root, crates, film, hudSources: floor.hudSources,
    fixtures: [
      { ...left, id: 'covered-left-stand', node: covered.group, height: 1.10, proxy: covered.proxy },
      { ...right, node: pears.group, height: 1.10, proxy: pears.proxy, follow: crates.setStandPose },
      local, ...floor.fixtures,
    ],
    dispose() {
      crates.dispose();
      floor.dispose();
    },
  };
}
