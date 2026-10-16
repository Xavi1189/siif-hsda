import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/servidor';
import { obtenerProducto } from '@/lib/catalogo';
import { tienePermiso } from '@/lib/permisos';
import { ACCIONES } from '@/lib/acciones-auditoria';
import { fechaHora, mxn } from '@/lib/formato';
import { Aviso, Controlado, Encabezado, EtiquetaProducto, Insignia, Seccion } from '@/components/ui';
import { FormularioProducto } from '@/components/catalogo/FormularioProducto';
import { Codigos, Etiquetas, ParametrosArea, Presentaciones } from '@/components/catalogo/SeccionesProducto';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return { title: 'Producto' };
  const r = await (await db()).query<{ clave: string }>('SELECT clave FROM productos WHERE id = $1', [id]);
  return { title: r.rows[0]?.clave ?? 'Producto' };
}

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuario('catalogo.ver');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const d = await obtenerProducto(await db(), id);
  if (!d) notFound();
  const p = d.producto as Record<string, string | boolean | null> & { id: number; clave: string; descripcion: string; unidad_minima: string };
  const editable = tienePermiso(u.rol, 'catalogo.editar');
  const etiquetasActivas = d.etiquetas.filter((e) => e.asignada);
  const puedeVincular = tienePermiso(u.rol, 'codigos.vincular') ? 'directo' : tienePermiso(u.rol, 'codigos.proponer') ? 'propuesta' : null;

  return (
    <>
      <Encabezado migas={<><Link href="/catalogo" className="hover:text-clinico hover:underline">Catálogo</Link> / <span className="font-mono">{p.clave}</span></>}
        titulo={p.descripcion}
        descripcion={<span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono">{p.clave}</span> · {mxn(p.costo_unitario as string)} por {p.unidad_minima.toLowerCase()}
          {p.estatus !== 'activo' && <Insignia>{p.estatus === 'inactivo' ? 'Inactivo' : 'Descontinuado'}</Insignia>}
          {p.controlado && <Controlado grupo={p.grupo_controlado as string | null} />}
          {etiquetasActivas.map((e) => <EtiquetaProducto key={e.id} e={e} />)}
          {p.origen === 'siho' && <Insignia tono="info">Importado del SIHO</Insignia>}
        </span>} />

      {etiquetasActivas.some((e) => e.advertencia) && (
        <div className="mb-5 flex flex-col gap-2">
          {etiquetasActivas.filter((e) => e.advertencia).map((e) => <Aviso key={e.id} tono={e.tono === 'peligro' ? 'peligro' : 'alerta'} titulo={e.nombre}>{e.advertencia}</Aviso>)}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Seccion titulo="Datos del producto" descripcion={editable ? 'Cada cambio queda registrado con usuario, fecha y valores anterior y nuevo.' : 'Solo lectura para tu rol.'}>
            <FormularioProducto id={p.id} editable={editable} puedeControlado={tienePermiso(u.rol, 'catalogo.etiquetas')}
              inicial={Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v == null ? (k === 'grupo_controlado' ? null : '') : typeof v === 'boolean' ? v : String(v)]))} />
          </Seccion>
          <Seccion titulo="Códigos de barras" descripcion="Un código identifica una presentación. Una caja (EAN/GTIN) normalmente NO trae lote ni caducidad; esos datos se capturan al recibir.">
            <Codigos id={p.id} codigos={d.codigos} presentaciones={d.presentaciones} puedeVincular={puedeVincular} puedeVerificar={tienePermiso(u.rol, 'codigos.verificar')} />
          </Seccion>
          <Seccion titulo="Parámetros por área" descripcion="Mínimos, máximos y reorden en unidad mínima. Sirven para alertas y sugerencias de compra (Fase 4).">
            <div className="grid gap-3 lg:grid-cols-2">
              {d.parametros.map((x) => <ParametrosArea key={x.area_id} id={p.id} unidad={p.unidad_minima} p={x} ubicaciones={d.ubicaciones} editable={editable} />)}
            </div>
          </Seccion>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Seccion titulo="Presentaciones y conversión">
            <Presentaciones id={p.id} unidad={p.unidad_minima} presentaciones={d.presentaciones} editable={editable} />
          </Seccion>
          <Seccion titulo="Etiquetas de seguridad" descripcion="Se muestran con ícono y texto al seleccionar o surtir el producto.">
            <Etiquetas id={p.id} etiquetas={d.etiquetas} editable={tienePermiso(u.rol, 'catalogo.etiquetas')} />
          </Seccion>
          <Seccion titulo="Lotes y existencias">
            <div className="flex items-start gap-3 text-[14px] text-tenue">
              <Boxes size={20} aria-hidden className="mt-0.5 shrink-0 text-marino-300" />
              <p>Las existencias por lote, caducidad y ubicación se mostrarán aquí cuando se registren entradas o el inventario inicial (Fases 3 y 4). Hoy no hay movimientos para este producto.</p>
            </div>
          </Seccion>
          <Seccion titulo="Historial del producto">
            {d.historial.length ? (
              <ol className="flex flex-col divide-y divide-linea text-[13px]">
                {d.historial.map((h, i) => (
                  <li key={i} className="py-2">
                    <span className="font-medium">{ACCIONES[h.accion] ?? h.accion}</span> · {h.usuario ?? 'Sistema'}
                    <span className="block font-mono text-[12px] text-tenue">{fechaHora(h.momento)}</span>
                    {resumen(h.detalle) && <span className="mt-0.5 block break-words text-tenue">{resumen(h.detalle)}</span>}
                  </li>
                ))}
              </ol>
            ) : <p className="text-[14px] text-tenue">Sin cambios registrados.</p>}
          </Seccion>
        </div>
      </div>
    </>
  );
}

function resumen(det: unknown): string | null {
  if (!det || typeof det !== 'object') return null;
  const d = det as Record<string, unknown>;
  if (d.cambios && typeof d.cambios === 'object') {
    return Object.entries(d.cambios as Record<string, { antes: unknown; despues: unknown }>)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.antes ?? '—'} → ${v.despues ?? '—'}`).join(' · ') || null;
  }
  if (d.codigo) return `Código ${d.codigo}${d.motivo ? ` · ${d.motivo}` : ''}`;
  if (d.etiqueta) return `Etiqueta ${d.etiqueta}`;
  if (d.nombre && d.factor) return `${d.nombre} c/${d.factor}`;
  return null;
}
