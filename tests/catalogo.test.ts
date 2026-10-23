import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import type { Db } from '@/lib/db-core';
import { baseDePrueba, crearUsuarioPrueba } from './helpers';
import {
  agregarPresentacion, buscarPorCodigo, buscarProductos, desactivarPresentacion, cambiarControlado, cambiarEtiqueta, desactivarCodigo, guardarParametrosArea,
  guardarProducto, obtenerProducto, verificarCodigo, vincularCodigo, type Actor,
} from '@/lib/catalogo';
import { asignarGruposTerapeuticos, importarCatalogoSiho, type CorteSiho, type GruposPorClave } from '@/lib/siho';
import { tienePermiso, ROLES } from '@/lib/permisos';

let db: Db;
let admin: Actor, encargado: Actor, auxiliar: Actor, consulta: Actor;
const corte: CorteSiho = JSON.parse(fs.readFileSync('data/siho-catalogo-2026-10-15.json', 'utf8'));
const grupos: GruposPorClave = JSON.parse(fs.readFileSync('data/grupos-terapeuticos-2026-10-15.json', 'utf8'));
const base = {
  clave: 'X100', tipo: 'medicamento', descripcion: 'Ketorolaco 30mg/1ml sol iny', unidad_minima: 'ampula', costo_unitario: 12.5,
  cuadro_basico: true, requiere_lote: true, requiere_caducidad: true, estatus: 'activo',
};

beforeAll(async () => {
  db = await baseDePrueba();
  admin = { id: await crearUsuarioPrueba(db, 'administrador'), rol: 'administrador' };
  encargado = { id: await crearUsuarioPrueba(db, 'encargado'), rol: 'encargado' };
  auxiliar = { id: await crearUsuarioPrueba(db, 'auxiliar'), rol: 'auxiliar' };
  consulta = { id: await crearUsuarioPrueba(db, 'consulta'), rol: 'consulta' };
});
afterAll(async () => { await db.cerrar(); });

describe('importación del SIHO', () => {
  it('carga 826 productos únicos de ambas farmacias con su presentación y localización', async () => {
    const r = await db.tx((tx) => importarCatalogoSiho(tx, admin, corte));
    expect(r.productosNuevos).toBe(826);
    const n = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM productos WHERE origen = 'siho'`)).rows[0].n;
    expect(n).toBe(826);
    const pa = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM parametros_area`)).rows[0].n;
    expect(pa).toBe(corte.areas.HOSP.items.length + corte.areas.URG.items.length); // 1,090 registros producto-área
    const fen = (await db.query<{ factor: number; nombre: string }>(
      `SELECT ps.factor, ps.nombre FROM presentaciones ps JOIN productos p ON p.id = ps.producto_id WHERE p.clave = '1010100100' ORDER BY factor`)).rows;
    expect(fen).toEqual([{ factor: 1, nombre: 'AMPULA' }, { factor: 6, nombre: 'CAJA' }]);
  });
  it('es idempotente: importar dos veces no duplica nada', async () => {
    const r = await db.tx((tx) => importarCatalogoSiho(tx, admin, corte));
    expect(r).toMatchObject({ productosNuevos: 0, productosExistentes: 826, presentacionesNuevas: 0, ubicacionesActualizadas: 0 });
  });
  it('no carga existencias (el inventario inicial sale del conteo físico)', async () => {
    expect((await db.query('SELECT 1 FROM existencias')).rows).toHaveLength(0);
  });
  it('solo administrador o Responsable Sanitario importan', async () => {
    await expect(importarCatalogoSiho(db, encargado, corte)).rejects.toThrow(/permiso/);
    await expect(asignarGruposTerapeuticos(db, encargado, grupos)).rejects.toThrow(/permiso/);
  });
  it('asigna el grupo terapéutico a las 826 claves sin sobrescribir lo capturado en SIIF', async () => {
    await db.query(`UPDATE productos SET grupo_terapeutico = 'Oncología' WHERE clave = '1010100100'`);
    expect(await db.tx((tx) => asignarGruposTerapeuticos(tx, admin, grupos))).toBe(825);
    const g = (await db.query<{ clave: string; grupo_terapeutico: string }>(
      `SELECT clave, grupo_terapeutico FROM productos WHERE clave IN ('1010100100', '1010200032') ORDER BY clave`)).rows;
    expect(g).toEqual([{ clave: '1010100100', grupo_terapeutico: 'Oncología' }, { clave: '1010200032', grupo_terapeutico: 'Analgesia' }]);
    expect((await db.query<{ n: number }>(`SELECT count(*)::int n FROM productos WHERE origen = 'siho' AND grupo_terapeutico IS NULL`)).rows[0].n).toBe(0);
    expect(await db.tx((tx) => asignarGruposTerapeuticos(tx, admin, grupos))).toBe(0); // idempotente
    expect((await buscarProductos(db, { grupo: 'Analgesia' })).total).toBe(99);
  });
});

describe('productos', () => {
  it('crea un producto con su unidad mínima (factor 1) y lo registra en la bitácora', async () => {
    const id = await db.tx((tx) => guardarProducto(tx, encargado, base));
    const d = await obtenerProducto(db, id);
    expect(d?.producto.descripcion).toBe('KETOROLACO 30MG/1ML SOL INY');
    expect(d?.presentaciones).toEqual([expect.objectContaining({ nombre: 'AMPULA', factor: 1 })]);
    expect(d?.historial[0].accion).toBe('producto.crear');
  });
  it('rechaza costo negativo y clave duplicada; guarda cuadro básico', async () => {
    await expect(guardarProducto(db, encargado, { ...base, clave: 'X101', costo_unitario: -1 })).rejects.toThrow(/negativo/);
    await expect(guardarProducto(db, encargado, base)).rejects.toThrow(/Ya existe/);
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    expect((await obtenerProducto(db, id))!.producto.cuadro_basico).toBe(true);
  });
  it('registra en la bitácora solo los campos que cambiaron', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    await guardarProducto(db, encargado, { ...base, costo_unitario: 13 }, id);
    const h = (await obtenerProducto(db, id))!.historial[0];
    expect(h.accion).toBe('producto.editar');
    expect(Object.keys((h.detalle as { cambios: object }).cambios)).toEqual(['costo_unitario']);
  });
  it('auxiliar y consulta no pueden editar el catálogo', async () => {
    await expect(guardarProducto(db, auxiliar, { ...base, clave: 'X103' })).rejects.toThrow(/permiso/);
    await expect(guardarProducto(db, consulta, { ...base, clave: 'X104' })).rejects.toThrow(/permiso/);
  });
  it('marcar como controlado exige grupo y un rol con permiso de etiquetas sensibles', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    await expect(db.tx((tx) => cambiarControlado(tx, encargado, id, true, 'II'))).rejects.toThrow(/permiso/);
    await expect(db.tx((tx) => cambiarControlado(tx, admin, id, true, null))).rejects.toThrow(/grupo/);
    await db.tx((tx) => cambiarControlado(tx, admin, id, true, 'II'));
    expect((await obtenerProducto(db, id))!.producto.grupo_controlado).toBe('II');
    // Editar la ficha no toca la marca de controlado
    await guardarProducto(db, encargado, { ...base, costo_unitario: 14 }, id);
    expect((await obtenerProducto(db, id))!.producto.controlado).toBe(true);
    await db.tx((tx) => cambiarControlado(tx, admin, id, false, 'II'));
    const p = (await obtenerProducto(db, id))!.producto;
    expect([p.controlado, p.grupo_controlado]).toEqual([false, null]);
    expect((await obtenerProducto(db, id))!.historial[0].accion).toBe('producto.controlado');
  });
  it('filtra por productos con y sin código vinculado', async () => {
    const con = await buscarProductos(db, { conCodigo: true, porPagina: 200 });
    const sin = await buscarProductos(db, { sinCodigo: true, porPagina: 200 });
    const todos = await buscarProductos(db, {});
    expect(con.total + sin.total).toBe(todos.total);
    expect(con.filas.every((f) => f.codigos > 0)).toBe(true);
    expect(sin.filas.every((f) => f.codigos === 0)).toBe(true);
  });
  it('filtra por cuadro básico y por antibióticos', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    const cb = await buscarProductos(db, { cuadroBasico: true });
    expect(cb.filas.map((f) => f.clave)).toContain('X100');
    expect(cb.filas.every((f) => f.cuadro_basico)).toBe(true);
    expect((await buscarProductos(db, { antibiotico: true })).total).toBe(0);
    const ab = (await db.query<{ id: number }>(`SELECT id FROM etiquetas WHERE codigo = 'ANTIBIOTICO'`)).rows[0].id;
    await db.tx((tx) => cambiarEtiqueta(tx, admin, id, ab, true));
    const r = await buscarProductos(db, { antibiotico: true });
    expect(r.filas.map((f) => f.clave)).toEqual(['X100']);
    await db.tx((tx) => cambiarEtiqueta(tx, admin, id, ab, false));
  });
  it('etiquetas de seguridad: antibiótico disponible; electrolito concentrado incluido en alto riesgo', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    const codigos = (await obtenerProducto(db, id))!.etiquetas.map((e) => e.codigo);
    expect(codigos).toEqual(['LASA', 'ALTO_RIESGO', 'CADENA_FRIA', 'ANTIBIOTICO']);
  });
  it('cambia la unidad mínima (sin movimientos) y renombra su presentación', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = '1010407211'`)).rows[0].id;
    const p = (await obtenerProducto(db, id))!.producto as Record<string, unknown>;
    const datos = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v == null ? '' : v]));
    await db.tx((tx) => guardarProducto(tx, encargado, { ...datos, unidad_minima: 'ampula' }, id));
    const d = (await obtenerProducto(db, id))!;
    expect(d.producto.unidad_minima).toBe('AMPULA');
    expect(d.presentaciones.filter((x) => x.es_unidad).map((x) => x.nombre)).toEqual(['AMPULA']);
  });
  it('valida factores de presentación explícitos', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    await expect(agregarPresentacion(db, encargado, id, 'caja', 2.5)).rejects.toThrow(/entero/);
    await expect(agregarPresentacion(db, encargado, id, 'caja', 0)).rejects.toThrow(/entero/);
    await expect(agregarPresentacion(db, encargado, id, 'ampula', 1)).rejects.toThrow(/unidad mínima/);
    await agregarPresentacion(db, encargado, id, 'caja', 3);
    // Caja con una sola ampolleta: factor 1 permitido con nombre de empaque
    const c1 = await agregarPresentacion(db, encargado, id, 'caja individual', 1);
    const d = (await obtenerProducto(db, id))!.presentaciones;
    expect(d.filter((p) => p.es_unidad).map((p) => p.nombre)).toEqual(['AMPULA']);
    expect(d.find((p) => p.id === c1)).toMatchObject({ nombre: 'CAJA INDIVIDUAL', factor: 1, es_unidad: false });
    await desactivarPresentacion(db, encargado, c1);
    const unidad = d.find((p) => p.es_unidad)!.id;
    await expect(desactivarPresentacion(db, encargado, unidad)).rejects.toThrow(/unidad mínima no se puede/);
    await expect(agregarPresentacion(db, encargado, id, 'CAJA', 3)).rejects.toThrow(/ya existe/);
  });
  it('valida parámetros por área (máximo ≥ mínimo, enteros, ubicación del área)', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    const area = (await db.query<{ id: number }>(`SELECT id FROM areas WHERE codigo = 'URG'`)).rows[0].id;
    const ubicOtra = (await db.query<{ id: number }>(`SELECT u.id FROM ubicaciones u JOIN areas a ON a.id = u.area_id WHERE a.codigo = 'HOSP' AND u.codigo = 'GENERAL'`)).rows[0].id;
    await expect(guardarParametrosArea(db, encargado, id, area, { maneja_en_area: true, minimo: 10, maximo: 5 })).rejects.toThrow(/máximo/);
    await expect(guardarParametrosArea(db, encargado, id, area, { maneja_en_area: true, minimo: 1.5 })).rejects.toThrow(/enteros/);
    await expect(guardarParametrosArea(db, encargado, id, area, { maneja_en_area: true, ubicacion_predeterminada: ubicOtra })).rejects.toThrow(/no pertenece/);
    await guardarParametrosArea(db, encargado, id, area, { maneja_en_area: true, minimo: 5, maximo: 40, punto_reorden: 12, stock_seguridad: 4 });
  });
  it('asigna etiquetas LASA / alto riesgo y las devuelve al escanear', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    const lasa = (await db.query<{ id: number }>(`SELECT id FROM etiquetas WHERE codigo = 'LASA'`)).rows[0].id;
    await expect(cambiarEtiqueta(db, auxiliar, id, lasa, true)).rejects.toThrow(/permiso/);
    await expect(cambiarEtiqueta(db, encargado, id, lasa, true)).rejects.toThrow(/permiso/);
    await cambiarEtiqueta(db, admin, id, lasa, true);
    const r = await buscarPorCodigo(db, 'X100');
    expect(r.encontrado?.etiquetas.map((e) => e.codigo)).toEqual(['LASA']);
    expect(r.encontrado?.etiquetas[0].advertencia).toMatch(/LASA/);
  });
  it('busca por clave, texto parcial y ubicación del SIHO, con paginación', async () => {
    const r = await buscarProductos(db, { q: 'fenodid', porPagina: 10 });
    expect(r.filas[0].clave).toBe('1010100100');
    const t = await buscarProductos(db, { porPagina: 50, pagina: 2 });
    expect(t.total).toBe(827);
    expect(t.filas).toHaveLength(50);
    const c = await buscarProductos(db, { q: 'CONTROLADOS', area: 'HOSP' });
    expect(c.total).toBe(31);
  });
});

describe('códigos de barras', () => {
  let prodId: number, presCaja: number, presUnidad: number;
  beforeAll(async () => {
    prodId = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = '1010100100'`)).rows[0].id;
    const ps = (await db.query<{ id: number; factor: number }>('SELECT id, factor FROM presentaciones WHERE producto_id = $1', [prodId])).rows;
    presCaja = ps.find((p) => p.factor === 6)!.id; presUnidad = ps.find((p) => p.factor === 1)!.id;
  });

  it('un EAN-13 se guarda como GTIN-14 y se encuentra igual leído como EAN-13, GTIN-14 o GS1', async () => {
    const r = await vincularCodigo(db, encargado, '7501234567893', prodId, presCaja);
    expect(r).toMatchObject({ verificado: true, normalizado: '07501234567893' });
    for (const lectura of ['7501234567893', '07501234567893', '01075012345678931727123110LOTE-9']) {
      const b = await buscarPorCodigo(db, lectura);
      expect(b.encontrado?.producto.clave).toBe('1010100100');
      expect(b.encontrado?.presentacion.factor).toBe(6);
    }
  });
  it('un código ya vinculado no se puede ligar a otro producto', async () => {
    const otro = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    const pres = (await db.query<{ id: number }>('SELECT id FROM presentaciones WHERE producto_id = $1 AND factor = 1', [otro])).rows[0].id;
    await expect(vincularCodigo(db, encargado, '7501234567893', otro, pres)).rejects.toThrow(/ya está vinculado a 1010100100/);
  });
  it('la presentación del código debe ser del mismo producto', async () => {
    const otro = (await db.query<{ id: number }>(`SELECT id FROM productos WHERE clave = 'X100'`)).rows[0].id;
    await expect(vincularCodigo(db, encargado, 'INT-0001', otro, presCaja)).rejects.toThrow(/no corresponde/);
  });
  it('un auxiliar solo propone (queda sin verificar) y un encargado lo verifica', async () => {
    const r = await vincularCodigo(db, auxiliar, 'INT-AMP-01', prodId, presUnidad);
    expect(r.verificado).toBe(false);
    expect((await buscarPorCodigo(db, 'int-amp-01')).encontrado?.verificado).toBe(false);
    await expect(verificarCodigo(db, auxiliar, r.id)).rejects.toThrow(/permiso/);
    await verificarCodigo(db, encargado, r.id);
    expect((await buscarPorCodigo(db, 'INT-AMP-01')).encontrado?.verificado).toBe(true);
  });
  it('consulta no puede vincular códigos', async () => {
    await expect(vincularCodigo(db, consulta, 'INT-XYZ-9', prodId, presUnidad)).rejects.toThrow(/permiso/);
  });
  it('desvincular exige motivo, conserva el historial y libera el código para reasignarlo', async () => {
    const id = (await db.query<{ id: number }>(`SELECT id FROM codigos_barras WHERE codigo = 'INT-AMP-01'`)).rows[0].id;
    await expect(desactivarCodigo(db, encargado, id, '')).rejects.toThrow(/motivo/);
    await desactivarCodigo(db, encargado, id, 'Vinculado a la presentación equivocada');
    expect((await buscarPorCodigo(db, 'INT-AMP-01')).encontrado).toBeNull();
    await vincularCodigo(db, encargado, 'INT-AMP-01', prodId, presCaja);
    expect((await db.query(`SELECT 1 FROM codigos_barras WHERE codigo = 'INT-AMP-01'`)).rows).toHaveLength(2);
  });
  it('código desconocido devuelve "no encontrado" sin error', async () => {
    const r = await buscarPorCodigo(db, '7509999999997');
    expect(r.encontrado).toBeNull();
    expect(r.lectura.tipo).toBe('GTIN');
  });
});

describe('matriz de permisos', () => {
  it('mínimo privilegio por rol', () => {
    expect(ROLES.filter((r) => tienePermiso(r, 'usuarios.administrar'))).toEqual(['administrador', 'responsable_sanitario']);
    expect(ROLES.filter((r) => tienePermiso(r, 'catalogo.editar'))).toEqual(['administrador', 'responsable_sanitario', 'encargado']);
    expect(ROLES.filter((r) => tienePermiso(r, 'auditoria.ver'))).toEqual(['administrador', 'responsable_sanitario', 'auditor']);
    expect(ROLES.filter((r) => tienePermiso(r, 'catalogo.etiquetas'))).toEqual(['administrador', 'responsable_sanitario']);
    expect(ROLES.every((r) => tienePermiso(r, 'catalogo.ver'))).toBe(true);
    expect(tienePermiso('consulta', 'lector.usar')).toBe(false);
    expect(tienePermiso('desconocido', 'catalogo.ver')).toBe(false);
  });
});
