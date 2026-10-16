import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/servidor';
import { ACCIONES } from '@/lib/acciones-auditoria';
import { fechaHora, num } from '@/lib/formato';
import { Encabezado, Insignia, Vacio } from '@/components/ui';

export const metadata = { title: 'Bitácora' };
const POR_PAGINA = 50;

export default async function Bitacora({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirUsuario('auditoria.ver');
  const sp = await searchParams;
  const c = await db();
  const cond: string[] = [], p: unknown[] = [];
  if (sp.usuario) { p.push(sp.usuario); cond.push(`a.usuario_id = $${p.length}::uuid`); }
  if (sp.accion) { p.push(sp.accion + '%'); cond.push(`a.accion LIKE $${p.length}`); }
  if (sp.desde && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde)) { p.push(sp.desde); cond.push(`a.momento >= ($${p.length}::date::timestamp AT TIME ZONE 'America/Hermosillo')`); }
  if (sp.hasta && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta)) { p.push(sp.hasta); cond.push(`a.momento < (($${p.length}::date + 1)::timestamp AT TIME ZONE 'America/Hermosillo')`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const total = Number((await c.query<{ n: string }>(`SELECT count(*) n FROM auditoria a ${where}`, p)).rows[0].n);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(sp.pagina) || 1), paginas);
  const filas = (await c.query<{ id: number; momento: string; accion: string; nombre: string | null; usuario: string | null; entidad: string | null; entidad_id: string | null; detalle: unknown; ip: string | null }>(
    `SELECT a.id, a.momento, a.accion, u.nombre, u.usuario, a.entidad, a.entidad_id, a.detalle, a.ip
       FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id ${where}
      ORDER BY a.momento DESC, a.id DESC LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, p)).rows;
  const usuarios = (await c.query<{ id: string; nombre: string }>('SELECT id, nombre FROM usuarios ORDER BY nombre')).rows;
  const grupos = [['', 'Todas las acciones'], ['sesion', 'Sesiones'], ['producto', 'Productos'], ['codigo', 'Códigos de barras'], ['etiqueta', 'Etiquetas'], ['usuario', 'Usuarios'], ['configuracion', 'Configuración'], ['catalogo', 'Importaciones']];
  const enlace = (n: number) => '/usuarios/bitacora?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, pagina: String(n) });

  return (
    <>
      <Encabezado migas={<Link href="/usuarios" className="hover:text-clinico hover:underline">Usuarios</Link>} titulo="Bitácora de auditoría"
        descripcion="Registro de solo agregar: nadie, ni el administrador, puede modificar o borrar estos eventos desde el sistema." />
      <form method="get" className="tarjeta mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
        <select name="usuario" defaultValue={sp.usuario ?? ''} className="campo" aria-label="Usuario">
          <option value="">Todos los usuarios</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <select name="accion" defaultValue={sp.accion ?? ''} className="campo" aria-label="Tipo de acción">
          {grupos.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[13px] text-tenue">Desde<input type="date" name="desde" defaultValue={sp.desde} className="campo" /></label>
        <label className="flex items-center gap-2 text-[13px] text-tenue">Hasta<input type="date" name="hasta" defaultValue={sp.hasta} className="campo" /></label>
        <button className="btn-secundario">Filtrar</button>
      </form>
      <div className="tarjeta overflow-hidden">
        <div className="border-b border-linea px-4 py-2.5 text-[13px] text-tenue"><span className="font-semibold text-tinta">{num(total)}</span> eventos · página {pagina} de {paginas}</div>
        {filas.length === 0 ? <Vacio titulo="Sin eventos con esos filtros" /> : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[820px]">
              <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="whitespace-nowrap font-mono text-[12px]">{fechaHora(f.momento)}</td>
                    <td className="text-[13px]">{f.nombre ?? <span className="text-tenue">—</span>}{f.usuario && <span className="block font-mono text-[11px] text-tenue">{f.usuario}</span>}</td>
                    <td className="text-[13px]">{f.accion === 'sesion.fallida' ? <Insignia tono="alerta">{ACCIONES[f.accion]}</Insignia> : ACCIONES[f.accion] ?? f.accion}
                      {f.entidad === 'producto' && f.entidad_id && <Link href={`/catalogo/${f.entidad_id}`} className="block text-[12px] text-clinico hover:underline">Ver producto</Link>}</td>
                    <td className="max-w-[420px] break-words font-mono text-[11px] text-tenue">{f.detalle ? JSON.stringify(f.detalle).slice(0, 400) : ''}</td>
                    <td className="font-mono text-[11px] text-tenue">{f.ip ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {paginas > 1 && (
          <nav className="flex justify-end gap-2 border-t border-linea px-4 py-2.5" aria-label="Paginación">
            {pagina > 1 && <Link className="btn-secundario btn-chico" href={enlace(pagina - 1)}><ChevronLeft size={14} aria-hidden />Anterior</Link>}
            {pagina < paginas && <Link className="btn-secundario btn-chico" href={enlace(pagina + 1)}>Siguiente<ChevronRight size={14} aria-hidden /></Link>}
          </nav>
        )}
      </div>
    </>
  );
}
