import crypto from 'node:crypto';
import type { Tx } from './db-core';
import { verificarContrasena } from './contrasenas';
import type { Rol } from './permisos';

/** Lógica de sesiones independiente de Next (probada directamente en tests/). */

export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;

export interface UsuarioSesion {
  id: string;
  usuario: string;
  nombre: string;
  cargo: string | null;
  rol: Rol;
  debe_cambiar_contrasena: boolean;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface ResultadoLogin {
  ok: boolean;
  motivo?: 'credenciales' | 'bloqueado' | 'inactivo';
  minutosRestantes?: number;
  usuario?: UsuarioSesion;
}

/** Valida usuario y contraseña con bloqueo progresivo. Mensajes genéricos para no revelar qué usuarios existen. */
export async function validarCredenciales(db: Tx, usuario: string, contrasena: string): Promise<ResultadoLogin> {
  const r = await db.query<UsuarioSesion & { hash_contrasena: string; activo: boolean; bloqueado_hasta: Date | null; intentos_fallidos: number }>(
    `SELECT id, usuario, nombre, cargo, rol, debe_cambiar_contrasena, hash_contrasena, activo, bloqueado_hasta, intentos_fallidos
       FROM usuarios WHERE usuario = $1`, [usuario.trim().toLowerCase()]);
  const u = r.rows[0];
  if (!u) {
    // Igualamos el tiempo de respuesta con un hash ficticio
    await verificarContrasena(contrasena, 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86));
    return { ok: false, motivo: 'credenciales' };
  }
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
    return { ok: false, motivo: 'bloqueado', minutosRestantes: Math.ceil((new Date(u.bloqueado_hasta).getTime() - Date.now()) / 60000) };
  }
  const valida = await verificarContrasena(contrasena, u.hash_contrasena);
  if (!valida) {
    const intentos = u.intentos_fallidos + 1;
    const bloquear = intentos >= MAX_INTENTOS;
    await db.query(
      `UPDATE usuarios SET intentos_fallidos = $2,
              bloqueado_hasta = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE bloqueado_hasta END
        WHERE id = $1`, [u.id, bloquear ? 0 : intentos, bloquear, MINUTOS_BLOQUEO]);
    return bloquear ? { ok: false, motivo: 'bloqueado', minutosRestantes: MINUTOS_BLOQUEO } : { ok: false, motivo: 'credenciales' };
  }
  if (!u.activo) return { ok: false, motivo: 'inactivo' };
  await db.query(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id = $1`, [u.id]);
  const { id, usuario: us, nombre, cargo, rol, debe_cambiar_contrasena } = u;
  return { ok: true, usuario: { id, usuario: us, nombre, cargo, rol, debe_cambiar_contrasena } };
}

export async function crearSesion(db: Tx, usuarioId: string, opts: { horasMax: number; ip?: string; agente?: string }): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sesiones (token_hash, usuario_id, expira, ip, agente)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [hashToken(token), usuarioId, opts.horasMax, opts.ip ?? null, (opts.agente ?? '').slice(0, 300)]);
  return token;
}

/** Devuelve el usuario si la sesión es válida (no revocada, no expirada, sin inactividad excesiva). Renueva ultimo_uso. */
export async function leerSesion(db: Tx, token: string | undefined, minutosInactividad: number): Promise<UsuarioSesion | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const r = await db.query<UsuarioSesion & { ultimo_uso: Date }>(
    `SELECT u.id, u.usuario, u.nombre, u.cargo, u.rol, u.debe_cambiar_contrasena, s.ultimo_uso
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.revocada IS NULL AND s.expira > now()
        AND s.ultimo_uso > now() - make_interval(mins => $2) AND u.activo`,
    [hashToken(token), minutosInactividad]);
  const u = r.rows[0];
  if (!u) return null;
  // Renovamos como máximo una vez por minuto para no escribir en cada clic
  if (Date.now() - new Date(u.ultimo_uso).getTime() > 60_000) {
    await db.query('UPDATE sesiones SET ultimo_uso = now() WHERE token_hash = $1', [hashToken(token)]);
  }
  const { id, usuario, nombre, cargo, rol, debe_cambiar_contrasena } = u;
  return { id, usuario, nombre, cargo, rol, debe_cambiar_contrasena };
}

export async function revocarSesion(db: Tx, token: string) {
  await db.query('UPDATE sesiones SET revocada = now() WHERE token_hash = $1 AND revocada IS NULL', [hashToken(token)]);
}

export async function revocarSesionesDeUsuario(db: Tx, usuarioId: string, excepto?: string) {
  await db.query('UPDATE sesiones SET revocada = now() WHERE usuario_id = $1 AND revocada IS NULL AND token_hash <> $2',
    [usuarioId, excepto ? hashToken(excepto) : '']);
}
