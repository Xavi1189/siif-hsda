import { crearConexion, migrar, type Db } from '@/lib/db-core';

/** Base PostgreSQL nueva en memoria (PGlite), con todas las migraciones aplicadas. */
export async function baseDePrueba(): Promise<Db> {
  const db = await crearConexion({ dirLocal: 'memory://' });
  await migrar(db);
  return db;
}

export async function crearUsuarioPrueba(db: Db, rol = 'administrador', usuario = 'prueba.' + rol.slice(0, 6)) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO usuarios (usuario, nombre, rol, hash_contrasena) VALUES ($1, $2, $3, 'scrypt$prueba') RETURNING id`,
    [usuario, 'Usuario de prueba ' + rol, rol]);
  return r.rows[0].id;
}
