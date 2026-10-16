import 'server-only';
import { cache } from 'react';
import { db } from './db';

export interface ConfigInstitucional {
  nombre_institucion: string; nombre_sistema: string; siglas: string; tiene_logo: boolean;
  escaneo_ventana_duplicado_ms: number; escaneo_sonido: boolean; actualizado: string;
}

export const configuracion = cache(async (): Promise<ConfigInstitucional> => {
  const r = await (await db()).query<ConfigInstitucional>(
    `SELECT nombre_institucion, nombre_sistema, siglas, (logo IS NOT NULL) AS tiene_logo, escaneo_ventana_duplicado_ms, escaneo_sonido, actualizado::text
       FROM configuracion WHERE id = 1`);
  return r.rows[0];
});
