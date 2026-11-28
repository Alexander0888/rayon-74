import * as THREE from 'three';
import { atlasUV, lathe, tau } from '../model.js';
import { surface } from '../christmas/geometry.js';

export function ingredient(geometry, tile) {
  return atlasUV(geometry, tile, 4, 2, 0.025, 0.025);
}

export function pastryCrust() {
  const profile = [[0, 0], [0.79, 0], [0.91, 0.08], [0.96, 0.23], [1, 0.85],
    [0.99, 0.95], [0.95, 1], [0.87, 0.98], [0.83, 0.73], [0, 0.73]];
  const geometry = surface(profile.length - 1, 40, (u, v) => {
    const [radius, y] = profile[Math.round(v * (profile.length - 1))];
    const a = tau * u;
    const edge = 1 + 0.027 * Math.cos(a * 19) * Math.min(radius, 1);
    return [Math.sin(a) * radius * edge, y + Math.cos(a * 21) * 0.023 * radius, Math.cos(a) * radius * edge];
  });
  return ingredient(geometry, 0);
}

export function raspberryGeometry() {
  const outline = [[0, 0.02], [0.50, 0.03], [0.78, 0.14], [0.96, 0.38], [1, 0.59],
    [0.91, 0.81], [0.76, 0.96], [0.49, 1], [0.27, 0.79], [0.10, 0.65], [0, 0.63]];
  const geometry = surface(outline.length - 1, 16, (u, v) => {
    const a = tau * u, [radius, height] = outline[Math.round(v * (outline.length - 1))];
    const bumps = Math.cos(a * 8 + Math.round(v * 10) % 2 * 0.45) * 0.065 + Math.sin(v * 25) * 0.049;
    const r = radius * (1 + bumps + Math.sin(a * 4) * 0.025);
    return [Math.sin(a) * r, height * (1 + Math.sin(a * 5) * 0.035 * r), Math.cos(a) * r];
  });
  return ingredient(geometry, 5);
}

export function blueberryCrown() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 11; i++) {
    const angle = tau * i / 10;
    const radius = i % 2 ? 0.51 : 1;
    const x = Math.sin(angle) * radius, y = Math.cos(angle) * radius;
    if (i) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  }
  return new THREE.ShapeGeometry(shape);
}

export function seedFruit() {
  const flesh = surface(9, 12, (u, v) => {
    const a = -tau * u, width = Math.sin(Math.PI * v) ** 0.78 * (0.55 + v * 0.56);
    const crown = Math.sin(v * 1.76) * 0.20;
    return [Math.sin(a) * width, crown + Math.cos(a) * width * 0.49, v - 0.5];
  });
  return ingredient(flesh, 6);
}

export function bakedOval(tile = 4) {
  const geometry = surface(12, 16, (u, v) => {
    const a = tau * u;
    const r = Math.sin(Math.PI * v) ** 0.49;
    const crust = 1 + 0.037 * Math.cos(a * 5 + v * 7) + 0.014 * Math.sin(a * 13 + v * 33);
    return [Math.cos(a) * r * crust + 0.08 * Math.sin(Math.PI * v),
      Math.sin(a) * r * (0.81 + 0.11 * Math.cos(v * 8)) * crust, v - 0.5];
  });
  return ingredient(geometry, tile);
}

export function cupLid() {
  return lathe([[1.026, 0], [1.015, 0.04], [1, 0.22], [0.95, 0.45], [0.81, 0.69],
    [0.67, 0.84], [0.45, 0.93], [0.18, 0.98], [0, 0.97]], 24);
}

export function packCover() {
  const sections = [[0, 0.97], [0.073, 1], [0.22, 0.99], [0.91, 0.77], [1, 0.68], [1, 0]];
  const bevel = (angle) => 0.5 * Math.sign(angle) * Math.abs(angle) ** 0.255;
  return surface(sections.length - 1, 24, (u, v) => {
    const a = tau * u;
    const [y, width] = sections[Math.round(v * (sections.length - 1))];
    const ribs = Math.sin(u * tau * 6) * 0.005 * Math.sin(v * Math.PI);
    return [bevel(Math.sin(a)) * (width + ribs), y, bevel(Math.cos(a)) * (width - ribs)];
  });
}

export function bowlGeometry() {
  return lathe([[0, 0], [0.79, 0], [0.84, 0.035], [0.92, 0.45], [1, 0.98], [1.021, 1.02]], 26);
}

export const circularFrosting = new THREE.CylinderGeometry(1, 0.97, 1, 28);
export const decorationSphere = new THREE.SphereGeometry(1, 10, 7);
export const powderedTop = ingredient(new THREE.CircleGeometry(1, 38), 2);
export const blueberryBody = new THREE.SphereGeometry(1, 10, 7);
