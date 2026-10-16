import type { Tx } from './db-core';

export interface EventoAuditoria {
  usuarioId: string | null;
  accion: string;              // p. ej. 'producto.editar', 'sesion.iniciar'
  entidad?: string;
  entidadId?: string | number;
  detalle?: Record<string, unknown>;
  ip?: string | null;
}

/** Registra un evento en la bitácora (tabla de solo agregar). Debe llamarse dentro de la misma transacción que el cambio. */
export async function auditar(tx: Tx, e: EventoAuditoria) {
  await tx.query(
    `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, ip) VALUES ($1, $2, $3, $4, $5, $6)`,
    [e.usuarioId, e.accion, e.entidad ?? null, e.entidadId != null ? String(e.entidadId) : null,
      e.detalle ? JSON.stringify(e.detalle) : null, e.ip ?? null]);
}

/** Diferencias campo a campo entre dos versiones de un registro, para la bitácora. */
export function diferencias(antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const out: Record<string, { antes: unknown; despues: unknown }> = {};
  for (const k of Object.keys(despues)) {
    const a = antes[k] ?? null, d = despues[k] ?? null;
    if (String(a) !== String(d)) out[k] = { antes: a, despues: d };
  }
  return out;
}
