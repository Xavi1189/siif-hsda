import { describe, it, expect } from 'vitest';
import { aGtin14, gtinValido, interpretarCodigo, leerGS1, GS } from '@/lib/codigos';
import { DetectorEscaneo, FiltroDuplicados } from '@/lib/escaner';
import { aUnidadMinima, describirUnidades, desgloseAUnidades, validarFactor } from '@/lib/conversion';

/** Simula la pistola: teclea cada carácter con `ms` entre teclas y termina con Enter. */
function teclear(d: DetectorEscaneo, texto: string, t0: number, ms: number, fin = 'Enter') {
  let t = t0;
  for (const c of texto) { d.tecla(c, t); t += ms; }
  return d.tecla(fin, t);
}

describe('detector de escaneo (pistola como teclado)', () => {
  it('reconoce una ráfaga rápida terminada en Enter como lectura', () => {
    const r = teclear(new DetectorEscaneo(), '7501234567893', 1000, 8);
    expect(r).toMatchObject({ tipo: 'lectura', codigo: '7501234567893', terminador: 'Enter' });
  });
  it('acepta Tab como terminador (algunas pistolas vienen así de fábrica)', () => {
    expect(teclear(new DetectorEscaneo(), 'ABC12345', 0, 10, 'Tab')).toMatchObject({ tipo: 'lectura', terminador: 'Tab' });
  });
  it('no confunde a una persona escribiendo con la pistola', () => {
    expect(teclear(new DetectorEscaneo(), 'ketorolaco', 0, 140).tipo).toBe('escritura');
  });
  it('ignora lecturas demasiado cortas', () => {
    expect(teclear(new DetectorEscaneo(), '12', 0, 5).tipo).toBe('escritura');
  });
  it('lee escaneos consecutivos sin mezclar caracteres', () => {
    const d = new DetectorEscaneo();
    const a = teclear(d, '7501234567893', 0, 6);
    const b = teclear(d, '7502222222224', 400, 6);
    expect([a, b].map((x) => x.tipo === 'lectura' && x.codigo)).toEqual(['7501234567893', '7502222222224']);
  });
  it('conserva el separador GS1 (FNC1)', () => {
    const d = new DetectorEscaneo();
    let t = 0;
    for (const c of '0107501234567893') { d.tecla(c, t); t += 5; }
    d.tecla('GroupSeparator', t); t += 5;
    for (const c of '10ABC') { d.tecla(c, t); t += 5; }
    const r = d.tecla('Enter', t);
    expect(r.tipo === 'lectura' && r.codigo).toBe('0107501234567893' + GS + '10ABC');
  });
});

describe('filtro de lecturas repetidas', () => {
  it('marca como repetida la misma lectura dentro de la ventana y la acepta fuera de ella', () => {
    const f = new FiltroDuplicados(1500);
    expect(f.revisar('A', 0)).toBe('nueva');
    expect(f.revisar('A', 300)).toBe('repetida');   // doble disparo accidental
    expect(f.revisar('B', 400)).toBe('nueva');
    expect(f.revisar('A', 2500)).toBe('nueva');     // escaneo intencional de otra pieza
  });
  it('con ventana 0 nunca filtra', () => {
    const f = new FiltroDuplicados(0);
    expect([f.revisar('A', 0), f.revisar('A', 0)]).toEqual(['nueva', 'nueva']);
  });
});

describe('GTIN y GS1', () => {
  it('valida el dígito verificador', () => {
    expect(gtinValido('7501234567893')).toBe(true);
    expect(gtinValido('7501234567890')).toBe(false);
    expect(gtinValido('96385074')).toBe(true);          // EAN-8
    expect(aGtin14('7501234567893')).toBe('07501234567893');
  });
  it('lee GTIN, caducidad y lote con separador FNC1', () => {
    const r = leerGS1(`01075012345678931727123110AB-12${GS}21SERIE1`);
    expect(r).toMatchObject({ gtin: '07501234567893', caducidad: '2027-12-31', lote: 'AB-12', serie: 'SERIE1' });
  });
  it('lee la forma con paréntesis y el identificador de simbología ]d2', () => {
    expect(leerGS1('(01)07501234567893(17)280100(10)X55A')).toMatchObject({ lote: 'X55A', caducidad: '2028-01-31' });
    expect(leerGS1(']d2010750123456789310L1')).toMatchObject({ gtin: '07501234567893', lote: 'L1' });
  });
  it('separa la caducidad pegada al final del lote cuando no hay FNC1', () => {
    expect(leerGS1('010750123456789310LOTE9' + '17270630')).toMatchObject({ lote: 'LOTE9', caducidad: '2027-06-30' });
  });
  it('un EAN de caja NO trae lote ni caducidad', () => {
    const r = interpretarCodigo('7501234567893');
    expect(r).toMatchObject({ tipo: 'GTIN', normalizado: '07501234567893' });
    expect(r.gs1).toBeUndefined();
  });
  it('acepta códigos internos con símbolos ASCII y rechaza espacios o caracteres fuera de ASCII', () => {
    expect(interpretarCodigo('Siif-Prueba_7/2').tipo).toBe('INTERNO');
    expect(interpretarCodigo('ABC 123').tipo).toBe('OTRO');
    expect(interpretarCodigo('ABC¿123').tipo).toBe('OTRO');
  });
  it('advierte de un EAN con dígito verificador inválido y de caracteres extraños por distribución de teclado', () => {
    expect(interpretarCodigo('7501234567890').advertencias[0]).toMatch(/verificador/);
    expect(interpretarCodigo('ABC¿123').advertencias.join(' ')).toMatch(/teclado/);
  });
});

describe('conversión de unidades', () => {
  it('convierte con factores explícitos y valida', () => {
    expect(aUnidadMinima(3, 6)).toBe(18);
    expect(desgloseAUnidades(2, 4, 6)).toBe(16);
    expect(() => validarFactor(0)).toThrow();
    expect(() => validarFactor(2.5)).toThrow();
    expect(() => aUnidadMinima(-1, 6)).toThrow();
    expect(() => aUnidadMinima(1.5, 6)).toThrow();
    expect(describirUnidades(16, 'AMPULA', { id: 1, nombre: 'CAJA', factor: 6 })).toBe('2 caja c/6 + 4 ampula');
  });
});
