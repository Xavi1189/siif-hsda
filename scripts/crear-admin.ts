/**
 * Crea un administrador desde la terminal (alternativa a /instalacion).
 * Uso: DATABASE_URL=... npm run crear-admin -- usuario "Nombre Completo"
 * La contraseña se pide por la terminal y nunca se guarda en archivos.
 */
import readline from 'node:readline';
import { crearConexion, migrar } from '../lib/db-core';
import { crearUsuario } from '../lib/usuarios';

function preguntar(texto: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((ok) => {
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => { if (s.includes(texto)) out.output.write(s); else out.output.write('*'); };
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); ok(r); });
  });
}

(async () => {
  const [usuario, nombre] = process.argv.slice(2);
  if (!usuario || !nombre) { console.log('Uso: npm run crear-admin -- usuario "Nombre Completo"'); process.exit(1); }
  const pw = await preguntar('Contraseña (10+ caracteres, letras y números): ');
  if (pw !== await preguntar('Confirma la contraseña: ')) { console.error('No coinciden.'); process.exit(1); }
  const db = await crearConexion({ url: process.env.DATABASE_URL || undefined, dirLocal: process.env.SIIF_DIR_LOCAL || '.siif-local' });
  await migrar(db);
  const r = await db.tx(async (tx) => {
    const x = await crearUsuario(tx, null, { usuario, nombre, rol: 'administrador' }, pw);
    await tx.query('UPDATE usuarios SET debe_cambiar_contrasena = false WHERE id = $1', [x.id]);
    return x;
  });
  console.log(`Administrador ${usuario} creado (${r.id}).`);
  await db.cerrar();
})().catch((e) => { console.error('Error:', e.message ?? e); process.exit(1); });
