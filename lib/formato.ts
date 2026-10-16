/** Formatos institucionales: DD/MM/AAAA, MXN y hora de Hermosillo. */
export const ZONA = 'America/Hermosillo';

const fFecha = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });
const fHora = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const fLarga = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fMXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const fNum = new Intl.NumberFormat('es-MX');

export function fecha(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const x = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : new Date(d);
  return isNaN(+x) ? '—' : fFecha.format(x);
}
export function fechaHora(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const x = new Date(d);
  return isNaN(+x) ? '—' : `${fFecha.format(x)} ${fHora.format(x)}`;
}
export function fechaLarga(d: Date = new Date()): string {
  const s = fLarga.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function mxn(n: number | string | null | undefined): string {
  return n == null || n === '' ? '—' : fMXN.format(Number(n));
}
export function num(n: number | string | null | undefined): string {
  return n == null || n === '' ? '—' : fNum.format(Number(n));
}
