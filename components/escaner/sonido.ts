'use client';
/** Confirmación sonora opcional (Web Audio, sin archivos). El navegador solo permite sonido después de una interacción. */
let ctx: AudioContext | null = null;

export type TipoSonido = 'ok' | 'aviso' | 'error';

export function sonar(tipo: TipoSonido) {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const notas = tipo === 'ok' ? [[1320, 0.08]] : tipo === 'aviso' ? [[880, 0.09], [880, 0.09]] : [[330, 0.25]];
    let t = ctx.currentTime;
    for (const [f, d] of notas) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = tipo === 'error' ? 'square' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + d + 0.02);
      t += d + 0.06;
    }
  } catch { /* sin sonido disponible */ }
}

const CLAVE = 'siif.sonido';
export function preferenciaSonido(predeterminado: boolean): boolean {
  try { const v = localStorage.getItem(CLAVE); return v == null ? predeterminado : v === '1'; } catch { return predeterminado; }
}
export function guardarPreferenciaSonido(v: boolean) {
  try { localStorage.setItem(CLAVE, v ? '1' : '0'); } catch { /* sin almacenamiento */ }
}
