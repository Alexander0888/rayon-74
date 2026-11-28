import * as THREE from 'three';
import { Model } from '../model.js';
import { departmentBounds } from '../departmentLayout.js';
import { loadDisplayTextures } from '../texture.js';
import { makeRack } from '../carrot/fixtures.js';
import { createRackCrateEditor } from '../carrot/rackCrateEditor.js';
import { marketMaterials } from './details.js';
import { makeSaladCrates } from './produce.js';
import { makeMushroomCrates } from './mushrooms.js';
import { mushroomCrateSize, mushroomIds, mushroomSlots, mushroomStand, mushroomTypes,
  saladIds, saladSlots, saladStand, saladTypes } from './layout.js';

const urls = import.meta.glob('./assets/*.webp', { eager: true, query: '?url', import: 'default' });

function mistHeads(m, rack) {
  const model = new Model();
  const alloy = m.paint(0x999d94, 0.41, 0.63);
  const rubber = m.paint(0x2d3029, 0.81);
  for (const x of [-1.23, 0, 1.23]) {
    model.rod(alloy, [x, 0.91, -0.575], [x, 1.21, -0.575], 0.007);
    model.rod(alloy, [x, 1.21, -0.575], [x, 1.21, -0.478], 0.0056);
    model.box(rubber, [x, 1.206, -0.468], [0.025, 0.023, 0.022]);
    model.rod(alloy, [x, 1.201, -0.462], [x, 1.188, -0.454], 0.0054);
  }
  rack.add(model.finish('Buses d’humidification'));
}

export async function createSaladDisplay(m, renderer, signal) {
  const textures = await loadDisplayTextures(m, urls, renderer.capabilities.getMaxAnisotropy(), signal, 'salad-');
  if (!textures) return null;
  const materials = marketMaterials(m, textures);
  const root = new THREE.Group();
  root.name = 'Salades et champignons';
  const wood = m.textures['carrot-stand-oak'];
  const salad = makeRack(m, wood, saladStand), mushroom = makeRack(m, wood, mushroomStand);
  mistHeads(m, salad.group);

  function registerRack({ stand, rack, slots, types, ids, models, kind, dimensions, pickHeight, height }) {
    root.add(rack.group, ...models);
    const editor = createRackCrateEditor({
      root, stand, slots, types, models, kind, dimensions, pickHeight, ids, proxy: rack.proxy, bounds: departmentBounds,
    });
    const fixture = { ...stand, node: rack.group, height, proxy: rack.proxy, follow: editor.setStandPose };
    return { editor, fixture };
  }

  const racks = [
    registerRack({ stand: saladStand, rack: salad, slots: saladSlots, types: saladTypes, ids: saladIds,
      models: makeSaladCrates(m, materials), kind: 'salad-crate', pickHeight: 0.258, height: 1.23 }),
    registerRack({ stand: mushroomStand, rack: mushroom, slots: mushroomSlots, types: mushroomTypes, ids: mushroomIds,
      models: makeMushroomCrates(m, materials), kind: 'mushroom-crate', dimensions: mushroomCrateSize, pickHeight: 0.205, height: 1.15 }),
  ];
  return {
    root, editors: racks.map(({ editor }) => editor), fixtures: racks.map(({ fixture }) => fixture),
    dispose() { racks.forEach(({ editor }) => editor.dispose()); },
  };
}
