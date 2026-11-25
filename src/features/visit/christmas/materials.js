import * as THREE from 'three';
import { randomFrom } from './geometry.js';
import { paintedTexture } from '../texture.js';
import limestone from '../assets/limestone.webp';

const urls = {
  ...import.meta.glob('./assets/*.webp', { eager: true, query: '?url', import: 'default' }),
  './assets/floor-sample.webp': limestone,
};

async function loadPhotos(anisotropy, includeFloor) {
  const loader = new THREE.TextureLoader(), photos = {};
  try {
    const entries = Object.entries(urls).filter(([path]) => (
      !path.endsWith('/scene-preview.webp') && (includeFloor || !path.endsWith('/floor-sample.webp'))
    ));
    const loaded = await Promise.allSettled(entries.map(async ([path, url]) => {
      const name = path.replace('./assets/', '').replace('.webp', '');
      const texture = await loader.loadAsync(url);
      texture.colorSpace = name === 'paper' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, anisotropy);
      texture.wrapS = name === 'paper' || name === 'floor-sample' || /^(tin-|round-|gold-dot$)/.test(name)
        ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.wrapT = name === 'floor-sample' || name === 'paper' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      photos[name] = texture;
    }));
    const error = loaded.find((result) => result.status === 'rejected');
    if (error) throw error.reason;
    return photos;
  } catch (error) {
    Object.values(photos).forEach((texture) => texture.dispose());
    throw error;
  }
}

function wrapperPrint(ink, type) {
  const dark = ['teal', 'mauve', 'chocolate', 'pandoroDark'].includes(type);
  const color = new THREE.Color(ink).getStyle();
  return paintedTexture(512, 256, (ctx, w, h) => {
    const random = randomFrom(74);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1900; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,250,215,.13)' : 'rgba(75,47,38,.09)';
      ctx.fillRect(random() * w, random() * h, 1 + random() * 3, 1);
    }
    const gold = type === 'gold';
    for (let j = 0; j < 13; j++) {
      const y = 8 + j * 20;
      for (let i = -1; i < 10; i++) {
        const x = i * 66 + (j % 2) * 23;
        ctx.fillStyle = dark ? '#e3c69d' : gold ? '#7c4a2b' : '#ad8962';
        ctx.fillRect(x, y - 3, 4.5, 4.5);
        ctx.fillStyle = dark ? '#e6d3b5' : type === 'aqua' ? '#30524b' : '#90674c';
        ctx.font = '7px Georgia';
        ctx.fillText(type === 'aqua' ? 'PANETTONE' : 'il Viaggiator Goloso', x + 7, y + 1);
      }
    }
  });
}

function bottlePrint(type) {
  return paintedTexture(384, 212, (ctx, w, h) => {
    const green = type === 'bottleGreen', red = type === 'bottleRed';
    const accent = green ? '#dfc98f' : '#a98553';
    ctx.fillStyle = green ? '#293e2f' : red ? '#27241e' : '#f1e7d1';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 7, w - 12, h - 14);
    ctx.lineWidth = 1;
    ctx.strokeRect(14, 15, w - 28, h - 30);
    ctx.fillStyle = green || red ? '#eadab3' : '#594332';
    ctx.textAlign = 'center';
    ctx.font = '24px Georgia';
    ctx.fillText('♔', w / 2, 53);
    ctx.font = '16px Georgia';
    ctx.fillText('C H A M P A G N E', w / 2, 82);
    ctx.font = green ? '30px Georgia' : '35px Georgia';
    ctx.fillText(green ? 'Canard-Duchêne' : red ? 'Moët & Chandon' : 'Laurent-Perrier', w / 2, 123);
    ctx.font = '16px Georgia';
    ctx.fillText(green ? 'BRUT · FRANCE' : red ? 'IMPÉRIAL' : 'LA CUVÉE · BRUT', w / 2, 163);
  });
}

export async function makeMaterials(renderer, { includeFloor = true } = {}) {
  const textures = await loadPhotos(renderer.capabilities.getMaxAnisotropy(), includeFloor);
  const presets = new Map();
  const created = new Set();
  function material(options, physical = false) {
    const value = physical ? new THREE.MeshPhysicalMaterial(options) : new THREE.MeshStandardMaterial(options);
    created.add(value);
    return value;
  }
  function paint(color, roughness = 0.57, metalness = 0) {
    const id = `paint-${color}-${roughness}-${metalness}`;
    if (!presets.has(id)) presets.set(id, material({ color, roughness, metalness }));
    return presets.get(id);
  }
  function photo(name, roughness = 0.52, metalness = 0) {
    const id = `photo-${name}-${roughness}-${metalness}`;
    if (!presets.has(id)) presets.set(id, material({ map: textures[name], roughness, metalness }));
    return presets.get(id);
  }
  function paper(type, spec) {
    if (spec.gift) {
      if (!presets.has('gift-paper')) {
        presets.set('gift-paper', material({
          color: 0xe8b5ac, map: textures['red-paper'], bumpMap: textures.paper, bumpScale: 0.00058, roughness: 0.56,
        }));
      }
      return presets.get('gift-paper');
    }
    const map = wrapperPrint(spec.ink, type);
    textures[`generated-${type}`] = map;
    const foil = type === 'gold' || type === 'ivory' || type === 'pearl';
    return material({
      map, roughness: foil ? 0.43 : 0.63, metalness: foil ? 0.25 : 0.07,
      bumpMap: textures.paper, bumpScale: 0.0005, side: THREE.DoubleSide,
    });
  }
  function ribbon(color, velvet = false) {
    const id = `ribbon-${color}-${velvet}`;
    if (!presets.has(id)) presets.set(id, material({
      color, side: THREE.DoubleSide, roughness: velvet ? 0.77 : 0.36, metalness: velvet ? 0 : 0.12,
      sheen: velvet ? 0.9 : 0.32, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#fff3d7'), 0.27),
      sheenRoughness: 0.48, clearcoat: velvet ? 0 : 0.24, clearcoatRoughness: 0.38,
    }, true));
    return presets.get(id);
  }
  function bottleLabel(type) {
    const map = bottlePrint(type);
    textures[`label-${type}`] = map;
    return material({ map, roughness: 0.52, metalness: 0.12 });
  }
  const glass = material({
    color: 0xe5eee5, roughness: 0.12, metalness: 0.18, clearcoat: 1,
    envMapIntensity: 1.5, transparent: true, opacity: 0.235,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  }, true);
  const clearRim = material({
    color: 0xf4eee1, roughness: 0.16, metalness: 0.34, transparent: true, opacity: 0.46, depthWrite: false,
  });
  return {
    textures, paint, photo, paper, ribbon, bottleLabel, glass, clearRim, material,
    dispose() {
      Object.values(textures).forEach((texture) => texture.dispose());
      created.forEach((value) => value.dispose());
    },
  };
}
