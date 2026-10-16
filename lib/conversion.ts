/** Conversión explícita entre presentaciones y unidad mínima. Todo inventario se guarda en unidad mínima (entero). */

export interface Presentacion { id: number; nombre: string; factor: number }

export class ErrorConversion extends Error {}

export function validarFactor(factor: unknown): number {
  const f = Number(factor);
  if (!Number.isInteger(f) || f < 1 || f > 100000) {
    throw new ErrorConversion('El factor debe ser un número entero entre 1 y 100,000 unidades mínimas por presentación.');
  }
  return f;
}

/** Cantidad en presentación → unidades mínimas. Rechaza fracciones y negativos. */
export function aUnidadMinima(cantidad: number, factor: number): number {
  validarFactor(factor);
  if (!Number.isInteger(cantidad) || cantidad < 0) throw new ErrorConversion('La cantidad debe ser un número entero no negativo.');
  const r = cantidad * factor;
  if (!Number.isSafeInteger(r) || r > 2_000_000_000) throw new ErrorConversion('La cantidad es demasiado grande.');
  return r;
}

/** Cajas completas + piezas sueltas → unidades mínimas. */
export function desgloseAUnidades(completas: number, sueltas: number, factor: number): number {
  return aUnidadMinima(completas, factor) + aUnidadMinima(sueltas, 1);
}

/** Unidades mínimas → texto legible ("3 CAJA c/5 + 2 AMPULA"). */
export function describirUnidades(unidades: number, unidadMinima: string, p?: Presentacion | null): string {
  const um = unidadMinima.toLowerCase();
  if (!p || p.factor <= 1) return `${unidades.toLocaleString('es-MX')} ${um}`;
  const c = Math.floor(unidades / p.factor), s = unidades % p.factor;
  const pres = `${c.toLocaleString('es-MX')} ${p.nombre.toLowerCase()} c/${p.factor}`;
  return s ? `${pres} + ${s} ${um}` : pres;
}
