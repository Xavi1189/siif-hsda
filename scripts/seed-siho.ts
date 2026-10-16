/** Importa el catálogo del SIHO desde la terminal, a nombre del primer administrador. Equivale al botón de Configuración. */
import fs from 'node:fs';
import { crearConexion, migrar } from '../lib/db-core';
import { importarCatalogoSiho, type CorteSiho } from '../lib/siho';

(async () => {
  const db = await crearConexion({ url: process.env.DATABASE_URL || undefined, dirLocal: process.env.SIIF_DIR_LOCAL || '.siif-local' });
  await migrar(db);
  const admin = (await db.query<{ id: string }>(`SELECT id FROM usuarios WHERE rol = 'administrador' AND activo ORDER BY creado LIMIT 1`)).rows[0];
  if (!admin) { console.error('Primero crea un administrador (npm run crear-admin o /instalacion).'); process.exit(1); }
  const corte = JSON.parse(fs.readFileSync(process.argv[2] ?? 'data/siho-catalogo-2026-10-15.json', 'utf8')) as CorteSiho;
  const r = await db.tx((tx) => importarCatalogoSiho(tx, { id: admin.id, rol: 'administrador' }, corte));
  console.log('Importación SIHO:', r);
  await db.cerrar();
})().catch((e) => { console.error('Error:', e.message ?? e); process.exit(1); });
