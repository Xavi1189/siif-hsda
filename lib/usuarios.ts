import { z } from 'zod';
import type { Tx } from './db-core';
import { auditar } from './auditoria';
import { ErrorPermiso, ROLES, tienePermiso } from './permisos';
import { contrasenaTemporal, hashContrasena, validarContrasenaNueva, verificarContrasena } from './contrasenas';
import { revocarSesionesDeUsuario } from './sesiones';
import { ErrorNegocio, type Actor } from './catalogo';

export const esquemaUsuario = z.object({
  usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Usuario de 3 a 40 caracteres: minúsculas, números, punto, guion.'),
  nombre: z.string().trim().min(3, 'Escribe el nombre completo.').max(120),
  cargo: z.string().trim().max(80).transform((s) => s || null).nullable().optional(),
  rol: z.enum(ROLES),
});

export async function crearUsuario(tx: Tx, a: Actor | null, entrada: unknown, contrasena?: string) {
  if (a && !tienePermiso(a.rol, 'usuarios.administrar')) throw new ErrorPermiso('usuarios.administrar');
  const d = esquemaUsuario.parse(entrada);
  if (a && d.rol === 'administrador' && a.rol !== 'administrador') throw new ErrorNegocio('Solo un administrador puede crear otro administrador.');
  const dup = await tx.query('SELECT 1 FROM usuarios WHERE usuario = $1', [d.usuario]);
  if (dup.rows.length) throw new ErrorNegocio(`El usuario ${d.usuario} ya existe.`);
  const temporal = contrasena ?? contrasenaTemporal();
  if (contrasena) { const err = validarContrasenaNueva(contrasena, d.usuario); if (err) throw new ErrorNegocio(err); }
  const r = await tx.query<{ id: string }>(
    `INSERT INTO usuarios (usuario, nombre, cargo, rol, hash_contrasena, debe_cambiar_contrasena, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [d.usuario, d.nombre, d.cargo ?? null, d.rol, await hashContrasena(temporal), !contrasena, a?.id ?? null]);
  const id = r.rows[0].id;
  await auditar(tx, { usuarioId: a?.id ?? id, accion: 'usuario.crear', entidad: 'usuario', entidadId: id, detalle: { usuario: d.usuario, rol: d.rol }, ip: a?.ip });
  return { id, temporal: contrasena ? null : temporal };
}

export async function cambiarRolEstado(tx: Tx, a: Actor, usuarioId: string, cambios: { rol?: string; activo?: boolean }) {
  if (!tienePermiso(a.rol, 'usuarios.administrar')) throw new ErrorPermiso('usuarios.administrar');
  const u = (await tx.query<{ rol: string; activo: boolean; usuario: string }>('SELECT rol, activo, usuario FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId])).rows[0];
  if (!u) throw new ErrorNegocio('El usuario no existe.');
  if (usuarioId === a.id) throw new ErrorNegocio('No puedes cambiar tu propio rol ni desactivarte.');
  const rol = cambios.rol ?? u.rol;
  if (!(ROLES as readonly string[]).includes(rol)) throw new ErrorNegocio('Rol no válido.');
  if ((rol === 'administrador' || u.rol === 'administrador') && a.rol !== 'administrador') throw new ErrorNegocio('Solo un administrador puede asignar o retirar el rol de administrador.');
  const activo = cambios.activo ?? u.activo;
  if (u.rol === 'administrador' && (rol !== 'administrador' || !activo)) {
    const otros = await tx.query(`SELECT 1 FROM usuarios WHERE rol = 'administrador' AND activo AND id <> $1`, [usuarioId]);
    if (!otros.rows.length) throw new ErrorNegocio('Debe quedar al menos un administrador activo.');
  }
  await tx.query('UPDATE usuarios SET rol = $2, activo = $3 WHERE id = $1', [usuarioId, rol, activo]);
  if (!activo || rol !== u.rol) await revocarSesionesDeUsuario(tx, usuarioId);
  await auditar(tx, { usuarioId: a.id, accion: 'usuario.modificar', entidad: 'usuario', entidadId: usuarioId,
    detalle: { usuario: u.usuario, rol: { antes: u.rol, despues: rol }, activo: { antes: u.activo, despues: activo } }, ip: a.ip });
}

export async function restablecerContrasena(tx: Tx, a: Actor, usuarioId: string) {
  if (!tienePermiso(a.rol, 'usuarios.administrar')) throw new ErrorPermiso('usuarios.administrar');
  const u = (await tx.query<{ usuario: string; rol: string }>('SELECT usuario, rol FROM usuarios WHERE id = $1', [usuarioId])).rows[0];
  if (!u) throw new ErrorNegocio('El usuario no existe.');
  if (u.rol === 'administrador' && a.rol !== 'administrador') throw new ErrorNegocio('Solo un administrador puede restablecer la contraseña de otro administrador.');
  const temporal = contrasenaTemporal();
  await tx.query(`UPDATE usuarios SET hash_contrasena = $2, debe_cambiar_contrasena = true, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1`,
    [usuarioId, await hashContrasena(temporal)]);
  await revocarSesionesDeUsuario(tx, usuarioId);
  await auditar(tx, { usuarioId: a.id, accion: 'usuario.restablecer_contrasena', entidad: 'usuario', entidadId: usuarioId, detalle: { usuario: u.usuario }, ip: a.ip });
  return temporal;
}

export async function cambiarContrasenaPropia(tx: Tx, a: Actor, actual: string, nueva: string, tokenActual?: string) {
  const u = (await tx.query<{ usuario: string; hash_contrasena: string }>('SELECT usuario, hash_contrasena FROM usuarios WHERE id = $1', [a.id])).rows[0];
  if (!u || !(await verificarContrasena(actual, u.hash_contrasena))) throw new ErrorNegocio('La contraseña actual no es correcta.');
  const err = validarContrasenaNueva(nueva, u.usuario);
  if (err) throw new ErrorNegocio(err);
  if (await verificarContrasena(nueva, u.hash_contrasena)) throw new ErrorNegocio('La nueva contraseña debe ser distinta de la actual.');
  await tx.query('UPDATE usuarios SET hash_contrasena = $2, debe_cambiar_contrasena = false WHERE id = $1', [a.id, await hashContrasena(nueva)]);
  await revocarSesionesDeUsuario(tx, a.id, tokenActual);
  await auditar(tx, { usuarioId: a.id, accion: 'usuario.cambiar_contrasena', entidad: 'usuario', entidadId: a.id, ip: a.ip });
}
