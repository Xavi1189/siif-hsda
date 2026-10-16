import type { Tx } from './db-core';
import { auditar } from './auditoria';
import { ErrorPermiso, tienePermiso } from './permisos';
import type { Actor } from './catalogo';

/** Renglón del reporte "Existencias" del SIHO: [clave, descripción, unidad, empaque, contenido, existencia, costo unitario, localización] */
export type RenglonSiho = [string, string, string, string, number, number, number, string];
export interface CorteSiho {
  fuente: string;
  fecha_corte: string;
  areas: Record<string, { etiqueta: string; archivo: string; total: number; items: RenglonSiho[] }>;
}

export interface ResumenImportacion { productosNuevos: number; productosExistentes: number; presentacionesNuevas: number; ubicacionesActualizadas: number }

/**
 * Importa el catálogo del SIHO. Es idempotente: crea las claves que faltan, agrega presentaciones
 * que no existan y actualiza la localización SIHO por área. NO sobrescribe datos editados en SIIF
 * y NO carga existencias: el inventario inicial sale del conteo físico (Fase 4).
 */
export async function importarCatalogoSiho(tx: Tx, a: Actor, corte: CorteSiho): Promise<ResumenImportacion> {
  if (!tienePermiso(a.rol, 'catalogo.importar')) throw new ErrorPermiso('catalogo.importar');
  const porClave = new Map<string, { desc: string; unidad: string; empaque: string; contenido: number; valor: number; piezas: number; costos: number[] }>();
  const ubic: { clave: string; area: string; loc: string }[] = [];
  for (const [area, datos] of Object.entries(corte.areas)) {
    for (const [clave, desc, unidad, empaque, contenido, existencia, costoU, loc] of datos.items) {
      const x = porClave.get(clave) ?? { desc, unidad, empaque, contenido, valor: 0, piezas: 0, costos: [] };
      x.valor += existencia * costoU; x.piezas += existencia; x.costos.push(costoU);
      if (!x.empaque && empaque) { x.empaque = empaque; x.contenido = contenido; }
      porClave.set(clave, x);
      ubic.push({ clave, area, loc });
    }
  }
  const claves = [...porClave.keys()];
  const filas = claves.map((c) => {
    const x = porClave.get(c)!;
    // Costo por unidad mínima: promedio ponderado por existencia entre farmacias (o simple si no hay existencia)
    const costo = x.piezas > 0 ? x.valor / x.piezas : x.costos.reduce((s, v) => s + v, 0) / x.costos.length;
    return { clave: c, desc: x.desc.toUpperCase(), unidad: (x.unidad || 'PIEZA').toUpperCase(), costo: Math.round(costo * 10000) / 10000, empaque: x.empaque.toUpperCase(), contenido: x.contenido };
  });

  const antes = Number((await tx.query<{ n: string }>('SELECT count(*) n FROM productos WHERE clave = ANY($1::text[])', [claves])).rows[0].n);
  await tx.query(
    `INSERT INTO productos (clave, descripcion, unidad_minima, costo_unitario, origen, actualizado_por)
     SELECT c, d, u, k, 'siho', $5 FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[]) AS x(c, d, u, k)
     ON CONFLICT (clave) DO NOTHING`,
    [filas.map((f) => f.clave), filas.map((f) => f.desc), filas.map((f) => f.unidad), filas.map((f) => f.costo), a.id]);

  // Unidad mínima (factor 1) y presentación de empaque (factor = contenido)
  const pres = await tx.query<{ n: string }>(
    `WITH x AS (
       SELECT p.id, p.unidad_minima AS nombre, 1 AS factor, true AS es_unidad FROM productos p WHERE p.clave = ANY($1::text[])
       UNION ALL
       SELECT p.id, e, f, false FROM unnest($1::text[], $2::text[], $3::int[]) AS t(c, e, f) JOIN productos p ON p.clave = t.c
        WHERE f > 1 AND e <> ''
     ), ins AS (
       INSERT INTO presentaciones (producto_id, nombre, factor, es_unidad)
       SELECT id, nombre, factor, es_unidad FROM x
        WHERE NOT (es_unidad AND EXISTS (SELECT 1 FROM presentaciones q WHERE q.producto_id = x.id AND q.es_unidad))
       ON CONFLICT (producto_id, nombre, factor) DO NOTHING RETURNING 1
     ) SELECT count(*) n FROM ins`,
    [filas.map((f) => f.clave), filas.map((f) => f.empaque), filas.map((f) => f.contenido)]);

  const pa = await tx.query<{ n: string }>(
    `WITH ins AS (
       INSERT INTO parametros_area (producto_id, area_id, ubicacion_siho, maneja_en_area)
       SELECT p.id, a.id, t.l, true FROM unnest($1::text[], $2::text[], $3::text[]) AS t(c, ar, l)
         JOIN productos p ON p.clave = t.c JOIN areas a ON a.codigo = t.ar
       ON CONFLICT (producto_id, area_id) DO UPDATE SET ubicacion_siho = EXCLUDED.ubicacion_siho, actualizado = now()
         WHERE parametros_area.ubicacion_siho IS DISTINCT FROM EXCLUDED.ubicacion_siho
       RETURNING 1) SELECT count(*) n FROM ins`,
    [ubic.map((u) => u.clave), ubic.map((u) => u.area), ubic.map((u) => u.loc)]);

  const r: ResumenImportacion = {
    productosNuevos: claves.length - antes, productosExistentes: antes,
    presentacionesNuevas: Number(pres.rows[0].n), ubicacionesActualizadas: Number(pa.rows[0].n),
  };
  await auditar(tx, { usuarioId: a.id, accion: 'catalogo.importar_siho', entidad: 'catalogo', detalle: { fecha_corte: corte.fecha_corte, ...r }, ip: a.ip });
  return r;
}

// ---------------------------------------------------------------------------
// Grupos terapéuticos (Compendio Nacional de Insumos para la Salud)
// ---------------------------------------------------------------------------
export { GRUPOS_TERAPEUTICOS } from './grupos';

export interface GruposPorClave { fecha_corte: string; claves: Record<string, string> }

/**
 * Asigna el grupo terapéutico por clave. Solo llena productos que aún no tienen grupo:
 * nunca sobrescribe lo que alguien capturó o corrigió en SIIF.
 */
export async function asignarGruposTerapeuticos(tx: Tx, a: Actor, datos: GruposPorClave): Promise<number> {
  if (!tienePermiso(a.rol, 'catalogo.importar')) throw new ErrorPermiso('catalogo.importar');
  const claves = Object.keys(datos.claves);
  const r = await tx.query<{ n: string }>(
    `WITH g AS (SELECT * FROM unnest($1::text[], $2::text[]) AS x(clave, grupo)),
          u AS (UPDATE productos p SET grupo_terapeutico = g.grupo, actualizado = now(), actualizado_por = $3
                  FROM g WHERE p.clave = g.clave AND (p.grupo_terapeutico IS NULL OR trim(p.grupo_terapeutico) = '') RETURNING 1)
     SELECT count(*) AS n FROM u`, [claves, claves.map((c) => datos.claves[c]), a.id]);
  const n = Number(r.rows[0].n);
  if (n) await auditar(tx, { usuarioId: a.id, accion: 'catalogo.grupos_terapeuticos', entidad: 'catalogo', detalle: { fecha_corte: datos.fecha_corte, asignados: n }, ip: a.ip });
  return n;
}
