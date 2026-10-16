/**
 * Códigos de barras: normalización GTIN y lectura de GS1 (AI 01, 10, 17, 11, 15, 21, 30).
 * Se usa igual en el navegador y en el servidor.
 *
 * No todos los códigos traen lote o caducidad: un EAN-13 de caja solo identifica el producto.
 * Solo los códigos GS1 (DataMatrix o GS1-128) pueden traerlos, y aun así se confirman en pantalla.
 */

export const GS = '\u001d'; // FNC1 / separador de grupo

export interface LecturaGS1 {
  gtin: string;          // 14 dígitos
  lote?: string;
  caducidad?: string;    // AAAA-MM-DD (día 00 → último día del mes)
  serie?: string;
  cantidad?: number;
  ais: Record<string, string>;
}

export interface CodigoInterpretado {
  original: string;
  /** Clave con la que se guarda y busca el código. Para GTIN válidos: 14 dígitos. */
  normalizado: string;
  tipo: 'GTIN' | 'INTERNO' | 'OTRO';
  gs1?: LecturaGS1;
  advertencias: string[];
}

/** Dígito verificador GS1 (módulo 10) sobre los primeros n-1 dígitos. */
export function digitoVerificadorGS1(sinDigito: string): number {
  let suma = 0;
  const ds = sinDigito.split('').reverse();
  ds.forEach((c, i) => { suma += Number(c) * (i % 2 === 0 ? 3 : 1); });
  return (10 - (suma % 10)) % 10;
}

export function gtinValido(codigo: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(codigo)) return false;
  return digitoVerificadorGS1(codigo.slice(0, -1)) === Number(codigo.at(-1));
}

/** EAN-8, UPC-A, EAN-13 y GTIN-14 se guardan como GTIN-14 para que la misma caja coincida sin importar el lector. */
export function aGtin14(codigo: string): string {
  return codigo.padStart(14, '0');
}

function fechaGS1(aammdd: string): string | undefined {
  if (!/^\d{6}$/.test(aammdd)) return undefined;
  const aa = +aammdd.slice(0, 2), mm = +aammdd.slice(2, 4), dd = +aammdd.slice(4, 6);
  if (mm < 1 || mm > 12) return undefined;
  // Regla GS1 de siglo: ventana de -49/+50 años respecto a hoy
  const hoy = new Date().getFullYear();
  let anio = 2000 + aa;
  if (anio - hoy > 50) anio -= 100;
  if (hoy - anio > 49) anio += 100;
  const dia = dd === 0 ? new Date(Date.UTC(anio, mm, 0)).getUTCDate() : dd;
  if (dia > new Date(Date.UTC(anio, mm, 0)).getUTCDate()) return undefined;
  return `${anio}-${String(mm).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** AI de longitud fija (sin contar el propio AI). */
const FIJOS: Record<string, number> = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6 };
const VARIABLES = new Set(['10', '21', '22', '30', '37', '240', '241', '250']);

/** Lee una cadena GS1 (con FNC1 como \x1d, con paréntesis, o con identificador de simbología ]d2 / ]C1 / ]Q3). */
export function leerGS1(entrada: string): LecturaGS1 | null {
  let s = entrada.trim();
  s = s.replace(/^\](C1|e0|d2|Q3)/, '');
  if (s.startsWith('(')) {
    // Forma legible: (01)07501234567890(17)271231(10)ABC
    const ais: Record<string, string> = {};
    const re = /\((\d{2,4})\)([^(]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) ais[m[1]] = m[2].trim();
    return armar(ais);
  }
  if (!s.startsWith('01') && !s.startsWith('02')) return null;
  const ais: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    let ai = s.slice(i, i + 2);
    if (FIJOS[ai] !== undefined) {
      const v = s.slice(i + 2, i + 2 + FIJOS[ai]);
      if (v.length !== FIJOS[ai]) return null;
      ais[ai] = v; i += 2 + FIJOS[ai];
      continue;
    }
    if (!VARIABLES.has(ai)) {
      const ai3 = s.slice(i, i + 3);
      if (VARIABLES.has(ai3)) ai = ai3; else break;
    }
    const ini = i + ai.length;
    let fin = s.indexOf(GS, ini);
    if (fin < 0) fin = s.length;
    let v = s.slice(ini, fin);
    // Sin separador FNC1, un lote al final puede traer pegada la caducidad (…17AAMMDD): la separamos con cuidado
    if (fin === s.length && ai === '10') {
      const m = v.match(/^(.+?)17(\d{6})$/);
      if (m && fechaGS1(m[2])) { v = m[1]; ais['17'] = m[2]; }
    }
    ais[ai] = v.slice(0, 20);
    i = fin;
  }
  return armar(ais);
}

function armar(ais: Record<string, string>): LecturaGS1 | null {
  const gtin = ais['01'] ?? ais['02'];
  if (!gtin || !/^\d{14}$/.test(gtin)) return null;
  const r: LecturaGS1 = { gtin, ais };
  if (ais['10']) r.lote = ais['10'].toUpperCase();
  const cad = ais['17'] ? fechaGS1(ais['17']) : undefined;
  if (cad) r.caducidad = cad;
  if (ais['21']) r.serie = ais['21'];
  if (ais['30'] && /^\d{1,8}$/.test(ais['30'])) r.cantidad = Number(ais['30']);
  return r;
}

/** Interpreta lo que llegó del lector: GS1, GTIN/EAN/UPC o código interno. */
export function interpretarCodigo(entrada: string): CodigoInterpretado {
  const original = entrada.replace(/[\r\n]+$/g, '');
  const advertencias: string[] = [];
  const limpio = original.trim();
  const gs1 = leerGS1(limpio);
  if (gs1) {
    if (!gtinValido(gs1.gtin)) advertencias.push('El GTIN del código GS1 no tiene un dígito verificador válido.');
    if (gs1.ais['17'] && !gs1.caducidad) advertencias.push('La caducidad del código GS1 no es una fecha válida.');
    return { original, normalizado: gs1.gtin, tipo: 'GTIN', gs1, advertencias };
  }
  if (/^\d{8}$|^\d{12,14}$/.test(limpio)) {
    if (gtinValido(limpio)) return { original, normalizado: aGtin14(limpio), tipo: 'GTIN', advertencias };
    advertencias.push('Parece un EAN/UPC pero el dígito verificador no coincide; se guardará como código interno.');
  }
  if (/[^\x20-\x7e]/.test(limpio.replace(new RegExp(GS, 'g'), ''))) {
    advertencias.push('El código trae caracteres no estándar. Revisa que el lector use la misma distribución de teclado que la computadora.');
  }
  const normalizado = limpio.replace(new RegExp(GS, 'g'), '').toUpperCase();
  return { original, normalizado, tipo: /^[\x21-\x7e]{4,80}$/.test(normalizado) ? 'INTERNO' : 'OTRO', advertencias };
}
