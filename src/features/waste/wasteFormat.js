import { waste } from '../../content/fr.js';
import { isoWeek } from './wasteData.js';

const shortCurrency = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 });
const monthDay = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'long', timeZone: 'UTC' });
const month = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const stamp = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich' });
const dayDate = (day) => new Date(`${day}T00:00:00Z`);

export const formatAxis = (cents) => shortCurrency.format(Math.abs(cents) < 50 ? 0 : cents / 100);
export const formatCurrency = (cents) => cents === null ? waste.missing : `${formatAxis(cents)}\u00a0CHF`;
export const shortDay = (day) => monthDay.format(dayDate(day));
export const longDay = (day) => fullDate.format(dayDate(day));
export const importStamp = (timestamp) => stamp.format(new Date(timestamp));
export const rangeLabel = ([first, last]) => first === last ? longDay(first)
  : `${first.slice(0, 4) === last.slice(0, 4) ? shortDay(first) : longDay(first)} – ${longDay(last)}`;

export function periodLabel(period, today, isDemo) {
  if (period === 'latest') return isDemo ? waste.lastSimulatedDay : waste.lastDay;
  if (period === 'week') return `${waste.periods.week} (${waste.weekNumber(isoWeek(today))})`;
  if (period === 'month') {
    const label = month.format(dayDate(today));
    return label[0].toUpperCase() + label.slice(1);
  }
  return waste.periods[period];
}
