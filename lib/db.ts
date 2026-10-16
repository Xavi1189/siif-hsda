import 'server-only';
import { crearConexion, type Db } from './db-core';

/**
 * Conexión única por proceso. En producción usa DATABASE_URL (PostgreSQL de Vercel/Neon);
 * sin DATABASE_URL usa PostgreSQL embebido (PGlite) en ./.siif-local para desarrollo.
 */
const g = globalThis as unknown as { __siifDb?: Promise<Db> };

/** En Vercel sin base de datos conectada no se puede usar la base embebida (disco de solo lectura). */
export function faltaBaseDeDatos(): boolean {
  return !!process.env.VERCEL && !process.env.DATABASE_URL;
}

export function db(): Promise<Db> {
  if (faltaBaseDeDatos()) return Promise.reject(new Error('SIIF: falta conectar la base de datos (DATABASE_URL).'));
  if (!g.__siifDb) {
    g.__siifDb = crearConexion({
      url: process.env.DATABASE_URL || undefined,
      dirLocal: process.env.SIIF_DIR_LOCAL || '.siif-local',
      migrarAlIniciar: !process.env.DATABASE_URL || process.env.SIIF_MIGRAR_AL_INICIAR === '1',
    }).catch((e) => {
      g.__siifDb = undefined;
      throw e;
    });
  }
  return g.__siifDb;
}

export type { Db, Tx } from './db-core';
