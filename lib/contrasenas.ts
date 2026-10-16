import crypto from 'node:crypto';

/** Hash de contraseña con scrypt (incluido en Node, sin dependencias nativas). Formato: scrypt$N$r$p$sal$hash */
const N = 32768, R = 8, P = 1, LARGO = 64;
const MAXMEM = 64 * 1024 * 1024;

function scrypt(pw: string, sal: Buffer, n: number, r: number, p: number, len: number): Promise<Buffer> {
  return new Promise((ok, ko) =>
    crypto.scrypt(pw.normalize('NFKC'), sal, len, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? ko(e) : ok(k))));
}

export async function hashContrasena(pw: string): Promise<string> {
  const sal = crypto.randomBytes(16);
  const h = await scrypt(pw, sal, N, R, P, LARGO);
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64url')}$${h.toString('base64url')}`;
}

export async function verificarContrasena(pw: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64url');
  const h = await scrypt(pw, Buffer.from(sal, 'base64url'), +n, +r, +p, esperado.length);
  return h.length === esperado.length && crypto.timingSafeEqual(h, esperado);
}

/** Reglas mínimas: 10+ caracteres, letras y números, y no igual al usuario. */
export function validarContrasenaNueva(pw: string, usuario?: string): string | null {
  if (pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (pw.length > 128) return 'La contraseña no puede pasar de 128 caracteres.';
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(pw) || !/\d/.test(pw)) return 'Incluye al menos una letra y un número.';
  if (usuario && pw.toLowerCase().includes(usuario.toLowerCase())) return 'La contraseña no debe contener el nombre de usuario.';
  return null;
}

/** Contraseña temporal legible para restablecimientos (el usuario debe cambiarla al entrar). */
export function contrasenaTemporal(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz', d = '23456789';
  const pick = (s: string, n: number) => Array.from(crypto.randomBytes(n), (b) => s[b % s.length]).join('');
  return `${pick(a, 4)}-${pick(d, 4)}-${pick(a, 4)}`;
}
