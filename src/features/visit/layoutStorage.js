import { normalizeArrangement } from './christmas/arrangement.js';
import { crateRecord, readCrates, readPartitions } from './carrot/arrangement.js';
import { carrotCrateIds, cells, crateSize, partitionFootprint, partitions } from './carrot/layout.js';
import { pearIds, pearSlots } from './pear/layout.js';
import { localSign } from './departmentLayout.js';
import { updateMarketPositions } from './salads/marketPosition.js';

const key = 'rayon74.visit-layout';
const format = 'rayon74-visit-layout';
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const identifier = (id) => /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(id);
export const maxCopies = 512;
export const isCopyId = (id) => typeof id === 'string' && id.startsWith('copy-');
const coordinate = (value) => Number.isFinite(value) && Math.abs(value) <= 128;

function normalizePose(value) {
  if (!record(value) || !coordinate(value.x) || !coordinate(value.z) ||
      !Number.isFinite(value.yaw)) return null;
  return { x: value.x, z: value.z, yaw: value.yaw % (Math.PI * 2) || 0 };
}

function normalizeRecords(value, normalize, max) {
  if (!record(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > max) return null;
  const next = [];
  for (const [id, entry] of entries) {
    if (!identifier(id)) return null;
    const data = normalize(entry);
    if (!data) return null;
    next.push([id, data]);
  }
  return Object.fromEntries(next);
}

function normalizeCrate(value) {
  if (!record(value)) return null;
  const yaw = value.yaw ?? 0;
  if (!Number.isFinite(yaw)) return null;
  const angle = yaw % (Math.PI * 2) || 0;
  if (typeof value.slot === 'string' && identifier(value.slot)) return { slot: value.slot, yaw: angle };
  if (!coordinate(value.x) || !coordinate(value.z)) return null;
  return { x: value.x, z: value.z, yaw: value.yaw === undefined ? Math.PI : angle };
}

export function parseLayout(text) {
  if (typeof text !== 'string' || text.length > 1000000) return null;
  try {
    const value = JSON.parse(text);
    if (value?.format !== format || value.version !== 1) return null;
    const fixtures = normalizeRecords(value.fixtures, normalizePose, 512 + maxCopies);
    const crates = normalizeRecords(value.crates, normalizeCrate, 512 + maxCopies);
    const copies = normalizeRecords(value.copies ?? {}, (source) => (
      typeof source === 'string' && identifier(source) && !isCopyId(source) ? source : null
    ), maxCopies);
    const christmas = value.christmas === undefined ? undefined : normalizeArrangement(value.christmas);
    const sceneRevision = value.sceneRevision ?? 0;
    if (!fixtures || !crates || !copies || !Object.keys(copies).every(isCopyId) || christmas === null || !Number.isInteger(sceneRevision) || sceneRevision < 0) return null;
    return updateMarketPositions({ format, version: 1, sceneRevision, fixtures, crates, christmas, copies });
  } catch {
    return null;
  }
}

export function openLayoutStorage() {
  let saved = null;
  try {
    saved = parseLayout(localStorage.getItem(key));
  } catch {
    // La disposition reste modifiable en mémoire.
  }
  let state = saved ?? updateMarketPositions(legacyLayout());
  let persisted = true;
  function write() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
      persisted = true;
    } catch {
      persisted = false;
    }
  }
  return {
    get state() { return state; },
    get persisted() { return persisted; },
    set(next) {
      state = { ...state, ...next };
      write();
    },
    replace(next) {
      state = next;
      write();
    },
    export() {
      return JSON.stringify(state, null, 2);
    },
  };
}

function readLegacy(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function legacyLayout() {
  const fixtures = {};
  const positions = readPartitions();
  positions.forEach((pose, index) => {
    const { x, z, yaw, photo } = partitions[index];
    if (pose.x !== x || pose.z !== z || pose.yaw !== yaw) fixtures['partition-' + photo] = pose;
  });
  const sign = normalizePose(readLegacy('rayon74-visit-local-sign-v1'));
  if (sign) fixtures['local-sign'] = sign;
  const walls = positions.map((pose, index) => partitionFootprint(index, pose));
  const carrots = readCrates(walls);
  const floor = carrots.filter((item) => item.slot === undefined)
    .map((item) => ({ ...item, w: crateSize.width, d: crateSize.depth }));
  const crates = {
    ...crateRecord(carrots, carrotCrateIds, cells),
    ...crateRecord(readCrates([...walls, ...floor, { ...localSign, ...sign }], pearIds.length, 'rayon74-visit-pear-crates-v1'), pearIds, pearSlots),
  };
  const christmas = normalizeArrangement(readLegacy('rayon74.christmas-arrangement.v1')) ?? undefined;
  return { format, version: 1, fixtures, crates, christmas, copies: {} };
}
