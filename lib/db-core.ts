import fs from 'node:fs';
import path from 'node:path';

/** Ejecutor de consultas: igual dentro y fuera de una transacción. */
export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Ejecuta un script de varias sentencias sin parámetros. */
  exec(sql: string): Promise<void>;
}
export interface Db extends Tx {
  /** Ejecuta fn en UNA transacción: si lanza error, nada se aplica. */
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
  motor: 'postgres' | 'pglite';
}

export interface OpcionesConexion {
  url?: string;
  dirLocal?: string; // directorio de PGlite; 'memory://' para pruebas
  migrarAlIniciar?: boolean;
}

export async function crearConexion(op: OpcionesConexion): Promise<Db> {
  const db = op.url ? await conexionPostgres(op.url) : await conexionPglite(op.dirLocal ?? '.siif-local');
  if (op.migrarAlIniciar) await migrar(db);
  return db;
}

async function conexionPostgres(url: string): Promise<Db> {
  const { Pool } = await import('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.SIIF_DB_MAX_CONEXIONES || 5),
    ssl: local ? undefined : { rejectUnauthorized: true },
    idleTimeoutMillis: 10_000,
  });
  // Sin SET de sesión: con el pool de Neon (PgBouncer) los ajustes de sesión no son confiables.
  // Las fechas se guardan como timestamptz y se formatean en America/Hermosillo en la aplicación.
  return {
    motor: 'postgres',
    query: (sql, params) => pool.query(sql, params as unknown[]) as never,
    exec: async (sql) => { await pool.query(sql); },
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({ query: (s, p) => c.query(s, p as unknown[]) as never, exec: async (s) => { await c.query(s); } });
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    cerrar: () => pool.end(),
  };
}

async function conexionPglite(dir: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (!dir.startsWith('memory://')) fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  await pg.exec("SET TIME ZONE 'America/Hermosillo'");
  // PGlite es de una sola conexión: serializamos las transacciones para que no se intercalen.
  let cola: Promise<unknown> = Promise.resolve();
  const enCola = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = cola.then(fn, fn);
    cola = r.catch(() => {});
    return r;
  };
  return {
    motor: 'pglite',
    query: (sql, params) => enCola(() => pg.query(sql, params as unknown[])) as never,
    exec: (sql) => enCola(async () => { await pg.exec(sql); }),
    tx: (fn) => enCola(() => pg.transaction((t) => fn({
      query: (s, p) => t.query(s, p as unknown[]) as never,
      exec: async (s) => { await t.exec(s); },
    }))),
    cerrar: () => pg.close(),
  };
}

/** Aplica en orden las migraciones de db/migraciones que aún no se han aplicado. */
export async function migrar(db: Db, dir = path.join(process.cwd(), 'db', 'migraciones')): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS esquema_migraciones (
    version text PRIMARY KEY, aplicada timestamptz NOT NULL DEFAULT now())`);
  const hechas = new Set((await db.query<{ version: string }>('SELECT version FROM esquema_migraciones')).rows.map((r) => r.version));
  const archivos = fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const aplicadas: string[] = [];
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.tx(async (tx) => {
      // Bloqueo para que dos procesos no migren a la vez
      await tx.query('SELECT pg_advisory_xact_lock(73110001)');
      const ya = await tx.query('SELECT 1 FROM esquema_migraciones WHERE version = $1', [f]);
      if (ya.rows.length) return;
      await tx.exec(sql);
      await tx.query('INSERT INTO esquema_migraciones (version) VALUES ($1)', [f]);
    });
    aplicadas.push(f);
  }
  return aplicadas;
}
