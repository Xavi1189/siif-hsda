import 'server-only';
import { crearConexion, type Db } from './db-core';

/**
 * Conexión única por proceso. En producción usa DATABASE_URL (PostgreSQL de Vercel/Neon);
 * sin DATABASE_URL usa PostgreSQL embebido (PGlite) en ./.siif-local para desarrollo.
 */
const g = globalThis as unknown as { __siifDb?: Promise<Db> };

export function db(): Promise<Db> {
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
