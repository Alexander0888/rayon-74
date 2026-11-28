import * as THREE from 'three';
import { departmentBounds } from '../departmentLayout.js';
import { createProductEditor } from '../groceries/editor.js';
import { loadDisplayTextures } from '../texture.js';
import { makeBreadLayout, stockBakeryCounter } from './bread.js';
import { bakeryCounter, bakeryPartitions, breadStand, cakeCounter, counterStock, fitsPastrySeat,
  refrigeratedStand, refrigeratedStock } from './layout.js';
import { makePastryTemplates, pastryMaterials, pastrySizes } from './products.js';
import { assembleCase, caseMaterials, makeBakeryPartition, makePastryCase } from './stands.js';

const urls = import.meta.glob('./assets/*.webp', { eager: true, query: '?url', import: 'default' });

export async function createBakeryDisplay(m, renderer, signal) {
  const textures = await loadDisplayTextures(m, urls, renderer.capabilities.getMaxAnisotropy(), signal, 'bakery-');
  if (!textures) return null;
  const root = new THREE.Group();
  root.name = 'Pâtisserie et boulangerie';
  const materials = caseMaterials(m, textures);
  const pastry = pastryMaterials(m, textures);
  const templates = makePastryTemplates(pastry, refrigeratedStock.pieces.concat(counterStock.pieces).map(({ type }) => type));

  function withStock(stand, { slots, pieces }, kind, refrigerated) {
    const { model, proxy } = makePastryCase(m, materials, stand, refrigerated);
    if (!refrigerated) {
      for (const { x, y, z } of slots) {
        model.box(materials.seal, [x, y - 0.0015, z], [0.137, 0.003, 0.155]);
      }
      for (const x of [-0.82, -0.49, -0.14, 0.22, 0.58, 0.86]) {
        const card = model.child([x, 0.644, 0.443], [-0.31, 0, 0]);
        card.box(materials.seal, [0, 0, 0], [0.078, 0.048, 0.007]);
        card.box(materials.warmRim, [0, 0.018, 0.004], [0.069, 0.003, 0.001]);
        card.box(pastry.dust, [-0.005, 0.009, 0.004], [0.047, 0.0024, 0.001]);
        card.box(pastry.dust, [0.018, -0.011, 0.004], [0.021, 0.005, 0.001]);
      }
    }
    const node = assembleCase(stand, model, proxy);
    const stock = new THREE.Group();
    stock.name = kind;
    root.add(node, stock);
    const editor = createProductEditor({
      root: stock, initial: stand, proxy, slots, pieces, sizesByType: pastrySizes, templates, bounds: departmentBounds,
      kind, allowFloor: true, shelfStep: 15, seatFits: (seat, size, yaw) => fitsPastrySeat(stand, seat, size, yaw),
    });
    return { editor, fixture: { ...stand, node, proxy, follow: editor.setStandPose } };
  }

  const cold = withStock(refrigeratedStand, refrigeratedStock, 'chilled-pastry', true);
  const low = withStock(cakeCounter, counterStock, 'counter-pastry', false);
  const warm = makePastryCase(m, materials, bakeryCounter, false, true);
  stockBakeryCounter(warm.model, materials, pastry, bakeryCounter);
  const bread = makeBreadLayout(m, materials, pastry, textures, breadStand);
  const counter = assembleCase(bakeryCounter, warm.model, warm.proxy);
  const basket = assembleCase(breadStand, bread);
  const partitions = bakeryPartitions.map((spec) => makeBakeryPartition(m, spec));
  root.add(counter, basket, ...partitions.map(({ node }) => node));

  return {
    root, editors: [cold.editor, low.editor],
    fixtures: [cold.fixture, low.fixture, { ...bakeryCounter, node: counter, proxy: warm.proxy },
      { ...breadStand, node: basket }, ...partitions],
    dispose() { cold.editor.dispose(); low.editor.dispose(); },
  };
}
