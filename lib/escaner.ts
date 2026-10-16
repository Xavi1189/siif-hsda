/**
 * Detección de lecturas de una pistola que funciona como teclado (USB o Bluetooth HID).
 * La pistola "teclea" el código muy rápido y termina con Enter (o Tab). Una persona escribe
 * mucho más lento. Con esa diferencia separamos escaneos de escritura normal sin controladores.
 * Lógica pura, sin DOM: se prueba en tests/escaner.test.ts.
 */

export interface OpcionesDetector {
  /** Máximo promedio de milisegundos entre teclas para considerar que es la pistola. */
  msMaxEntreTeclas: number;
  /** Mínimo de caracteres para aceptar una lectura. */
  largoMinimo: number;
  /** Si pasa más que esto entre dos teclas, empieza una ráfaga nueva. */
  msCorte: number;
}

export const OPCIONES_DETECTOR: OpcionesDetector = { msMaxEntreTeclas: 35, largoMinimo: 4, msCorte: 120 };

export type ResultadoTecla =
  | { tipo: 'nada' }
  | { tipo: 'lectura'; codigo: string; msPromedio: number; terminador: 'Enter' | 'Tab' }
  | { tipo: 'escritura' }; // Enter de una persona escribiendo

export class DetectorEscaneo {
  private buf = '';
  private inicio = 0;
  private ultimo = 0;
  constructor(private op: OpcionesDetector = OPCIONES_DETECTOR) {}

  /** Alimentar con cada tecla (key de KeyboardEvent) y su marca de tiempo en ms. */
  tecla(key: string, t: number): ResultadoTecla {
    if (key === 'Enter' || key === 'Tab') {
      const n = this.buf.length;
      const prom = n > 1 ? (this.ultimo - this.inicio) / (n - 1) : Infinity;
      const codigo = this.buf;
      const reciente = t - this.ultimo <= this.op.msCorte;
      this.buf = '';
      if (n >= this.op.largoMinimo && prom <= this.op.msMaxEntreTeclas && reciente) {
        return { tipo: 'lectura', codigo, msPromedio: Math.round(prom * 10) / 10, terminador: key };
      }
      return n ? { tipo: 'escritura' } : { tipo: 'nada' };
    }
    if (key.length !== 1) {
      // Las pistolas configuradas para GS1 envían FNC1 como el carácter GS (Ctrl+])
      if (key === 'GroupSeparator') { this.agregar('\u001d', t); }
      return { tipo: 'nada' };
    }
    this.agregar(key, t);
    return { tipo: 'nada' };
  }

  private agregar(c: string, t: number) {
    if (!this.buf || t - this.ultimo > this.op.msCorte) { this.buf = ''; this.inicio = t; }
    this.buf += c;
    this.ultimo = t;
  }

  /** Caracteres acumulados de la ráfaga en curso (para revertirlos de un campo de texto). */
  get enCurso() { return this.buf; }
  reiniciar() { this.buf = ''; }
}

/**
 * Evita registrar dos veces la misma lectura por accidente (doble disparo del gatillo).
 * Una lectura idéntica dentro de la ventana se marca como repetida; fuera de ella se acepta.
 */
export class FiltroDuplicados {
  private ultimas = new Map<string, number>();
  constructor(public ventanaMs: number) {}
  revisar(codigo: string, t: number): 'nueva' | 'repetida' {
    const previa = this.ultimas.get(codigo);
    this.ultimas.set(codigo, t);
    if (this.ultimas.size > 50) {
      for (const [k, v] of this.ultimas) if (t - v > this.ventanaMs) this.ultimas.delete(k);
    }
    return previa !== undefined && t - previa < this.ventanaMs ? 'repetida' : 'nueva';
  }
}
