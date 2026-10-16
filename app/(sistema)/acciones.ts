'use server';
import { revalidatePath } from 'next/cache';
import { accion, type Resultado } from '@/lib/servidor';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/servidor';
import { tienePermiso } from '@/lib/permisos';
import {
  agregarPresentacion, buscarPorCodigo, cambiarControlado, cambiarEtiqueta, desactivarCodigo, desactivarPresentacion, guardarParametrosArea,
  guardarProducto, sugerirProductos, verificarCodigo, vincularCodigo, ErrorNegocio, type ResultadoLectura,
} from '@/lib/catalogo';
import { asignarGruposTerapeuticos, importarCatalogoSiho, type CorteSiho, type GruposPorClave, type ResumenImportacion } from '@/lib/siho';
import { cambiarRolEstado, crearUsuario, restablecerContrasena } from '@/lib/usuarios';
import { auditar } from '@/lib/auditoria';

// ---------------- Lector y búsqueda ----------------
export async function leerCodigo(entrada: string): Promise<Resultado<ResultadoLectura>> {
  const u = await exigirUsuario();
  if (!tienePermiso(u.rol, 'catalogo.ver')) return { ok: false, error: 'Sin permiso.' };
  if (typeof entrada !== 'string' || entrada.length > 200) return { ok: false, error: 'Lectura no válida.' };
  return { ok: true, datos: await buscarPorCodigo(await db(), entrada) };
}

export async function sugerir(q: string) {
  await exigirUsuario('catalogo.ver');
  return sugerirProductos(await db(), String(q).slice(0, 80));
}

export async function vincular(codigo: string, productoId: number, presentacionId: number) {
  const r = await accion(null, (tx, a) => vincularCodigo(tx, a, codigo, Number(productoId), Number(presentacionId)));
  if (r.ok) revalidatePath('/catalogo');
  return r;
}

// ---------------- Catálogo ----------------
export async function guardarProductoAccion(id: number | null, datos: Record<string, unknown>) {
  const r = await accion('catalogo.editar', (tx, a) => guardarProducto(tx, a, datos, id ?? undefined), 'Producto guardado');
  if (r.ok) { revalidatePath('/catalogo'); revalidatePath(`/catalogo/${r.datos}`); }
  return r;
}
export async function agregarPresentacionAccion(productoId: number, nombre: string, factor: number) {
  const r = await accion('catalogo.editar', (tx, a) => agregarPresentacion(tx, a, productoId, nombre, factor), 'Presentación agregada');
  revalidatePath(`/catalogo/${productoId}`);
  return r;
}
export async function desactivarPresentacionAccion(productoId: number, presentacionId: number) {
  const r = await accion('catalogo.editar', (tx, a) => desactivarPresentacion(tx, a, presentacionId), 'Presentación desactivada');
  revalidatePath(`/catalogo/${productoId}`);
  return r;
}
export async function etiquetaAccion(productoId: number, etiquetaId: number, asignar: boolean) {
  const r = await accion('catalogo.etiquetas', (tx, a) => cambiarEtiqueta(tx, a, productoId, etiquetaId, asignar));
  revalidatePath(`/catalogo/${productoId}`);
  return r;
}
export async function controladoAccion(productoId: number, controlado: boolean, grupo: string | null) {
  const r = await accion('catalogo.etiquetas', (tx, a) => cambiarControlado(tx, a, Number(productoId), !!controlado, grupo ? String(grupo) : null),
    controlado ? 'Marcado como controlado' : 'Ya no está marcado como controlado');
  revalidatePath(`/catalogo/${productoId}`);
  revalidatePath('/catalogo');
  return r;
}
export async function parametrosAccion(productoId: number, areaId: number, datos: Record<string, unknown>) {
  const r = await accion('catalogo.editar', (tx, a) => guardarParametrosArea(tx, a, productoId, areaId, datos), 'Parámetros guardados');
  revalidatePath(`/catalogo/${productoId}`);
  return r;
}
export async function verificarCodigoAccion(productoId: number, codigoId: number) {
  const r = await accion('codigos.verificar', (tx, a) => verificarCodigo(tx, a, codigoId), 'Código verificado');
  revalidatePath(`/catalogo/${productoId}`);
  return r;
}
export async function desactivarCodigoAccion(productoId: number, codigoId: number, motivo: string) {
  const r = await accion('codigos.verificar', (tx, a) => desactivarCodigo(tx, a, codigoId, motivo), 'Código desvinculado');
  revalidatePath(`/catalogo/${productoId}`);
  return r;
}

export async function importarSihoAccion(): Promise<Resultado<ResumenImportacion & { gruposAsignados: number }>> {
  // Los archivos se importan dinámicamente para que queden empaquetados en la función de Vercel
  const r = await accion('catalogo.importar', async (tx, a) => {
    const corte = (await import('@/data/siho-catalogo-2026-10-15.json')).default as unknown as CorteSiho;
    const grupos = (await import('@/data/grupos-terapeuticos-2026-10-15.json')).default as unknown as GruposPorClave;
    const resumen = await importarCatalogoSiho(tx, a, corte);
    return { ...resumen, gruposAsignados: await asignarGruposTerapeuticos(tx, a, grupos) };
  });
  revalidatePath('/', 'layout');
  return r;
}

// ---------------- Usuarios ----------------
export async function crearUsuarioAccion(datos: Record<string, unknown>) {
  const r = await accion('usuarios.administrar', (tx, a) => crearUsuario(tx, a, datos));
  revalidatePath('/usuarios');
  return r;
}
export async function modificarUsuarioAccion(id: string, cambios: { rol?: string; activo?: boolean }) {
  const r = await accion('usuarios.administrar', (tx, a) => cambiarRolEstado(tx, a, id, cambios), 'Usuario actualizado');
  revalidatePath('/usuarios');
  return r;
}
export async function restablecerAccion(id: string) {
  return accion('usuarios.administrar', (tx, a) => restablecerContrasena(tx, a, id));
}

// ---------------- Configuración ----------------
export async function guardarConfiguracionAccion(datos: { nombre_institucion: string; nombre_sistema: string; siglas: string; escaneo_ventana_duplicado_ms: number; escaneo_sonido: boolean }) {
  const r = await accion('configuracion.editar', async (tx, a) => {
    const n = String(datos.nombre_institucion ?? '').trim(), s = String(datos.nombre_sistema ?? '').trim(), g = String(datos.siglas ?? '').trim();
    if (n.length < 3 || n.length > 120) throw new ErrorNegocio('Escribe el nombre de la institución (3 a 120 caracteres).');
    if (s.length < 3 || s.length > 120) throw new ErrorNegocio('Escribe el nombre del sistema (3 a 120 caracteres).');
    if (!/^[A-Za-zÁÉÍÓÚÑ0-9 .-]{2,12}$/.test(g)) throw new ErrorNegocio('Las siglas deben tener de 2 a 12 caracteres.');
    const v = Math.round(Number(datos.escaneo_ventana_duplicado_ms));
    if (!(v >= 0 && v <= 10000)) throw new ErrorNegocio('La ventana de lectura repetida debe estar entre 0 y 10,000 ms.');
    await tx.query(`UPDATE configuracion SET nombre_institucion = $1, nombre_sistema = $2, siglas = $3, escaneo_ventana_duplicado_ms = $4,
                    escaneo_sonido = $5, actualizado = now(), actualizado_por = $6 WHERE id = 1`, [n, s, g, v, !!datos.escaneo_sonido, a.id]);
    await auditar(tx, { usuarioId: a.id, accion: 'configuracion.editar', entidad: 'configuracion', detalle: { nombre_institucion: n, nombre_sistema: s, siglas: g, ventana: v }, ip: a.ip });
  }, 'Configuración guardada');
  revalidatePath('/', 'layout');
  return r;
}

export async function subirLogoAccion(form: FormData) {
  const r = await accion('configuracion.editar', async (tx, a) => {
    const f = form.get('logo');
    if (!(f instanceof File) || f.size === 0) {
      await tx.query('UPDATE configuracion SET logo = NULL, logo_tipo = NULL WHERE id = 1');
      await auditar(tx, { usuarioId: a.id, accion: 'configuracion.quitar_logo', entidad: 'configuracion', ip: a.ip });
      return;
    }
    if (f.size > 300 * 1024) throw new ErrorNegocio('El logotipo debe pesar menos de 300 KB.');
    const buf = Buffer.from(await f.arrayBuffer());
    const tipo = detectarImagen(buf);
    if (!tipo) throw new ErrorNegocio('Usa un archivo PNG, JPG o WebP.');
    await tx.query('UPDATE configuracion SET logo = $1, logo_tipo = $2 WHERE id = 1', [buf, tipo]);
    await auditar(tx, { usuarioId: a.id, accion: 'configuracion.logo', entidad: 'configuracion', detalle: { bytes: buf.length, tipo }, ip: a.ip });
  }, 'Logotipo actualizado');
  revalidatePath('/', 'layout');
  return r;
}

/** Tipo de imagen por firma de archivo (no por extensión). SVG no se acepta para evitar scripts incrustados. */
function detectarImagen(b: Buffer): string | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export async function agregarUbicacionAccion(areaId: number, codigo: string, nombre: string, tipo: string) {
  const r = await accion('configuracion.editar', async (tx, a) => {
    const c = codigo.trim().toUpperCase(), n = nombre.trim();
    if (!c || c.length > 40) throw new ErrorNegocio('Escribe el código de la ubicación (máx. 40 caracteres).');
    if (n.length < 2) throw new ErrorNegocio('Escribe el nombre de la ubicación.');
    const tipos = ['anaquel', 'refrigerador', 'gaveta_controlados', 'carro_rojo', 'almacen', 'cuarentena', 'otro'];
    if (!tipos.includes(tipo)) throw new ErrorNegocio('Tipo de ubicación no válido.');
    const area = (await tx.query<{ virtual: boolean }>('SELECT virtual FROM areas WHERE id = $1', [areaId])).rows[0];
    if (!area || area.virtual) throw new ErrorNegocio('Área no válida.');
    const dup = await tx.query('SELECT 1 FROM ubicaciones WHERE area_id = $1 AND codigo = $2', [areaId, c]);
    if (dup.rows.length) throw new ErrorNegocio(`La ubicación ${c} ya existe en esa área.`);
    await tx.query(`INSERT INTO ubicaciones (area_id, codigo, nombre, tipo, permite_surtido) VALUES ($1, $2, $3, $4::tipo_ubicacion, $5)`,
      [areaId, c, n, tipo, tipo !== 'cuarentena']);
    await auditar(tx, { usuarioId: a.id, accion: 'ubicacion.crear', entidad: 'area', entidadId: areaId, detalle: { codigo: c, nombre: n, tipo }, ip: a.ip });
  }, 'Ubicación creada');
  revalidatePath('/configuracion');
  return r;
}

export async function cambiarUbicacionAccion(id: number, activa: boolean) {
  const r = await accion('configuracion.editar', async (tx, a) => {
    const u = (await tx.query<{ tipo: string }>('SELECT tipo FROM ubicaciones WHERE id = $1', [id])).rows[0];
    if (!u || u.tipo === 'transito') throw new ErrorNegocio('Esa ubicación no se puede modificar.');
    if (!activa) {
      const s = await tx.query('SELECT 1 FROM existencias WHERE ubicacion_id = $1 AND cantidad > 0 LIMIT 1', [id]);
      if (s.rows.length) throw new ErrorNegocio('La ubicación tiene existencias; transfiérelas antes de desactivarla.');
    }
    await tx.query('UPDATE ubicaciones SET activa = $2 WHERE id = $1', [id, activa]);
    await auditar(tx, { usuarioId: a.id, accion: activa ? 'ubicacion.activar' : 'ubicacion.desactivar', entidad: 'ubicacion', entidadId: id, ip: a.ip });
  });
  revalidatePath('/configuracion');
  return r;
}
