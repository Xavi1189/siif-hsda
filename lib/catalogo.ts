import { z } from 'zod';
import type { Tx } from './db-core';
import { auditar, diferencias } from './auditoria';
import { ErrorPermiso, tienePermiso, type Rol } from './permisos';
import { interpretarCodigo, type CodigoInterpretado } from './codigos';
import { validarFactor } from './conversion';

export interface Actor { id: string; rol: Rol; ip?: string | null }

export class ErrorNegocio extends Error {
  constructor(msg: string) { super(msg); this.name = 'ErrorNegocio'; }
}

function exigir(a: Actor, p: Parameters<typeof tienePermiso>[1]) {
  if (!tienePermiso(a.rol, p)) throw new ErrorPermiso(p);
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export interface FiltroCatalogo {
  q?: string; tipo?: string; estatus?: string; etiqueta?: string; area?: string; grupo?: string;
  sinCodigo?: boolean; conCodigo?: boolean; controlado?: boolean; cuadroBasico?: boolean; antibiotico?: boolean; pagina?: number; porPagina?: number;
}
export interface FilaCatalogo {
  id: number; clave: string; descripcion: string; tipo: string; unidad_minima: string; estatus: string;
  costo_unitario: string; controlado: boolean; grupo_controlado: string | null; cuadro_basico: boolean; grupo_terapeutico: string | null;
  presentacion: string | null; factor: number | null; codigos: number; codigos_sin_verificar: number;
  etiquetas: { codigo: string; nombre: string; icono: string; tono: string }[];
  ubicaciones: { area: string; ubicacion: string | null }[];
}

export async function buscarProductos(tx: Tx, f: FiltroCatalogo): Promise<{ filas: FilaCatalogo[]; total: number; pagina: number; paginas: number }> {
  const cond: string[] = [];
  const p: unknown[] = [];
  const terminos = (f.q ?? '').toUpperCase().normalize('NFC').split(/\s+/).filter(Boolean).slice(0, 6);
  for (const t of terminos) {
    p.push('%' + t.replace(/[%_\\]/g, '\\$&') + '%');
    const i = p.length;
    cond.push(`(pr.busqueda LIKE $${i} OR EXISTS (SELECT 1 FROM codigos_barras cb WHERE cb.producto_id = pr.id AND cb.activo AND cb.codigo LIKE $${i})
              OR EXISTS (SELECT 1 FROM parametros_area pa WHERE pa.producto_id = pr.id AND upper(pa.ubicacion_siho) LIKE $${i}))`);
  }
  if (f.tipo) { p.push(f.tipo); cond.push(`pr.tipo = $${p.length}::tipo_producto`); }
  if (f.estatus) { p.push(f.estatus); cond.push(`pr.estatus = $${p.length}::estatus_producto`); }
  if (f.controlado) cond.push('pr.controlado');
  if (f.cuadroBasico) cond.push('pr.cuadro_basico');
  if (f.grupo) { p.push(f.grupo); cond.push(`pr.grupo_terapeutico = $${p.length}`); }
  if (f.antibiotico) cond.push(`EXISTS (SELECT 1 FROM producto_etiquetas pe JOIN etiquetas e ON e.id = pe.etiqueta_id WHERE pe.producto_id = pr.id AND e.codigo = 'ANTIBIOTICO')`);
  if (f.sinCodigo) cond.push('NOT EXISTS (SELECT 1 FROM codigos_barras cb WHERE cb.producto_id = pr.id AND cb.activo)');
  if (f.conCodigo) cond.push('EXISTS (SELECT 1 FROM codigos_barras cb WHERE cb.producto_id = pr.id AND cb.activo)');
  if (f.etiqueta) {
    p.push(f.etiqueta);
    cond.push(`EXISTS (SELECT 1 FROM producto_etiquetas pe JOIN etiquetas e ON e.id = pe.etiqueta_id WHERE pe.producto_id = pr.id AND e.codigo = $${p.length})`);
  }
  if (f.area) {
    p.push(f.area);
    cond.push(`EXISTS (SELECT 1 FROM parametros_area pa JOIN areas a ON a.id = pa.area_id WHERE pa.producto_id = pr.id AND a.codigo = $${p.length} AND pa.maneja_en_area)`);
  }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const porPagina = Math.min(Math.max(f.porPagina ?? 50, 10), 200);
  const total = Number((await tx.query<{ n: string }>(`SELECT count(*) AS n FROM productos pr ${where}`, p)).rows[0].n);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
  p.push(porPagina, (pagina - 1) * porPagina);
  const filas = (await tx.query<FilaCatalogo>(`
    SELECT pr.id, pr.clave, pr.descripcion, pr.tipo, pr.unidad_minima, pr.estatus, pr.costo_unitario::text, pr.controlado, pr.grupo_controlado, pr.cuadro_basico, pr.grupo_terapeutico,
      (SELECT ps.nombre FROM presentaciones ps WHERE ps.producto_id = pr.id AND ps.activa AND NOT ps.es_unidad ORDER BY ps.factor LIMIT 1) AS presentacion,
      (SELECT ps.factor FROM presentaciones ps WHERE ps.producto_id = pr.id AND ps.activa AND NOT ps.es_unidad ORDER BY ps.factor LIMIT 1) AS factor,
      (SELECT count(*)::int FROM codigos_barras cb WHERE cb.producto_id = pr.id AND cb.activo) AS codigos,
      (SELECT count(*)::int FROM codigos_barras cb WHERE cb.producto_id = pr.id AND cb.activo AND NOT cb.verificado) AS codigos_sin_verificar,
      coalesce((SELECT json_agg(json_build_object('codigo', e.codigo, 'nombre', e.nombre, 'icono', e.icono, 'tono', e.tono) ORDER BY e.id)
                FROM producto_etiquetas pe JOIN etiquetas e ON e.id = pe.etiqueta_id WHERE pe.producto_id = pr.id AND e.activa), '[]') AS etiquetas,
      coalesce((SELECT json_agg(json_build_object('area', a.codigo, 'ubicacion', coalesce(u.codigo, pa.ubicacion_siho)) ORDER BY a.id)
                FROM parametros_area pa JOIN areas a ON a.id = pa.area_id LEFT JOIN ubicaciones u ON u.id = pa.ubicacion_predeterminada
                WHERE pa.producto_id = pr.id AND pa.maneja_en_area), '[]') AS ubicaciones
    FROM productos pr ${where}
    ORDER BY pr.clave
    LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  return { filas, total, pagina, paginas };
}

export interface ProductoDetalle {
  producto: Record<string, unknown> & { id: number; clave: string; descripcion: string; unidad_minima: string };
  presentaciones: { id: number; nombre: string; factor: number; activa: boolean; es_unidad: boolean }[];
  codigos: { id: number; codigo: string; tipo: string; verificado: boolean; presentacion: string; factor: number; es_unidad: boolean; creado: string; creado_por: string | null; verificado_por: string | null }[];
  etiquetas: { id: number; codigo: string; nombre: string; icono: string; tono: string; advertencia: string | null; asignada: boolean }[];
  parametros: { area_id: number; area: string; area_nombre: string; ubicacion_predeterminada: number | null; ubicacion_siho: string | null; minimo: number | null; maximo: number | null; punto_reorden: number | null; stock_seguridad: number | null; tiempo_entrega_dias: number | null; maneja_en_area: boolean }[];
  ubicaciones: { id: number; area_id: number; codigo: string; nombre: string }[];
  historial: { momento: string; accion: string; usuario: string | null; detalle: unknown }[];
}

export async function obtenerProducto(tx: Tx, id: number): Promise<ProductoDetalle | null> {
  const pr = (await tx.query<ProductoDetalle['producto']>(
    `SELECT id, clave, tipo, descripcion, nombre_generico, nombre_comercial, concentracion, forma_farmaceutica,
            unidad_minima, laboratorio, registro_sanitario, grupo_terapeutico, cuadro_basico,
            costo_unitario::text, controlado, grupo_controlado, requiere_lote, requiere_caducidad, estatus, origen, creado, actualizado
       FROM productos WHERE id = $1`, [id])).rows[0];
  if (!pr) return null;
  const [presentaciones, codigos, etiquetas, parametros, ubicaciones, historial] = await Promise.all([
    tx.query<ProductoDetalle['presentaciones'][0]>('SELECT id, nombre, factor, activa, es_unidad FROM presentaciones WHERE producto_id = $1 ORDER BY es_unidad DESC, factor, nombre', [id]),
    tx.query<ProductoDetalle['codigos'][0]>(
      `SELECT cb.id, cb.codigo, cb.tipo, cb.verificado, ps.nombre AS presentacion, ps.factor, ps.es_unidad, cb.creado,
              uc.nombre AS creado_por, uv.nombre AS verificado_por
         FROM codigos_barras cb JOIN presentaciones ps ON ps.id = cb.presentacion_id
         LEFT JOIN usuarios uc ON uc.id = cb.creado_por LEFT JOIN usuarios uv ON uv.id = cb.verificado_por
        WHERE cb.producto_id = $1 AND cb.activo ORDER BY cb.creado`, [id]),
    tx.query<ProductoDetalle['etiquetas'][0]>(
      `SELECT e.id, e.codigo, e.nombre, e.icono, e.tono, e.advertencia, (pe.producto_id IS NOT NULL) AS asignada
         FROM etiquetas e LEFT JOIN producto_etiquetas pe ON pe.etiqueta_id = e.id AND pe.producto_id = $1
        WHERE e.activa ORDER BY e.id`, [id]),
    tx.query<ProductoDetalle['parametros'][0]>(
      `SELECT a.id AS area_id, a.codigo AS area, a.nombre AS area_nombre, pa.ubicacion_predeterminada, pa.ubicacion_siho,
              pa.minimo, pa.maximo, pa.punto_reorden, pa.stock_seguridad, pa.tiempo_entrega_dias, coalesce(pa.maneja_en_area, false) AS maneja_en_area
         FROM areas a LEFT JOIN parametros_area pa ON pa.area_id = a.id AND pa.producto_id = $1
        WHERE NOT a.virtual AND a.activa ORDER BY a.id`, [id]),
    tx.query<ProductoDetalle['ubicaciones'][0]>(
      `SELECT u.id, u.area_id, u.codigo, u.nombre FROM ubicaciones u JOIN areas a ON a.id = u.area_id
        WHERE u.activa AND NOT a.virtual AND u.permite_surtido ORDER BY u.area_id, u.codigo`),
    tx.query<ProductoDetalle['historial'][0]>(
      `SELECT au.momento, au.accion, u.nombre AS usuario, au.detalle FROM auditoria au LEFT JOIN usuarios u ON u.id = au.usuario_id
        WHERE au.entidad = 'producto' AND au.entidad_id = $1 ORDER BY au.momento DESC LIMIT 30`, [String(id)]),
  ]);
  return {
    producto: pr, presentaciones: presentaciones.rows, codigos: codigos.rows, etiquetas: etiquetas.rows,
    parametros: parametros.rows, ubicaciones: ubicaciones.rows, historial: historial.rows,
  };
}

// ---------------------------------------------------------------------------
// Alta y edición de productos
// ---------------------------------------------------------------------------
const texto = (max: number) => z.string().trim().max(max).transform((s) => (s === '' ? null : s)).nullable().optional();

export const esquemaProducto = z.object({
  clave: z.string().trim().regex(/^[A-Za-z0-9._-]{1,30}$/, 'La clave solo admite letras, números, punto, guion y guion bajo (máx. 30).'),
  tipo: z.enum(['medicamento', 'dispositivo_medico', 'insumo']),
  descripcion: z.string().trim().min(3, 'La descripción es obligatoria.').max(250).transform((s) => s.toUpperCase()),
  nombre_generico: texto(150), nombre_comercial: texto(150), concentracion: texto(80),
  forma_farmaceutica: texto(80),
  unidad_minima: z.string().trim().min(2, 'Indica la unidad mínima dispensable (ampolleta, tableta, pieza…).').max(30).transform((s) => s.toUpperCase()),
  laboratorio: texto(120), registro_sanitario: texto(60), grupo_terapeutico: texto(120),
  cuadro_basico: z.coerce.boolean(),
  costo_unitario: z.coerce.number({ invalid_type_error: 'El costo debe ser un número.' }).min(0, 'El costo no puede ser negativo.').max(10_000_000),
  requiere_lote: z.coerce.boolean(),
  requiere_caducidad: z.coerce.boolean(),
  estatus: z.enum(['activo', 'inactivo', 'descontinuado']),
});
export type DatosProducto = z.infer<typeof esquemaProducto>;

const CAMPOS = ['clave', 'tipo', 'descripcion', 'nombre_generico', 'nombre_comercial', 'concentracion', 'forma_farmaceutica',
  'unidad_minima', 'laboratorio', 'registro_sanitario', 'grupo_terapeutico', 'cuadro_basico', 'costo_unitario',
  'requiere_lote', 'requiere_caducidad', 'estatus'] as const;

export async function guardarProducto(tx: Tx, a: Actor, entrada: unknown, id?: number): Promise<number> {
  exigir(a, 'catalogo.editar');
  const d = esquemaProducto.parse(entrada);
  const valores = CAMPOS.map((c) => (d as Record<string, unknown>)[c] ?? null);
  // Controlado y grupo no se editan aquí: solo con cambiarControlado (permiso de etiquetas sensibles)
  if (id == null) {
    const dup = await tx.query('SELECT 1 FROM productos WHERE clave = $1', [d.clave]);
    if (dup.rows.length) throw new ErrorNegocio(`Ya existe un producto con la clave ${d.clave}.`);
    const r = await tx.query<{ id: number }>(
      `INSERT INTO productos (${CAMPOS.join(', ')}, actualizado_por)
       VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPOS.length + 1}) RETURNING id`, [...valores, a.id]);
    const nuevo = r.rows[0].id;
    await tx.query(`INSERT INTO presentaciones (producto_id, nombre, factor, es_unidad) VALUES ($1, $2, 1, true)`, [nuevo, d.unidad_minima]);
    await auditar(tx, { usuarioId: a.id, accion: 'producto.crear', entidad: 'producto', entidadId: nuevo, detalle: d, ip: a.ip });
    return nuevo;
  }
  const antes = (await tx.query<Record<string, unknown>>(`SELECT ${CAMPOS.join(', ')} FROM productos WHERE id = $1 FOR UPDATE`, [id])).rows[0];
  if (!antes) throw new ErrorNegocio('El producto no existe.');
  if (antes.clave !== d.clave) {
    const usado = await tx.query('SELECT 1 FROM movimientos WHERE producto_id = $1 LIMIT 1', [id]);
    if (usado.rows.length) throw new ErrorNegocio('La clave no se puede cambiar porque el producto ya tiene movimientos.');
    const dup = await tx.query('SELECT 1 FROM productos WHERE clave = $1 AND id <> $2', [d.clave, id]);
    if (dup.rows.length) throw new ErrorNegocio(`Ya existe un producto con la clave ${d.clave}.`);
  }
  if (antes.unidad_minima !== d.unidad_minima) {
    const usado = await tx.query('SELECT 1 FROM movimientos WHERE producto_id = $1 LIMIT 1', [id]);
    if (usado.rows.length) throw new ErrorNegocio('La unidad mínima no se puede cambiar porque ya hay movimientos registrados en esa unidad.');
  }
  const cambios = diferencias(antes, d as Record<string, unknown>);
  if (!Object.keys(cambios).length) return id;
  await tx.query(
    `UPDATE productos SET ${CAMPOS.map((c, i) => `${c} = $${i + 1}`).join(', ')}, actualizado = now(), actualizado_por = $${CAMPOS.length + 1}
      WHERE id = $${CAMPOS.length + 2}`, [...valores, a.id, id]);
  if (cambios.unidad_minima) {
    await tx.query(`UPDATE presentaciones SET nombre = $2 WHERE producto_id = $1 AND es_unidad`, [id, d.unidad_minima]);
  }
  await auditar(tx, { usuarioId: a.id, accion: 'producto.editar', entidad: 'producto', entidadId: id, detalle: { cambios }, ip: a.ip });
  return id;
}

/** Marca o desmarca un medicamento controlado con su grupo. Solo Responsable Sanitario y administrador. */
export async function cambiarControlado(tx: Tx, a: Actor, id: number, controlado: boolean, grupo: string | null) {
  exigir(a, 'catalogo.etiquetas');
  const g = controlado ? grupo : null;
  if (controlado && !['I', 'II', 'III'].includes(String(g))) throw new ErrorNegocio('Indica el grupo (I, II o III) del medicamento controlado.');
  const antes = (await tx.query<{ controlado: boolean; grupo_controlado: string | null }>(
    'SELECT controlado, grupo_controlado FROM productos WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!antes) throw new ErrorNegocio('El producto no existe.');
  if (antes.controlado === controlado && (antes.grupo_controlado ?? null) === g) return;
  await tx.query('UPDATE productos SET controlado = $2, grupo_controlado = $3, actualizado = now(), actualizado_por = $4 WHERE id = $1', [id, controlado, g, a.id]);
  await auditar(tx, { usuarioId: a.id, accion: 'producto.controlado', entidad: 'producto', entidadId: id,
    detalle: { antes: { controlado: antes.controlado, grupo: antes.grupo_controlado }, despues: { controlado, grupo: g } }, ip: a.ip });
}

// ---------------------------------------------------------------------------
// Presentaciones (factores de conversión)
// ---------------------------------------------------------------------------
export async function agregarPresentacion(tx: Tx, a: Actor, productoId: number, nombre: string, factor: unknown) {
  exigir(a, 'catalogo.editar');
  const f = validarFactor(factor);
  const n = nombre.trim().toUpperCase();
  if (n.length < 2 || n.length > 40) throw new ErrorNegocio('Escribe el nombre de la presentación (caja, frasco, blíster…).');
  // Se permite factor 1 (p. ej. CAJA con 1 ampolleta) siempre que no repita el nombre de la unidad mínima
  const unidad = (await tx.query<{ nombre: string }>('SELECT nombre FROM presentaciones WHERE producto_id = $1 AND es_unidad', [productoId])).rows[0];
  if (f === 1 && unidad && unidad.nombre === n) throw new ErrorNegocio(`${n} ya es la unidad mínima. Usa el nombre del empaque (caja, frasco…).`);
  const ex = await tx.query<{ id: number; activa: boolean }>('SELECT id, activa FROM presentaciones WHERE producto_id = $1 AND nombre = $2 AND factor = $3', [productoId, n, f]);
  if (ex.rows[0]?.activa) throw new ErrorNegocio('Esa presentación ya existe.');
  let id: number;
  if (ex.rows[0]) { id = ex.rows[0].id; await tx.query('UPDATE presentaciones SET activa = true WHERE id = $1', [id]); }
  else id = (await tx.query<{ id: number }>('INSERT INTO presentaciones (producto_id, nombre, factor) VALUES ($1, $2, $3) RETURNING id', [productoId, n, f])).rows[0].id;
  await auditar(tx, { usuarioId: a.id, accion: 'presentacion.agregar', entidad: 'producto', entidadId: productoId, detalle: { nombre: n, factor: f }, ip: a.ip });
  return id;
}

export async function desactivarPresentacion(tx: Tx, a: Actor, presentacionId: number) {
  exigir(a, 'catalogo.editar');
  const p = (await tx.query<{ producto_id: number; factor: number; nombre: string; es_unidad: boolean }>('SELECT producto_id, factor, nombre, es_unidad FROM presentaciones WHERE id = $1', [presentacionId])).rows[0];
  if (!p) throw new ErrorNegocio('La presentación no existe.');
  if (p.es_unidad) throw new ErrorNegocio('La unidad mínima no se puede desactivar.');
  const cods = await tx.query('SELECT 1 FROM codigos_barras WHERE presentacion_id = $1 AND activo', [presentacionId]);
  if (cods.rows.length) throw new ErrorNegocio('Primero desactiva los códigos de barras ligados a esta presentación.');
  await tx.query('UPDATE presentaciones SET activa = false WHERE id = $1', [presentacionId]);
  await auditar(tx, { usuarioId: a.id, accion: 'presentacion.desactivar', entidad: 'producto', entidadId: p.producto_id, detalle: p, ip: a.ip });
}

// ---------------------------------------------------------------------------
// Etiquetas y parámetros por área
// ---------------------------------------------------------------------------
export async function cambiarEtiqueta(tx: Tx, a: Actor, productoId: number, etiquetaId: number, asignar: boolean) {
  exigir(a, 'catalogo.etiquetas');
  const e = (await tx.query<{ codigo: string }>('SELECT codigo FROM etiquetas WHERE id = $1', [etiquetaId])).rows[0];
  if (!e) throw new ErrorNegocio('La etiqueta no existe.');
  if (asignar) await tx.query('INSERT INTO producto_etiquetas (producto_id, etiqueta_id, asignada_por) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [productoId, etiquetaId, a.id]);
  else await tx.query('DELETE FROM producto_etiquetas WHERE producto_id = $1 AND etiqueta_id = $2', [productoId, etiquetaId]);
  await auditar(tx, { usuarioId: a.id, accion: asignar ? 'etiqueta.asignar' : 'etiqueta.quitar', entidad: 'producto', entidadId: productoId, detalle: { etiqueta: e.codigo }, ip: a.ip });
}

const entero = z.preprocess((v) => (v === '' || v == null ? null : Number(v)),
  z.number().int('Usa números enteros.').min(0, 'No se admiten negativos.').max(10_000_000).nullable());
export const esquemaParametros = z.object({
  maneja_en_area: z.coerce.boolean(),
  ubicacion_predeterminada: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().nullable()),
  minimo: entero, maximo: entero, punto_reorden: entero, stock_seguridad: entero,
  tiempo_entrega_dias: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().min(0).max(365).nullable()),
}).superRefine((d, ctx) => {
  if (d.minimo != null && d.maximo != null && d.maximo < d.minimo) ctx.addIssue({ code: 'custom', path: ['maximo'], message: 'El máximo no puede ser menor que el mínimo.' });
  if (d.punto_reorden != null && d.maximo != null && d.punto_reorden > d.maximo) ctx.addIssue({ code: 'custom', path: ['punto_reorden'], message: 'El punto de reorden no puede ser mayor que el máximo.' });
});

export async function guardarParametrosArea(tx: Tx, a: Actor, productoId: number, areaId: number, entrada: unknown) {
  exigir(a, 'catalogo.editar');
  const d = esquemaParametros.parse(entrada);
  if (d.ubicacion_predeterminada != null) {
    const u = await tx.query('SELECT 1 FROM ubicaciones WHERE id = $1 AND area_id = $2', [d.ubicacion_predeterminada, areaId]);
    if (!u.rows.length) throw new ErrorNegocio('La ubicación elegida no pertenece a esa área.');
  }
  const antes = (await tx.query<Record<string, unknown>>('SELECT * FROM parametros_area WHERE producto_id = $1 AND area_id = $2', [productoId, areaId])).rows[0] ?? {};
  await tx.query(
    `INSERT INTO parametros_area (producto_id, area_id, maneja_en_area, ubicacion_predeterminada, minimo, maximo, punto_reorden, stock_seguridad, tiempo_entrega_dias, actualizado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (producto_id, area_id) DO UPDATE SET maneja_en_area = $3, ubicacion_predeterminada = $4, minimo = $5, maximo = $6,
       punto_reorden = $7, stock_seguridad = $8, tiempo_entrega_dias = $9, actualizado = now()`,
    [productoId, areaId, d.maneja_en_area, d.ubicacion_predeterminada, d.minimo, d.maximo, d.punto_reorden, d.stock_seguridad, d.tiempo_entrega_dias]);
  await auditar(tx, { usuarioId: a.id, accion: 'parametros.editar', entidad: 'producto', entidadId: productoId, detalle: { area_id: areaId, cambios: diferencias(antes, d) }, ip: a.ip });
}

// ---------------------------------------------------------------------------
// Códigos de barras
// ---------------------------------------------------------------------------
export interface ResultadoLectura {
  lectura: CodigoInterpretado;
  encontrado: null | {
    via: 'codigo' | 'clave';
    codigoId?: number;
    verificado: boolean;
    producto: { id: number; clave: string; descripcion: string; unidad_minima: string; estatus: string; controlado: boolean };
    presentacion: { id: number; nombre: string; factor: number; es_unidad: boolean };
    etiquetas: { codigo: string; nombre: string; icono: string; tono: string; advertencia: string | null }[];
  };
}

export async function buscarPorCodigo(tx: Tx, entrada: string): Promise<ResultadoLectura> {
  const lectura = interpretarCodigo(entrada);
  const prodCols = `json_build_object('id', p.id, 'clave', p.clave, 'descripcion', p.descripcion, 'unidad_minima', p.unidad_minima, 'estatus', p.estatus, 'controlado', p.controlado)`;
  const etqCols = `coalesce((SELECT json_agg(json_build_object('codigo', e.codigo, 'nombre', e.nombre, 'icono', e.icono, 'tono', e.tono, 'advertencia', e.advertencia) ORDER BY e.id)
       FROM producto_etiquetas pe JOIN etiquetas e ON e.id = pe.etiqueta_id WHERE pe.producto_id = p.id AND e.activa), '[]')`;
  const r = await tx.query<NonNullable<ResultadoLectura['encontrado']> & { codigo_id: number }>(
    `SELECT cb.id AS codigo_id, cb.verificado, ${prodCols} AS producto,
            json_build_object('id', ps.id, 'nombre', ps.nombre, 'factor', ps.factor, 'es_unidad', ps.es_unidad) AS presentacion, ${etqCols} AS etiquetas
       FROM codigos_barras cb JOIN productos p ON p.id = cb.producto_id JOIN presentaciones ps ON ps.id = cb.presentacion_id
      WHERE cb.codigo = $1 AND cb.activo`, [lectura.normalizado]);
  if (r.rows[0]) {
    const x = r.rows[0];
    return { lectura, encontrado: { via: 'codigo', codigoId: x.codigo_id, verificado: x.verificado, producto: x.producto, presentacion: x.presentacion, etiquetas: x.etiquetas } };
  }
  // ¿Escribieron o escanearon la clave interna del SIHO?
  const c = await tx.query<Pick<NonNullable<ResultadoLectura['encontrado']>, 'producto' | 'presentacion' | 'etiquetas'>>(
    `SELECT ${prodCols} AS producto, json_build_object('id', ps.id, 'nombre', ps.nombre, 'factor', ps.factor, 'es_unidad', ps.es_unidad) AS presentacion, ${etqCols} AS etiquetas
       FROM productos p JOIN presentaciones ps ON ps.producto_id = p.id AND ps.es_unidad
      WHERE p.clave = $1 LIMIT 1`, [entrada.trim()]);
  if (c.rows[0]) return { lectura, encontrado: { ...c.rows[0], via: 'clave', verificado: true } };
  return { lectura, encontrado: null };
}

export async function vincularCodigo(tx: Tx, a: Actor, entrada: string, productoId: number, presentacionId: number) {
  const directo = tienePermiso(a.rol, 'codigos.vincular');
  if (!directo) exigir(a, 'codigos.proponer');
  const lectura = interpretarCodigo(entrada);
  if (lectura.tipo === 'OTRO') throw new ErrorNegocio('El código tiene caracteres no válidos. Revisa la configuración de teclado del lector y vuelve a escanear.');
  const pres = (await tx.query<{ producto_id: number; activa: boolean }>('SELECT producto_id, activa FROM presentaciones WHERE id = $1', [presentacionId])).rows[0];
  if (!pres || pres.producto_id !== productoId || !pres.activa) throw new ErrorNegocio('La presentación no corresponde al producto.');
  const prod = (await tx.query<{ clave: string }>('SELECT clave FROM productos WHERE id = $1', [productoId])).rows[0];
  if (prod && prod.clave.toUpperCase() === lectura.normalizado) throw new ErrorNegocio('Ese texto es la clave del producto; no hace falta vincularla como código.');
  const ya = (await tx.query<{ clave: string; descripcion: string }>(
    `SELECT p.clave, p.descripcion FROM codigos_barras cb JOIN productos p ON p.id = cb.producto_id WHERE cb.codigo = $1 AND cb.activo`, [lectura.normalizado])).rows[0];
  if (ya) throw new ErrorNegocio(`Este código ya está vinculado a ${ya.clave} · ${ya.descripcion}.`);
  const r = await tx.query<{ id: number }>(
    `INSERT INTO codigos_barras (codigo, producto_id, presentacion_id, tipo, verificado, creado_por, verificado_por, verificado_en)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 THEN $6::uuid END, CASE WHEN $5 THEN now() END) RETURNING id`,
    [lectura.normalizado, productoId, presentacionId, lectura.tipo, directo, a.id]);
  await auditar(tx, { usuarioId: a.id, accion: directo ? 'codigo.vincular' : 'codigo.proponer', entidad: 'producto', entidadId: productoId,
    detalle: { codigo: lectura.normalizado, presentacion_id: presentacionId }, ip: a.ip });
  return { id: r.rows[0].id, verificado: directo, normalizado: lectura.normalizado };
}

export async function verificarCodigo(tx: Tx, a: Actor, codigoId: number) {
  exigir(a, 'codigos.verificar');
  const r = await tx.query<{ producto_id: number; codigo: string }>(
    `UPDATE codigos_barras SET verificado = true, verificado_por = $2, verificado_en = now() WHERE id = $1 AND activo AND NOT verificado RETURNING producto_id, codigo`, [codigoId, a.id]);
  if (!r.rows[0]) throw new ErrorNegocio('El código ya estaba verificado o fue desactivado.');
  await auditar(tx, { usuarioId: a.id, accion: 'codigo.verificar', entidad: 'producto', entidadId: r.rows[0].producto_id, detalle: { codigo: r.rows[0].codigo }, ip: a.ip });
}

export async function desactivarCodigo(tx: Tx, a: Actor, codigoId: number, motivo: string) {
  exigir(a, 'codigos.verificar');
  if (motivo.trim().length < 5) throw new ErrorNegocio('Escribe el motivo para desvincular el código.');
  const r = await tx.query<{ producto_id: number; codigo: string }>(
    'UPDATE codigos_barras SET activo = false WHERE id = $1 AND activo RETURNING producto_id, codigo', [codigoId]);
  if (!r.rows[0]) throw new ErrorNegocio('El código ya estaba desvinculado.');
  await auditar(tx, { usuarioId: a.id, accion: 'codigo.desvincular', entidad: 'producto', entidadId: r.rows[0].producto_id,
    detalle: { codigo: r.rows[0].codigo, motivo: motivo.trim() }, ip: a.ip });
}

export async function sugerirProductos(tx: Tx, q: string, limite = 15) {
  const terminos = q.toUpperCase().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!terminos.length) return [];
  const p = terminos.map((t) => '%' + t.replace(/[%_\\]/g, '\\$&') + '%');
  const where = p.map((_, i) => `busqueda LIKE $${i + 1}`).join(' AND ');
  return (await tx.query<{ id: number; clave: string; descripcion: string; unidad_minima: string; presentaciones: { id: number; nombre: string; factor: number; es_unidad: boolean }[] }>(
    `SELECT pr.id, pr.clave, pr.descripcion, pr.unidad_minima,
            (SELECT json_agg(json_build_object('id', ps.id, 'nombre', ps.nombre, 'factor', ps.factor, 'es_unidad', ps.es_unidad) ORDER BY ps.es_unidad DESC, ps.factor)
               FROM presentaciones ps WHERE ps.producto_id = pr.id AND ps.activa) AS presentaciones
       FROM productos pr WHERE ${where} AND pr.estatus <> 'descontinuado'
      ORDER BY (pr.clave = $${p.length + 1}) DESC, pr.descripcion LIMIT ${Math.min(limite, 30)}`, [...p, q.trim()])).rows;
}
