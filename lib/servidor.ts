import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { db, type Tx } from './db';
import { leerSesion, type UsuarioSesion } from './sesiones';
import { ErrorPermiso, tienePermiso, type Permiso } from './permisos';
import { ErrorNegocio, type Actor } from './catalogo';
import { ErrorConversion } from './conversion';

export const COOKIE_SESION = 'siif_sesion';
export const MIN_INACTIVIDAD = Number(process.env.SIIF_SESION_INACTIVIDAD_MIN || 240);
export const HORAS_MAX = Number(process.env.SIIF_SESION_MAX_HORAS || 14);

export async function ipCliente(): Promise<string | null> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? '').trim() || null;
}

/** Usuario de la sesión actual (una lectura por petición). */
export const usuarioActual = cache(async (): Promise<UsuarioSesion | null> => {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return null;
  return leerSesion(await db(), token, MIN_INACTIVIDAD);
});

/** Para páginas: exige sesión (y permiso si se indica); si no, redirige. */
export async function exigirUsuario(permiso?: Permiso): Promise<UsuarioSesion> {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  if (u.debe_cambiar_contrasena) redirect('/cambiar-contrasena');
  if (permiso && !tienePermiso(u.rol, permiso)) redirect('/?sin-permiso=' + encodeURIComponent(permiso));
  return u;
}

export type Resultado<T = undefined> = { ok: true; datos: T; mensaje?: string } | { ok: false; error: string; campos?: Record<string, string> };

/**
 * Envoltura de toda acción que modifica datos: valida sesión y permiso EN EL SERVIDOR,
 * corre en una transacción y traduce errores a mensajes para el usuario.
 */
export async function accion<T>(permiso: Permiso | null, fn: (tx: Tx, actor: Actor, u: UsuarioSesion) => Promise<T>, mensaje?: string): Promise<Resultado<T>> {
  const u = await usuarioActual();
  if (!u) return { ok: false, error: 'Tu sesión terminó. Vuelve a iniciar sesión.' };
  if (u.debe_cambiar_contrasena) return { ok: false, error: 'Primero cambia tu contraseña temporal.' };
  if (permiso && !tienePermiso(u.rol, permiso)) return { ok: false, error: new ErrorPermiso(permiso).message };
  const actor: Actor = { id: u.id, rol: u.rol, ip: await ipCliente() };
  try {
    const datos = await (await db()).tx((tx) => fn(tx, actor, u));
    return { ok: true, datos, mensaje };
  } catch (e) {
    return traducirError(e);
  }
}

export function traducirError(e: unknown): { ok: false; error: string; campos?: Record<string, string> } {
  if (e instanceof ZodError) {
    const campos: Record<string, string> = {};
    for (const i of e.issues) campos[i.path.join('.') || '_'] ??= i.message;
    return { ok: false, error: 'Revisa los campos marcados.', campos };
  }
  if (e instanceof ErrorPermiso || e instanceof ErrorNegocio || e instanceof ErrorConversion) return { ok: false, error: e.message };
  const pg = e as { code?: string; message?: string };
  if (pg?.code === '23505') return { ok: false, error: 'Ese registro ya existe (dato duplicado).' };
  if (pg?.code === '23514' && pg.message) return { ok: false, error: pg.message };
  console.error('[SIIF] Error no controlado', e);
  return { ok: false, error: 'No se pudo completar la operación. Intenta de nuevo; si persiste, avisa al administrador.' };
}
