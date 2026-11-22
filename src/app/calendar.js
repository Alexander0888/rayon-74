const zurichDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const todayInZurich = (now = new Date()) => zurichDate.format(now);
export const isSunday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;

export function shiftDay(day, offset) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
