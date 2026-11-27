import { isSunday, shiftDay } from '../../../app/calendar.js';

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
  const { today, orderDays, wasteDays, wasteUnit } = snapshot;
  const orders = snapshot.orders.filter(({ day }) => !isSunday(day));
  const waste = snapshot.waste.filter(({ day }) => !isSunday(day));
  const workingDays = Array.from({ length: period }, (_, index) => shiftDay(today, index - period + 1))
    .filter((day) => !isSunday(day));
  const start = shiftDay(today, 1 - period);
  const inPeriod = (day) => day >= start && day <= today && !isSunday(day);
  const past = byDay(orders.filter(({ day, kind }) => day < today && kind === 'confirmed'));
  const ordered = orders.filter(({ kind }) => kind === 'ordered');
  const planned = byDay(ordered.filter(({ day }) => day >= today));
  const todayConfirmed = orders.filter(({ day, kind }) => day === today && kind === 'confirmed');

  const zeroWaste = wasteUnit ? [{ unit: wasteUnit, quantity: 0 }] : [];
  const wasteByDay = byDay(waste.filter(({ day }) => inPeriod(day)));
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
      ...(!isSunday(today) ? [{
        day: today, phase: 'today', values: quantities(todayConfirmed.length ? todayConfirmed : planned.get(today) ?? []),
      }] : []),
      ...[...planned].filter(([day]) => day > today).sort(([a], [b]) => a.localeCompare(b))
        .map(([day, values]) => ({ day, phase: 'future', values: quantities(values) })),
    ],
    wasteRows: workingDays.map((day) => ({
      day, phase: day === today ? 'today' : 'past',
      values: wasteByDay.has(day) ? quantities(wasteByDay.get(day)) : knownWasteDay.has(day) ? zeroWaste : [],
    })),
    totalWaste: totalWaste.length || !wasteDays.some(inPeriod) ? totalWaste : zeroWaste,
    totalOrders: quantities(ordered.filter(({ day }) => inPeriod(day))),
    percentage,
    comparedDays: commonDays.size,
    workingDays: workingDays.length,
  };
}
