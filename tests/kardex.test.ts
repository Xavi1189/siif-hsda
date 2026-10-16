import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import type { Db } from '@/lib/db-core';
import { baseDePrueba, crearUsuarioPrueba } from './helpers';

/**
 * Reglas de integridad del kárdex que viven en la base de datos (no dependen de la interfaz).
 * Las funciones de entradas, salidas y transferencias llegan en Fase 3 y se apoyarán en estas reglas.
 */
let db: Db, usuario: string, producto: number, lote: number, ubic: number, ubic2: number, concepto: number, area: number;

async function operacion(movs: { ubicacion: number; cantidad: number }[], clave: string = crypto.randomUUID()) {
  return db.tx(async (tx) => {
    const op = (await tx.query<{ id: string }>(
      `INSERT INTO operaciones (clave_idempotencia, concepto_id, area_id, usuario_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [clave, concepto, area, usuario])).rows[0].id;
    for (const m of movs) {
      await tx.query(`INSERT INTO movimientos (operacion_id, ubicacion_id, lote_id, producto_id, cantidad) VALUES ($1, $2, $3, $4, $5)`,
        [op, m.ubicacion, lote, producto, m.cantidad]);
    }
    return op;
  });
}
const saldo = async (u: number) =>
  Number((await db.query<{ c: number }>('SELECT coalesce(sum(cantidad),0)::int c FROM existencias WHERE ubicacion_id = $1 AND lote_id = $2', [u, lote])).rows[0].c);

beforeAll(async () => {
  db = await baseDePrueba();
  usuario = await crearUsuarioPrueba(db, 'encargado');
  producto = (await db.query<{ id: number }>(`INSERT INTO productos (clave, descripcion, unidad_minima) VALUES ('T001', 'KETOROLACO 30MG/1ML SOL INY', 'AMPULA') RETURNING id`)).rows[0].id;
  lote = (await db.query<{ id: number }>(`INSERT INTO lotes (producto_id, numero_lote, caducidad) VALUES ($1, 'L-100', '2027-06-30') RETURNING id`, [producto])).rows[0].id;
  const u = (await db.query<{ id: number; area_id: number }>(`SELECT u.id, u.area_id FROM ubicaciones u JOIN areas a ON a.id = u.area_id WHERE a.codigo = 'HOSP' AND u.codigo = 'GENERAL'`)).rows[0];
  ubic = u.id; area = u.area_id;
  ubic2 = (await db.query<{ id: number }>(`SELECT u.id FROM ubicaciones u JOIN areas a ON a.id = u.area_id WHERE a.codigo = 'TRANSITO'`)).rows[0].id;
  concepto = (await db.query<{ id: number }>(`SELECT id FROM conceptos WHERE codigo = 'COMPRA'`)).rows[0].id;
});
afterAll(async () => { await db.cerrar(); });

describe('kárdex y existencias', () => {
  it('una entrada aumenta el saldo en la misma transacción', async () => {
    await operacion([{ ubicacion: ubic, cantidad: 50 }]);
    expect(await saldo(ubic)).toBe(50);
  });

  it('una salida que dejaría saldo negativo se rechaza y no aplica NADA de la operación', async () => {
    const opsAntes = (await db.query<{ n: number }>('SELECT count(*)::int n FROM operaciones')).rows[0].n;
    await expect(operacion([{ ubicacion: ubic, cantidad: -10 }, { ubicacion: ubic, cantidad: -45 }])).rejects.toThrow(/Existencia insuficiente/);
    expect(await saldo(ubic)).toBe(50);
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM operaciones')).rows[0].n).toBe(opsAntes);
  });

  it('salida exacta deja el saldo en cero (no negativo)', async () => {
    await operacion([{ ubicacion: ubic, cantidad: -50 }]);
    expect(await saldo(ubic)).toBe(0);
    await operacion([{ ubicacion: ubic, cantidad: 20 }]);
  });

  it('un traspaso (sale de una ubicación y entra a otra) nunca duplica existencias', async () => {
    const total = async () => (await saldo(ubic)) + (await saldo(ubic2));
    const antes = await total();
    await operacion([{ ubicacion: ubic, cantidad: -8 }, { ubicacion: ubic2, cantidad: 8 }]);
    expect(await total()).toBe(antes);
    expect(await saldo(ubic2)).toBe(8);
  });

  it('la misma clave de idempotencia no se registra dos veces (doble Enter / doble escaneo)', async () => {
    const clave = crypto.randomUUID();
    await operacion([{ ubicacion: ubic, cantidad: 5 }], clave);
    const s = await saldo(ubic);
    await expect(operacion([{ ubicacion: ubic, cantidad: 5 }], clave)).rejects.toThrow(/duplicate key|llave duplicada|unique/i);
    expect(await saldo(ubic)).toBe(s);
  });

  it('los movimientos y operaciones confirmados no se pueden modificar ni borrar', async () => {
    await expect(db.query('UPDATE movimientos SET cantidad = 999')).rejects.toThrow(/solo agregar/);
    await expect(db.query('DELETE FROM movimientos')).rejects.toThrow(/solo agregar/);
    await expect(db.query('UPDATE operaciones SET referencia = $1', ['x'])).rejects.toThrow(/solo agregar/);
    await expect(db.query('TRUNCATE movimientos CASCADE')).rejects.toThrow(/solo agregar/);
  });

  it('las existencias no se pueden escribir a mano, solo por movimientos', async () => {
    await expect(db.query('UPDATE existencias SET cantidad = 1000')).rejects.toThrow(/solo cambian mediante movimientos/);
    await expect(db.query('INSERT INTO existencias (ubicacion_id, lote_id, producto_id, cantidad) VALUES ($1, $2, $3, 5)', [ubic2 + 0, lote, producto]))
      .rejects.toThrow(/solo cambian mediante movimientos|duplicate/);
  });

  it('el saldo guardado coincide con la suma del kárdex (conciliación sin diferencias)', async () => {
    const r = await db.query('SELECT * FROM siif_verificar_existencias()');
    expect(r.rows).toEqual([]);
  });

  it('un movimiento con lote de otro producto se rechaza', async () => {
    const otro = (await db.query<{ id: number }>(`INSERT INTO productos (clave, descripcion, unidad_minima) VALUES ('T002', 'PARACETAMOL 500MG TAB', 'TABLETA') RETURNING id`)).rows[0].id;
    await expect(db.tx(async (tx) => {
      const op = (await tx.query<{ id: string }>(`INSERT INTO operaciones (clave_idempotencia, concepto_id, area_id, usuario_id) VALUES ($1,$2,$3,$4) RETURNING id`,
        [crypto.randomUUID(), concepto, area, usuario])).rows[0].id;
      await tx.query(`INSERT INTO movimientos (operacion_id, ubicacion_id, lote_id, producto_id, cantidad) VALUES ($1,$2,$3,$4,1)`, [op, ubic, lote, otro]);
    })).rejects.toThrow(/no pertenece al producto/);
  });

  it('no se mezclan lotes: mismo número con distinta caducidad es otro lote; repetido exacto se rechaza', async () => {
    await db.query(`INSERT INTO lotes (producto_id, numero_lote, caducidad) VALUES ($1, 'L-100', '2028-01-31')`, [producto]);
    await expect(db.query(`INSERT INTO lotes (producto_id, numero_lote, caducidad) VALUES ($1, 'L-100', '2027-06-30')`, [producto])).rejects.toThrow();
    await db.query(`INSERT INTO lotes (producto_id, numero_lote, caducidad) VALUES ($1, 'SIN-CAD', NULL)`, [producto]);
    await expect(db.query(`INSERT INTO lotes (producto_id, numero_lote, caducidad) VALUES ($1, 'SIN-CAD', NULL)`, [producto])).rejects.toThrow();
  });

  it('una operación solo puede revertirse una vez', async () => {
    const op = await operacion([{ ubicacion: ubic, cantidad: 3 }]);
    const rev = (await db.query<{ id: number }>(`SELECT id FROM conceptos WHERE codigo = 'REVERSA'`)).rows[0].id;
    const ins = (clave: string) => db.query(`INSERT INTO operaciones (clave_idempotencia, concepto_id, area_id, usuario_id, revierte_a) VALUES ($1,$2,$3,$4,$5)`,
      [clave, rev, area, usuario, op]);
    await ins(crypto.randomUUID());
    await expect(ins(crypto.randomUUID())).rejects.toThrow();
  });

  it('la bitácora de auditoría es de solo agregar', async () => {
    await db.query(`INSERT INTO auditoria (usuario_id, accion) VALUES ($1, 'prueba')`, [usuario]);
    await expect(db.query('DELETE FROM auditoria')).rejects.toThrow(/solo agregar/);
    await expect(db.query(`UPDATE auditoria SET accion = 'otra'`)).rejects.toThrow(/solo agregar/);
  });
});
