import { isSunday, shiftDay } from '../../app/calendar.js';

export { shiftDay, todayInZurich } from '../../app/calendar.js';

export const categories = [
  { name: 'Légumes', color: '#41917a' },
  { name: 'Fruits', color: '#d89352' },
  { name: '4e gamme', color: '#6983b8' },
  { name: 'Herbes', color: '#8bac68' },
  { name: 'Olives', color: '#9b78a7' },
  { name: 'Fruits secs', color: '#c78377' },
];

const unclassified = { name: 'À classer', color: '#79858b' };
export const allCategories = (available = categories) => new Set(available.map(({ name }) => name));

const frenchSort = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
export const compareNames = (a, b) => frenchSort.compare(a, b);
const date = (day) => new Date(`${day}T00:00:00Z`);
const dayString = (value) => value.toISOString().slice(0, 10);

function weekStart(day) {
  return shiftDay(day, -((date(day).getUTCDay() + 6) % 7));
}

export function isoWeek(day) {
  const monday = weekStart(day);
  const year = shiftDay(monday, 3).slice(0, 4);
  return 1 + (date(monday) - date(weekStart(`${year}-01-04`))) / 604800000;
}

export function periodRange(period, latest, today, custom) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const next = date(monthStart);
  next.setUTCMonth(next.getUTCMonth() + 1);
  switch (period) {
    case 'latest': return latest ? [latest, latest] : null;
    case 'today': return [today, today];
    case 'yesterday': {
      const day = shiftDay(today, -1);
      return [day, day];
    }
    case 'beforeYesterday': {
      const day = shiftDay(today, -2);
      return [day, day];
    }
    case 'week': {
      const monday = weekStart(today);
      return [monday, shiftDay(monday, 6)];
    }
    case 'month': return [monthStart, shiftDay(dayString(next), -1)];
    case 'previous': {
      const yesterday = shiftDay(monthStart, -1);
      return [`${yesterday.slice(0, 7)}-01`, yesterday];
    }
    case 'custom': return custom;
    default: return [shiftDay(latest, period === 'last7' ? -6 : -29), latest];
  }
}

export function validCustomRange([from, to], history, maxDays) {
  return Boolean(from && to && from <= to && from >= history.first && to <= history.latest
    && (!maxDays || to <= shiftDay(from, maxDays - 1)));
}

const includesDay = (range, day) => Boolean(range?.[0] && range?.[1] && day >= range[0] && day <= range[1]);
export function graphDates(range) {
  if (!range?.[0] || !range?.[1]) return [];
  const days = [];
  for (let day = range[0]; day <= range[1]; day = shiftDay(day, 1)) {
    if (!isSunday(day)) days.push(day);
  }
  return days;
}

export function buildHistory({ importedAt, coverage, days, products, entries }, metric = 'pa') {
  const catalog = new Map(products.map(([id, name, category, group, subgroup, reference]) => [
    id, { id, name, category, group, subgroup, reference, subgroupKey: JSON.stringify(['subgroup', category, group, subgroup]) },
  ]));
  const loadedDays = days && new Set(days.filter((day) => !isSunday(day)));
  const ranges = coverage.map(([start, end]) => [
    isSunday(start) ? shiftDay(start, 1) : start, isSunday(end) ? shiftDay(end, -1) : end,
  ]).filter(([start, end]) => start <= end);
  let latestRecorded = null;
  const readings = [];
  for (const [key, id, pa, ventes] of entries) {
    const day = days ? days[key] : key;
    const product = catalog.get(id);
    if (!product || !day || (loadedDays ? !loadedDays.has(day) : isSunday(day))) continue;
    if (!latestRecorded || day > latestRecorded) latestRecorded = day;
    readings.push({ day, product, amount: metric === 'pa' ? pa : ventes });
  }
  return {
    importedAt,
    coverage: ranges,
    loadedDays,
    categories: products.some((product) => product[2] === unclassified.name) ? [...categories, unclassified] : categories,
    first: ranges.reduce((day, [start]) => (!day || start < day ? start : day), null),
    latest: ranges.reduce((day, [, end]) => (!day || end > day ? end : day), null),
    latestRecorded,
    entries: readings,
  };
}

export const isCovered = (history, day) => history.loadedDays
  ? history.loadedDays.has(day) : !isSunday(day) && history.coverage.some((range) => includesDay(range, day));

export const hasCoverage = (history, range) => Boolean(range?.[0] && range?.[1] && range[0] <= range[1] &&
  (history.loadedDays ? [...history.loadedDays].some((day) => includesDay(range, day)) :
    history.coverage.some(([from, to]) => from <= range[1] && to >= range[0] &&
      (range[0] !== range[1] || !isSunday(range[0])))));

export function summary(history, range, grouping) {
  const rows = subgroupRows(history, range);
  const amounts = new Map(history.categories.map(({ name }) => [name, 0]));
  const [vegetables, fruits, ...remainingCategories] = history.categories;
  for (const row of rows) amounts.set(row.category, (amounts.get(row.category) ?? 0) + row.amount);
  return {
    total: rows.reduce((sum, row) => sum + row.amount, 0),
    breakdown: [fruits, vegetables, ...remainingCategories].map((category) => ({ ...category, amount: amounts.get(category.name) })),
    top: rollupRows(rows, grouping).filter((row) => row.amount > 0).sort(highestLoss).slice(0, 10),
  };
}

export function trend(history, range, selected, movingDays) {
  const amounts = new Map();
  for (const { day, product, amount } of history.entries) {
    if (selected.has(product.category)) amounts.set(day, (amounts.get(day) ?? 0) + amount);
  }
  const valueFor = (day) => isCovered(history, day) ? amounts.get(day) ?? 0 : null;
  return graphDates(range).map((day) => {
    const amount = valueFor(day);
    const previous = graphDates([shiftDay(day, -movingDays), shiftDay(day, -1)]).map(valueFor);
    const average = amount === null || previous.some((value) => value === null) ? null
      : previous.reduce((total, value) => total + value, 0) / previous.length;
    return { day, amount, average };
  });
}

const searchKey = (text) => text.normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase();
const byLabel = (a, b) => compareNames(a.label, b.label) || compareNames(a.category, b.category);
const highestLoss = (a, b) => b.amount - a.amount || byLabel(a, b);

export const groupKey = ({ category, group }) => JSON.stringify(['group', category, group]);

function addDay(row, day, amount) {
  row.values.set(day, (row.values.get(day) ?? 0) + amount);
  row.amount += amount;
}

export function subgroupRows(history, range, days = null) {
  const rows = new Map();
  for (const { day, product, amount } of history.entries) {
    if (days ? !days.has(day) : !includesDay(range, day)) continue;
    const { id, name, category, group, subgroup, reference, subgroupKey: key } = product;
    if (!rows.has(key)) rows.set(key, { key, label: subgroup, category, group, amount: 0, values: new Map(), variants: new Map() });
    const row = rows.get(key);
    if (!row.variants.has(id)) row.variants.set(id, {
      key: `variant:${id}`, label: name, reference, category, group, amount: 0, values: new Map(), children: [],
    });
    addDay(row, day, amount);
    addDay(row.variants.get(id), day, amount);
  }
  return [...rows.values()].map(({ variants, ...row }) => {
    const products = [...variants.values()].sort(highestLoss);
    return { ...row, products, children: products.length > 1 || history.loadedDays ? products : [] };
  });
}

function rollupRows(subgroups, grouping) {
  if (grouping === 'subgroup') return subgroups;
  const rows = new Map();
  for (const subgroup of subgroups) {
    const { category, group, values } = subgroup;
    const key = grouping === 'category' ? `category:${category}` : groupKey(subgroup);
    if (!rows.has(key)) rows.set(key, {
      key, label: subgroup[grouping], category, group, amount: 0, values: new Map(), children: [],
    });
    const row = rows.get(key);
    row.children.push(subgroup);
    for (const [day, amount] of values) addDay(row, day, amount);
  }
  return [...rows.values()].map((row) => ({ ...row, children: row.children.sort(byLabel) }));
}

function matchesProduct(row, keyword) {
  return searchKey(row.label).includes(keyword)
    || row.products?.some(({ label, reference }) => searchKey(label).includes(keyword) || reference?.includes(keyword));
}

export function tableRows(subgroups, groups, query, order) {
  const keyword = searchKey(query.trim());
  const direction = order.direction === 'ascending' ? 1 : -1;
  return subgroups.filter((row) => (!groups || groups.has(groupKey(row))) && matchesProduct(row, keyword))
    .sort((a, b) => order.field === 'amount' ? direction * (a.amount - b.amount) || byLabel(a, b) : direction * byLabel(a, b));
}

export function heatRows(history, range, grouping, query) {
  const days = graphDates(range);
  const rows = rollupRows(subgroupRows(history, range, new Set(days)), grouping);
  const keyword = searchKey(query.trim());
  return {
    days,
    covered: days.map((day) => isCovered(history, day)),
    rows: rows.filter((row) => matchesProduct(row, keyword) || row.children.some((child) => matchesProduct(child, keyword)))
      .sort(byLabel),
  };
}
