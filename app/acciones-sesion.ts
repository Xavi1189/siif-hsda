'use server';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { crearSesion, revocarSesion, validarCredenciales } from '@/lib/sesiones';
import { cambiarContrasenaPropia, crearUsuario } from '@/lib/usuarios';
import { COOKIE_SESION, HORAS_MAX, ipCliente, traducirError, usuarioActual } from '@/lib/servidor';

async function abrirSesion(usuarioId: string) {
  const conn = await db();
  const token = await crearSesion(conn, usuarioId, { horasMax: HORAS_MAX, ip: (await ipCliente()) ?? undefined, agente: (await headers()).get('user-agent') ?? undefined });
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: HORAS_MAX * 3600,
  });
}

export async function iniciarSesion(_: unknown, form: FormData): Promise<{ error?: string }> {
  const usuario = String(form.get('usuario') ?? '').slice(0, 60);
  const contrasena = String(form.get('contrasena') ?? '').slice(0, 200);
  if (!usuario || !contrasena) return { error: 'Escribe tu usuario y contraseña.' };
  const conn = await db();
  const r = await validarCredenciales(conn, usuario, contrasena);
  const ip = await ipCliente();
  if (!r.ok) {
    await auditar(conn, { usuarioId: null, accion: 'sesion.fallida', detalle: { usuario: usuario.toLowerCase(), motivo: r.motivo }, ip });
    if (r.motivo === 'bloqueado') return { error: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta en ${r.minutosRestantes} min o pide a un administrador que restablezca tu contraseña.` };
    if (r.motivo === 'inactivo') return { error: 'Tu cuenta está desactivada. Habla con el administrador del sistema.' };
    return { error: 'Usuario o contraseña incorrectos.' };
  }
  await abrirSesion(r.usuario!.id);
  await auditar(conn, { usuarioId: r.usuario!.id, accion: 'sesion.iniciar', ip });
  redirect(r.usuario!.debe_cambiar_contrasena ? '/cambiar-contrasena' : '/');
}

export async function cerrarSesion() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESION)?.value;
  const u = await usuarioActual();
  if (token) {
    const conn = await db();
    await revocarSesion(conn, token);
    if (u) await auditar(conn, { usuarioId: u.id, accion: 'sesion.cerrar', ip: await ipCliente() });
  }
  jar.delete(COOKIE_SESION);
  redirect('/login');
}

export async function cambiarContrasena(_: unknown, form: FormData): Promise<{ error?: string }> {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  const nueva = String(form.get('nueva') ?? ''), confirma = String(form.get('confirma') ?? '');
  if (nueva !== confirma) return { error: 'La confirmación no coincide con la nueva contraseña.' };
  try {
    const token = (await cookies()).get(COOKIE_SESION)?.value;
    await (await db()).tx((tx) => cambiarContrasenaPropia(tx, { id: u.id, rol: u.rol }, String(form.get('actual') ?? ''), nueva, token));
  } catch (e) {
    return { error: traducirError(e).error };
  }
  redirect('/?contrasena=actualizada');
}

/** Alta del primer administrador. Solo funciona si no hay usuarios y con la clave de instalación del entorno. */
export async function instalar(_: unknown, form: FormData): Promise<{ error?: string }> {
  const clave = process.env.SIIF_CLAVE_INSTALACION;
  if (!clave || clave.length < 16) return { error: 'Falta configurar SIIF_CLAVE_INSTALACION (mínimo 16 caracteres) en las variables de entorno.' };
  const dada = Buffer.from(String(form.get('clave') ?? ''));
  const esperada = Buffer.from(clave);
  if (dada.length !== esperada.length || !crypto.timingSafeEqual(dada, esperada)) return { error: 'La clave de instalación no es correcta.' };
  const conn = await db();
  try {
    const id = await conn.tx(async (tx) => {
      await tx.query('LOCK TABLE usuarios IN EXCLUSIVE MODE');
      const hay = await tx.query('SELECT 1 FROM usuarios LIMIT 1');
      if (hay.rows.length) throw new Error('YA_INSTALADO');
      if (form.get('contrasena') !== form.get('confirma')) throw new Error('NO_COINCIDE');
      const r = await crearUsuario(tx, null, { usuario: form.get('usuario'), nombre: form.get('nombre'), cargo: form.get('cargo'), rol: 'administrador' }, String(form.get('contrasena') ?? ''));
      await tx.query(`UPDATE usuarios SET debe_cambiar_contrasena = false, ultimo_acceso = now() WHERE id = $1`, [r.id]);
      return r.id;
    });
    await abrirSesion(id);
  } catch (e) {
    if ((e as Error).message === 'YA_INSTALADO') return { error: 'El sistema ya tiene usuarios. Inicia sesión normalmente.' };
    if ((e as Error).message === 'NO_COINCIDE') return { error: 'Las contraseñas no coinciden.' };
    const t = traducirError(e);
    return { error: t.campos ? Object.values(t.campos)[0] : t.error };
  }
  redirect('/configuracion?bienvenida=1');
}
