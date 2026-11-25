import { shiftDay, todayInZurich } from '../../../app/calendar.js';

function quantities(rows) {
  const totals = new Map();
  for (const { unit, quantity } of rows) {
    totals.set(unit, (totals.get(unit) ?? 0) + Number(quantity));
  }
  return [...totals].map(([unit, quantity]) => ({ unit, quantity }));
}

function byDay(rows) {
  const days = new Map();
  for (const row of rows) {
    const entries = days.get(row.day) ?? [];
    entries.push(row);
    days.set(row.day, entries);
  }
  return days;
}

export function summarizeProduct(snapshot, period) {
  const { today, orders, waste, orderDays, wasteDays, wasteUnit } = snapshot;
  const start = shiftDay(today, 1 - period);
  const inPeriod = (day) => day >= start && day <= today;
  const past = byDay(orders.filter(({ day, kind }) => day < today && kind === 'confirmed'));
  const ordered = orders.filter(({ kind }) => kind === 'ordered');
  const planned = byDay(ordered.filter(({ day }) => day >= today));
  const todayConfirmed = orders.filter(({ day, kind }) => day === today && kind === 'confirmed');

  const zeroWaste = wasteUnit ? [{ unit: wasteUnit, quantity: 0 }] : [];
  const preTodayWaste = byDay(waste.filter(({ day }) => day >= start && day < today));
  const todayWaste = quantities(waste.filter(({ day }) => day === today));
  const knownWasteDay = new Set(wasteDays);
  const commonDays = new Set(orderDays.filter((day) => inPeriod(day) && knownWasteDay.has(day)));
  const comparableOrders = quantities(ordered.filter(({ day }) => commonDays.has(day)));
  const comparableWaste = quantities(waste.filter(({ day }) => commonDays.has(day)));
  const denominator = comparableOrders[0];
  const numerator = comparableWaste[0]?.quantity ?? 0;
  const percentage = comparableOrders.length === 1 && denominator.quantity > 0 &&
    denominator.unit === wasteUnit && comparableWaste.length <= 1 &&
    (!comparableWaste.length || comparableWaste[0].unit === wasteUnit) && numerator >= 0
    ? numerator / denominator.quantity
    : null;

  const totalWaste = quantities(waste.filter(({ day }) => inPeriod(day)));
  return {
    today,
    orderRows: [
      ...[...past].sort(([a], [b]) => a.localeCompare(b)).slice(-3)
        .map(([day, values]) => ({ day, phase: 'past', values: quantities(values) })),
      { day: today, phase: 'today', values: quantities(todayConfirmed.length ? todayConfirmed : planned.get(today) ?? []) },
      ...[...planned].filter(([day]) => day > today).sort(([a], [b]) => a.localeCompare(b))
        .map(([day, values]) => ({ day, phase: 'future', values: quantities(values) })),
    ],
    wasteRows: [
      ...[...preTodayWaste].sort(([a], [b]) => a.localeCompare(b))
        .map(([day, values]) => ({ day, phase: 'past', values: quantities(values) })),
      { day: today, phase: 'today', values: todayWaste.length || !knownWasteDay.has(today) ? todayWaste : zeroWaste },
    ],
    totalWaste: totalWaste.length || !wasteDays.some(inPeriod) ? totalWaste : zeroWaste,
    totalOrders: quantities(ordered.filter(({ day }) => inPeriod(day))),
    percentage,
    comparedDays: commonDays.size,
  };
}

export function demoProduct(product, today = todayInZurich()) {
  const demo = {
    pineapple: { boxes: [4, 3, 5], pack: 8, waste: [3, 2, 1] },
    avocado: { boxes: [3, 2, 4], pack: 16, waste: [5, 2, 3] },
    yellowDragon: { boxes: [2, 1, 3], pack: 7, waste: [1, 2, 1] },
  }[product];
  const past = [-24, -15, -9, -6, -3, -1];
  const orders = [...past, 0, 2, 4, 7].flatMap((offset, index) => {
    const day = shiftDay(today, offset);
    const amount = { day, unit: 'PCE', quantity: demo.boxes[index % 3] * demo.pack };
    return offset < 0 ? [{ ...amount, kind: 'ordered' }, { ...amount, kind: 'confirmed' }] : [{ ...amount, kind: 'ordered' }];
  });
  const waste = past.map((offset, index) => ({
    day: shiftDay(today, offset), unit: 'PCE', quantity: demo.waste[index % 3],
  }));
  const covered = Array.from({ length: 30 }, (_, index) => shiftDay(today, index - 29));
  return { today, orders, waste, orderDays: covered, wasteDays: covered, wasteUnit: 'PCE' };
}
