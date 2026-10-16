/** Aplica las migraciones pendientes. Uso: DATABASE_URL=... npm run db:migrate (sin DATABASE_URL usa la base local .siif-local). */
import { crearConexion, migrar } from '../lib/db-core';

(async () => {
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    console.warn('SIIF: no hay DATABASE_URL en Vercel; se omiten las migraciones. Conecta la base (Storage → Neon) y vuelve a desplegar.');
    return;
  }
  const db = await crearConexion({ url: process.env.DATABASE_URL || undefined, dirLocal: process.env.SIIF_DIR_LOCAL || '.siif-local' });
  const aplicadas = await migrar(db);
  console.log(aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'La base de datos ya estaba al día.');
  await db.cerrar();
})().catch((e) => { console.error('Error al migrar:', e.message); process.exit(1); });
