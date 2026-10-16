import Link from 'next/link';
import { ChevronLeft, ChevronRight, PackageSearch, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/servidor';
import { buscarProductos } from '@/lib/catalogo';
import { tienePermiso } from '@/lib/permisos';
import { mxn, num } from '@/lib/formato';
import { Controlado, Encabezado, EtiquetaProducto, Insignia, Vacio } from '@/components/ui';

export const metadata = { title: 'Catálogo' };

const TIPOS: Record<string, string> = { medicamento: 'Medicamento', dispositivo_medico: 'Dispositivo médico', insumo: 'Insumo' };

export default async function Catalogo({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario('catalogo.ver');
  const sp = await searchParams;
  const c = await db();
  const r = await buscarProductos(c, {
    q: sp.q, tipo: sp.tipo, estatus: sp.estatus, etiqueta: sp.etiqueta, area: sp.area,
    sinCodigo: sp.sin_codigo === '1', controlado: sp.controlado === '1', pagina: Number(sp.pagina) || 1,
  });
  const etiquetas = (await c.query<{ codigo: string; nombre: string }>('SELECT codigo, nombre FROM etiquetas WHERE activa ORDER BY id')).rows;
  const filtros = { ...sp };
  const enlace = (pagina: number) => '/catalogo?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) as Record<string, string>, pagina: String(pagina) });

  return (
    <>
      <Encabezado titulo="Catálogo" descripcion="Medicamentos, dispositivos médicos e insumos de ambas farmacias. Busca por clave, nombre, laboratorio, código de barras o localización del SIHO."
        acciones={tienePermiso(u.rol, 'catalogo.editar') && <Link href="/catalogo/nuevo" className="btn-primario"><Plus size={16} aria-hidden />Nuevo producto</Link>} />

      <form className="tarjeta mb-4 flex flex-wrap items-center gap-3 p-3" method="get">
        <div className="min-w-[240px] flex-[2_1_280px]">
          <label htmlFor="q" className="sr-only">Buscar</label>
          <input id="q" name="q" defaultValue={sp.q} className="campo" placeholder="Clave, nombre, laboratorio, código o ubicación" />
        </div>
        <Seleccion nombre="area" valor={sp.area} rotulo="Área" opciones={[['', 'Ambas farmacias'], ['HOSP', 'Hospitalaria'], ['URG', 'Urgencias']]} />
        <Seleccion nombre="tipo" valor={sp.tipo} rotulo="Tipo" opciones={[['', 'Todos los tipos'], ...Object.entries(TIPOS)]} />
        <Seleccion nombre="etiqueta" valor={sp.etiqueta} rotulo="Etiqueta" opciones={[['', 'Cualquier etiqueta'], ...etiquetas.map((e) => [e.codigo, e.nombre] as [string, string])]} />
        <Seleccion nombre="estatus" valor={sp.estatus} rotulo="Estatus" opciones={[['', 'Cualquier estatus'], ['activo', 'Activo'], ['inactivo', 'Inactivo'], ['descontinuado', 'Descontinuado']]} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[13px] text-tenue"><input type="checkbox" name="sin_codigo" value="1" defaultChecked={sp.sin_codigo === '1'} className="h-4 w-4 accent-clinico" />Sin código</label>
          <label className="flex items-center gap-1.5 text-[13px] text-tenue"><input type="checkbox" name="controlado" value="1" defaultChecked={sp.controlado === '1'} className="h-4 w-4 accent-clinico" />Controlados</label>
          <button className="btn-secundario">Filtrar</button>
        </div>
      </form>

      <div className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-2.5 text-[13px] text-tenue">
          <span><span className="font-semibold text-tinta">{num(r.total)}</span> productos{Object.values(sp).some(Boolean) && <> · <Link href="/catalogo" className="text-clinico hover:underline">Quitar filtros</Link></>}</span>
          <span>Página {r.pagina} de {r.paginas}</span>
        </div>
        {r.filas.length === 0 ? (
          <Vacio icono={<PackageSearch size={36} />} titulo={r.total === 0 && !Object.values(sp).some(Boolean) ? 'El catálogo está vacío' : 'Ningún producto coincide'}>
            {r.total === 0 && !Object.values(sp).some(Boolean)
              ? <>Importa las claves del SIHO desde <Link href="/configuracion#catalogo" className="text-clinico underline">Configuración</Link> o da de alta un producto.</>
              : 'Prueba con menos palabras o quita algún filtro.'}
          </Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[640px]">
              <thead><tr><th className="w-[1%]">Clave</th><th>Descripción</th><th className="w-[22%]">Ubicación SIHO</th><th className="num w-[1%] whitespace-nowrap">Costo</th><th className="w-[1%] whitespace-nowrap">Códigos</th></tr></thead>
              <tbody>
                {r.filas.map((p) => (
                  <tr key={p.id} className="relative">
                    <td className="whitespace-nowrap font-mono text-[13px]"><Link href={`/catalogo/${p.id}`} className="text-clinico after:absolute after:inset-0 hover:underline">{p.clave}</Link></td>
                    <td>
                      <span className="font-medium">{p.descripcion}</span>
                      <span className="block text-[13px] text-tenue">{p.unidad_minima.toLowerCase()}{p.factor ? <> · {p.presentacion?.toLowerCase()} c/{p.factor}</> : null}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {p.estatus !== 'activo' && <Insignia tono="neutro">{p.estatus === 'inactivo' ? 'Inactivo' : 'Descontinuado'}</Insignia>}
                        {p.tipo !== 'medicamento' && <Insignia tono="info">{TIPOS[p.tipo]}</Insignia>}
                        {p.controlado && <Controlado grupo={p.grupo_controlado} />}
                        {p.etiquetas.map((e) => <EtiquetaProducto key={e.codigo} e={e} />)}
                      </span>
                    </td>
                    <td className="text-[13px] text-tenue">{p.ubicaciones.map((x) => <span key={x.area} className="block"><span className="font-mono text-[11px] text-marino-300">{x.area}</span> {x.ubicacion ?? '—'}</span>)}</td>
                    <td className="num whitespace-nowrap font-mono text-[13px]">{mxn(p.costo_unitario)}</td>
                    <td className="whitespace-nowrap text-[13px]">
                      {p.codigos ? <span>{p.codigos}{p.codigos_sin_verificar ? <span className="ml-1"><Insignia tono="alerta">{p.codigos_sin_verificar} por verificar</Insignia></span> : null}</span> : <span className="text-tenue">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r.paginas > 1 && (
          <nav className="flex items-center justify-end gap-2 border-t border-linea px-4 py-2.5" aria-label="Paginación">
            {r.pagina > 1 ? <Link className="btn-secundario btn-chico" href={enlace(r.pagina - 1)}><ChevronLeft size={14} aria-hidden />Anterior</Link> : <span className="btn-secundario btn-chico opacity-40">Anterior</span>}
            {r.pagina < r.paginas ? <Link className="btn-secundario btn-chico" href={enlace(r.pagina + 1)}>Siguiente<ChevronRight size={14} aria-hidden /></Link> : <span className="btn-secundario btn-chico opacity-40">Siguiente</span>}
          </nav>
        )}
      </div>
    </>
  );
}

function Seleccion({ nombre, valor, rotulo, opciones }: { nombre: string; valor?: string; rotulo: string; opciones: [string, string][] }) {
  return (
    <div className="min-w-[170px] flex-[1_1_170px]">
      <label htmlFor={nombre} className="sr-only">{rotulo}</label>
      <select id={nombre} name={nombre} defaultValue={valor ?? ''} className="campo">
        {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
}
