import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHistory, graphDates, groupKey, heatRows, isoWeek, periodRange, subgroupRows, summary, tableRows, todayInZurich, trend, validCustomRange } from '../src/features/waste/wasteData.js';
import { formatCurrency, periodLabel } from '../src/features/waste/wasteFormat.js';

const history = buildHistory({
  importedAt: '2026-11-21T10:00:00Z',
  coverage: [['2026-11-01', '2026-11-07'], ['2026-11-09', '2026-11-13']],
  products: [
    [1, 'Aubergine CH', 'Légumes', 'Aubergines', 'Aubergines KG', '1001'],
    [2, 'Aubergine CH', 'Légumes', 'Aubergines', 'Aubergines KG', '1002'],
    [3, 'Aubergine grillée', '4e gamme', 'Aubergines', 'Aubergines grillées PCE'],
    [4, 'Épinard', 'Légumes', 'Épinards', 'Épinards KG'],
  ],
  entries: [
    ['2026-11-06', 1, 60000], ['2026-11-07', 2, 30000],
    ['2026-11-09', 1, 1800], ['2026-11-09', 2, 1200], ['2026-11-09', 3, 9900],
    ['2026-11-10', 4, 500], ['2026-11-11', 1, -100], ['2026-11-13', 1, 3500],
  ],
});

test('rolling periods use the loaded report end and calendar periods use Zurich today', () => {
  const today = todayInZurich(new Date('2026-11-20T23:15:00Z'));
  assert.equal(today, '2026-11-21');
  assert.deepEqual(periodRange('latest', history.latestRecorded, today), ['2026-11-13', '2026-11-13']);
  assert.deepEqual(periodRange('yesterday', history.latest, today), ['2026-11-20', '2026-11-20']);
  assert.deepEqual(periodRange('today', history.latest, today), ['2026-11-21', '2026-11-21']);
  assert.deepEqual(periodRange('beforeYesterday', history.latest, today), ['2026-11-19', '2026-11-19']);
  assert.deepEqual(periodRange('last7', history.latest, today), ['2026-11-07', '2026-11-13']);
  assert.deepEqual(periodRange('last30', history.latest, today), ['2026-10-15', '2026-11-13']);
  assert.deepEqual(periodRange('week', history.latest, today), ['2026-11-16', '2026-11-22']);
  assert.deepEqual(periodRange('month', history.latest, today), ['2026-11-01', '2026-11-30']);
  assert.deepEqual(periodRange('previous', history.latest, today), ['2026-10-01', '2026-10-31']);
  assert.equal(isoWeek(today), 47);
  assert.equal(isoWeek('2021-01-01'), 53);
  assert.equal(periodLabel('week', today), 'Cette semaine (Semaine 47)');
});

test('the last recorded day uses entry dates even when the final covered days are empty', () => {
  const coverage = [['2026-11-14', '2026-11-23']];
  const products = [[1, 'Orange', 'Fruits', 'Oranges', 'Oranges KG']];
  const report = buildHistory({ coverage, products, entries: [['2026-11-21', 1, 0, 0], ['2026-11-20', 1, 3500, 5600]] });

  assert.equal(report.latest, '2026-11-23');
  assert.deepEqual(periodRange('latest', report.latestRecorded, '2026-11-24'), ['2026-11-21', '2026-11-21']);
  const empty = buildHistory({ coverage, products, entries: [] });
  assert.equal(periodRange('latest', empty.latestRecorded, '2026-11-24'), null);
});

test('a 30-day custom heatmap period counts both endpoints across months', () => {
  const available = { first: '2026-01-01', latest: '2026-11-13' };
  assert.equal(validCustomRange(['2026-04-12', '2026-05-11'], available, 30), true);
  assert.equal(validCustomRange(['2026-04-12', '2026-05-12'], available, 30), false);
  assert.equal(validCustomRange(['2026-04-12', '2026-05-12'], available), true);
});

test('the chart omits Sundays and averages covered days before the displayed point', () => {
  const selected = new Set(['Légumes']);
  assert.deepEqual(graphDates(['2026-11-07', '2026-11-10']), ['2026-11-07', '2026-11-09', '2026-11-10']);
  const readings = trend(history, ['2026-11-09', '2026-11-14'], selected, 7);
  assert.deepEqual(readings[0], { day: '2026-11-09', amount: 3000, average: 15000 });
  assert.equal(readings.find(({ day }) => day === '2026-11-12').amount, 0);
  assert.deepEqual(readings.at(-1), { day: '2026-11-14', amount: null, average: null });
  const broken = { ...history, coverage: [['2026-11-06', '2026-11-13']] };
  assert.equal(trend(broken, ['2026-11-09', '2026-11-09'], selected, 7)[0].average, null);
});

test('rankings and heatmaps aggregate by subgroup, retaining distinct articles and category scope', () => {
  const range = ['2026-11-09', '2026-11-13'];
  const bySubgroup = summary(history, range, 'subgroup');
  assert.deepEqual(bySubgroup.breakdown.map(({ name }) => name), ['Fruits', 'Légumes', '4e gamme', 'Herbes', 'Olives', 'Fruits secs']);
  assert.deepEqual(bySubgroup.top.map(({ label, amount }) => [label, amount]), [
    ['Aubergines grillées PCE', 9900], ['Aubergines KG', 6400], ['Épinards KG', 500],
  ]);
  assert.deepEqual(bySubgroup.top[1].children.map(({ reference, amount }) => [reference, amount]), [['1001', 5200], ['1002', 1200]]);
  assert.equal(bySubgroup.top[2].children.length, 0);
  const byGroup = summary(history, range, 'group');
  assert.equal(byGroup.top.filter(({ label }) => label === 'Aubergines').length, 2);
  const subgroups = subgroupRows(history, range);
  const order = { field: 'amount', direction: 'ascending' };
  assert.deepEqual(tableRows(subgroups, null, 'EPI', order).map(({ label }) => label), ['Épinards KG']);
  assert.deepEqual(tableRows(subgroups, new Set([groupKey({ category: 'Légumes', group: 'Aubergines' })]), '1001', order)
    .map(({ amount }) => amount), [6400]);
  const heat = heatRows(history, range, 'group', 'aub');
  assert.equal(heat.rows.length, 2);
  const vegetables = heat.rows.find(({ category }) => category === 'Légumes');
  assert.equal(vegetables.values.get('2026-11-09'), 3000);
  assert.equal(vegetables.children[0].children[0].values.get('2026-11-09'), 1800);
  assert.equal(heatRows(history, ['2026-11-13', '2026-11-13'], 'subgroup', '').rows[0].children.length, 0);
});

test('ranking sums francs and cents before comparing and rounds only at display', () => {
  const day = '2026-11-13';
  const strawberries = ['A', 'B', 'C'].map((name, index) => [index, name, 'Fruits', 'Fraises', 'Fraises 500 g PCE']);
  const report = buildHistory({ coverage: [[day, day]], products: [...strawberries, [4, 'Orange', 'Fruits', 'Oranges', 'Orange KG']],
    entries: [[day, 0, 2020], [day, 1, 2020], [day, 2, 2020], [day, 4, 5000]] });
  const { top } = summary(report, [day, day], 'subgroup');
  assert.deepEqual(top.map(({ label, amount }) => [label, amount]), [['Fraises 500 g PCE', 6060], ['Orange KG', 5000]]);
  assert.equal(formatCurrency(top[0].amount), '61\u00a0CHF');
  assert.equal(formatCurrency(-40), '0\u00a0CHF');
});

test('the work calendar applies to totals and separates a covered zero from an unloaded day', () => {
  const saturday = '2026-11-21';
  const sunday = '2026-11-22';
  const monday = '2026-11-23';
  const tuesday = '2026-11-24';
  const catalog = [[1, 'Orange', 'Fruits', 'Oranges', 'Oranges KG']];
  const work = buildHistory({
    coverage: [[saturday, monday]], products: catalog,
    entries: [[saturday, 1, 600], [sunday, 1, 9000]],
  });
  assert.equal(summary(work, [saturday, monday], 'group').total, 600);
  assert.equal(work.latestRecorded, saturday);
  const demo = buildHistory({
    coverage: [[saturday, monday]], days: [saturday, monday], products: catalog, entries: [[0, 1, 600]],
  });
  assert.deepEqual(trend(demo, [saturday, tuesday], new Set(['Fruits']), 7).map(({ day, amount }) => [day, amount]), [
    [saturday, 600], [monday, 0], [tuesday, null],
  ]);
});
