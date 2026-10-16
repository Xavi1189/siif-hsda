import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Db } from '@/lib/db-core';
import { baseDePrueba } from './helpers';
import { hashContrasena, validarContrasenaNueva, verificarContrasena } from '@/lib/contrasenas';
import { crearSesion, leerSesion, revocarSesion, validarCredenciales, MAX_INTENTOS } from '@/lib/sesiones';
import { cambiarRolEstado, crearUsuario, restablecerContrasena } from '@/lib/usuarios';

let db: Db, adminId: string;
const PW = 'Farmacia2026segura';

beforeAll(async () => {
  db = await baseDePrueba();
  adminId = (await crearUsuario(db, null, { usuario: 'admin', nombre: 'Administrador Inicial', rol: 'administrador' }, PW)).id;
});
afterAll(async () => { await db.cerrar(); });

describe('contraseñas', () => {
  it('nunca se guardan en texto plano y se verifican con scrypt', async () => {
    const h = await hashContrasena('Clave123segura');
    expect(h).not.toContain('Clave123segura');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verificarContrasena('Clave123segura', h)).toBe(true);
    expect(await verificarContrasena('clave123segura', h)).toBe(false);
    const guardado = (await db.query<{ hash_contrasena: string }>(`SELECT hash_contrasena FROM usuarios WHERE usuario = 'admin'`)).rows[0];
    expect(guardado.hash_contrasena).not.toContain(PW);
  });
  it('aplica reglas mínimas', () => {
    expect(validarContrasenaNueva('corta1')).toMatch(/10 caracteres/);
    expect(validarContrasenaNueva('soloLetrasLargas')).toMatch(/número/);
    expect(validarContrasenaNueva('javier2026abc', 'javier')).toMatch(/usuario/);
    expect(validarContrasenaNueva('Hermosillo2026')).toBeNull();
  });
});

describe('inicio de sesión', () => {
  it('acepta credenciales correctas (sin distinguir mayúsculas en el usuario)', async () => {
    const r = await validarCredenciales(db, ' ADMIN ', PW);
    expect(r.ok).toBe(true);
    expect(r.usuario?.rol).toBe('administrador');
  });
  it('rechaza usuario inexistente con el mismo mensaje genérico', async () => {
    expect(await validarCredenciales(db, 'nadie', PW)).toEqual({ ok: false, motivo: 'credenciales' });
  });
  it(`bloquea la cuenta tras ${MAX_INTENTOS} intentos fallidos, incluso con la contraseña correcta después`, async () => {
    await crearUsuario(db, null, { usuario: 'aux.prueba', nombre: 'Auxiliar Prueba', rol: 'auxiliar' }, 'Auxiliar2026x');
    for (let i = 0; i < MAX_INTENTOS - 1; i++) expect((await validarCredenciales(db, 'aux.prueba', 'mala' + i)).motivo).toBe('credenciales');
    expect((await validarCredenciales(db, 'aux.prueba', 'mala-final')).motivo).toBe('bloqueado');
    expect((await validarCredenciales(db, 'aux.prueba', 'Auxiliar2026x')).motivo).toBe('bloqueado');
  });
  it('un usuario desactivado no puede entrar', async () => {
    const { id } = await crearUsuario(db, null, { usuario: 'baja', nombre: 'Usuario Baja', rol: 'consulta' }, 'Consulta2026x');
    await cambiarRolEstado(db, { id: adminId, rol: 'administrador' }, id, { activo: false });
    expect((await validarCredenciales(db, 'baja', 'Consulta2026x')).motivo).toBe('inactivo');
  });
});

describe('sesiones', () => {
  it('el token solo se guarda como hash y la sesión se puede leer y revocar', async () => {
    const token = await crearSesion(db, adminId, { horasMax: 14 });
    const fila = await db.query('SELECT 1 FROM sesiones WHERE token_hash = $1', [token]);
    expect(fila.rows).toHaveLength(0);
    expect((await leerSesion(db, token, 240))?.usuario).toBe('admin');
    await revocarSesion(db, token);
    expect(await leerSesion(db, token, 240)).toBeNull();
  });
  it('expira por inactividad y por límite absoluto', async () => {
    const t1 = await crearSesion(db, adminId, { horasMax: 14 });
    await db.query(`UPDATE sesiones SET ultimo_uso = now() - interval '5 hours' WHERE usuario_id = $1 AND revocada IS NULL`, [adminId]);
    expect(await leerSesion(db, t1, 240)).toBeNull();
    const t2 = await crearSesion(db, adminId, { horasMax: 14 });
    await db.query(`UPDATE sesiones SET expira = now() - interval '1 minute' WHERE usuario_id = $1 AND revocada IS NULL`, [adminId]);
    expect(await leerSesion(db, t2, 240)).toBeNull();
  });
  it('restablecer la contraseña revoca las sesiones abiertas y obliga a cambiarla', async () => {
    const { id } = await crearUsuario(db, null, { usuario: 'enc.prueba', nombre: 'Encargado Prueba', rol: 'encargado' }, 'Encargado2026x');
    const token = await crearSesion(db, id, { horasMax: 14 });
    const temporal = await restablecerContrasena(db, { id: adminId, rol: 'administrador' }, id);
    expect(await leerSesion(db, token, 240)).toBeNull();
    const r = await validarCredenciales(db, 'enc.prueba', temporal);
    expect(r.ok && r.usuario?.debe_cambiar_contrasena).toBe(true);
  });
});

describe('administración de usuarios', () => {
  it('un encargado no puede crear usuarios', async () => {
    await expect(crearUsuario(db, { id: adminId, rol: 'encargado' }, { usuario: 'x.y', nombre: 'Nuevo Usuario', rol: 'auxiliar' }))
      .rejects.toThrow(/No tienes permiso/);
  });
  it('el Responsable Sanitario no puede crear administradores', async () => {
    await expect(crearUsuario(db, { id: adminId, rol: 'responsable_sanitario' }, { usuario: 'otro.admin', nombre: 'Otro Admin', rol: 'administrador' }))
      .rejects.toThrow(/Solo un administrador/);
  });
  it('siempre queda al menos un administrador activo', async () => {
    const { id: otro } = await crearUsuario(db, { id: adminId, rol: 'administrador' }, { usuario: 'rs.prueba', nombre: 'RS Prueba', rol: 'responsable_sanitario' });
    await expect(cambiarRolEstado(db, { id: otro, rol: 'administrador' }, adminId, { activo: false })).rejects.toThrow(/al menos un administrador/);
  });
  it('cada alta queda en la bitácora', async () => {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int n FROM auditoria WHERE accion = 'usuario.crear'`);
    expect(r.rows[0].n).toBeGreaterThanOrEqual(5);
  });
});
