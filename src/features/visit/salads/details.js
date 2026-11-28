import * as THREE from 'three';
import { atlasUV, plane, rounded } from '../model.js';
import { surface } from '../christmas/geometry.js';
import { crateMaterials } from '../carrot/crates.js';
import { paintedTexture } from '../texture.js';
// Порядок ценников в price-cards.webp, по 6 фотографий в строке.
const cardTypes = [
  'trio', 'butter', 'batavia', 'romaine', 'radicchio', 'swiss-cucumber',
  'bio-cucumber', 'mini-endive', 'radish', 'oakleaf', 'lamb', 'little-gem',
  'iceberg', 'mini-cucumber', 'cucumber', 'endive', 'spring-onion', 'shiitake',
  'organic-brown', 'organic-white', 'paris-white-pack', 'paris-brown-pack', 'chanterelle', 'oyster',
  'paris-white', 'mushroom-mix', 'paris-brown',
];
const wrapperTags = {
  trio: ['TRIO', 'Salades'], lamb: ['RAMPON', 'Suisse'], 'little-gem': ['LITTLE GEM', 'Mini-romaines'],
  'mini-endive': ['MINI ENDIVES', 'Cœurs tendres'], endive: ['ENDIVES', 'Suisse'],
  'bio-cucumber': ['BIO', 'Concombre'], 'organic-brown': ['BIO', 'Champignons bruns'],
  'organic-white': ['BIO', 'Champignons blancs'],
};
const wrapperTypes = Object.keys(wrapperTags);

function packagingLabels() {
  const width = 176, height = 104;
  return paintedTexture(width * 4, height * 2, (ctx) => {
    wrapperTypes.forEach((type, index) => {
      const [name, detail] = wrapperTags[type];
      ctx.save();
      ctx.translate((index % 4) * width, Math.floor(index / 4) * height);
      ctx.fillStyle = '#f6f3e7';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = type === 'mini-endive' ? '#8d983d' : '#426b3a';
      ctx.fillRect(0, 0, 27, height);
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(name, 36, 31, 125);
      ctx.font = '12px sans-serif';
      ctx.fillText(detail, 36, 51, 125);
      ctx.fillStyle = '#303226';
      for (let x = 38; x < 144; x += 3 + (x % 7)) ctx.fillRect(x, 69, 1 + x % 3, 20);
      ctx.restore();
    });
  });
}

function packetFilm() {
  return surface(10, 10, (u, v) => {
    const x = 2 * u - 1, z = 1 - 2 * v;
    const corners = 1 - 0.12 * Math.pow(x * z, 4);
    const crown = (1 - Math.abs(x) ** 4) * (1 - Math.abs(z) ** 5);
    const wrinkles = 0.04 * Math.cos(u * 31 + v * 8) * Math.sin(v * 33 - u * 13);
    return [x * corners * 0.5, 0.23 + 0.76 * crown + wrinkles, z * corners * 0.5];
  });
}

export function marketMaterials(m, { 'produce-skins': skin, 'price-cards': cards }) {
  const wrappers = packagingLabels();
  m.textures.saladLabels = wrappers;
  return {
    ...crateMaterials(m),
    cards: m.material({ map: cards, roughness: 0.72 }),
    cardFaces: new Map(cardTypes.map((type, i) => [type, atlasUV(plane.clone(), i, 6, 5, 0.009, 0.009)])),
    print: m.material({ map: wrappers, roughness: 0.69 }),
    stickers: new Map(wrapperTypes.map((type, i) => [type, atlasUV(plane.clone(), i, 4, 2, 0.015, 0.018)])),
    leaf: m.material({ map: skin, side: THREE.DoubleSide, roughness: 0.74, vertexColors: true }),
    untexturedLeaf: m.material({ side: THREE.DoubleSide, roughness: 0.81, vertexColors: true }),
    cap: m.material({ map: skin, roughness: 0.78, bumpMap: skin, bumpScale: 0.00026 }),
    cucumber: m.material({ map: skin, roughness: 0.44, bumpMap: skin, bumpScale: 0.00043, clearcoat: 0.20 }, true),
    root: m.paint(0xffffff, 0.62),
    pale: m.paint(0xf0e1bb, 0.83),
    tray: m.paint(0xbca882, 0.83),
    limeTray: m.paint(0xa3b34c, 0.64),
    clearTray: m.material({ color: 0xc8e2da, transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.42 }),
    film: m.material({ color: 0xf4fffe, transparent: true, opacity: 0.20, depthWrite: false, roughness: 0.23,
      side: THREE.DoubleSide, metalness: 0.12 }),
    filmMesh: packetFilm(),
  };
}

export function rackCard(model, m, type, { z, y, width = 0.136 }) {
  const x = -0.073, height = width * 186 / 256;
  model.box(m.lip, [x, y - 0.053, z], [0.014, 0.065, 0.013]);
  const sign = model.child([x, y, z], [-0.29, -0.07, 0.035]);
  sign.put(rounded, m.lip, [0, 0, 0], [width + 0.005, height + 0.005, 0.006]);
  sign.put(m.cardFaces.get(type), m.cards, [0, 0, 0.0036], [width, height, 1]);
}

export function packet(model, m, size, tray, label) {
  const [w, h, d] = size;
  if (tray) {
    model.put(rounded, tray, [0, 0.011, 0], [w, 0.019, d]);
    for (const side of [-1, 1]) {
      model.box(tray, [side * w * 0.47, 0.022, 0], [0.006, 0.019, d * 0.93]);
      model.box(tray, [0, 0.022, side * d * 0.47], [w * 0.92, 0.019, 0.006]);
    }
  }
  model.put(m.filmMesh, m.film, [0, 0.007, 0], [w * 1.027, h, d * 1.027]);
  if (label) model.put(m.stickers.get(label), m.print, [w * 0.10, h + 0.008, d * 0.053],
    [w * 0.42, d * 0.31, 1], [-Math.PI / 2, 0, 0.077]);
}
