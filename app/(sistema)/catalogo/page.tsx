import Link from 'next/link';
import {
  Activity, Apple, Baby, Bone, Brain, BrainCircuit, Bug, CalendarHeart, ChevronDown, ChevronLeft, ChevronRight, Droplet, Droplets, Ear, Eye,
  FlaskRound, Hand, HeartPulse, Package, PackageSearch, Pill, Plus, Ribbon, ScanBarcode, Search, ShieldAlert, ShieldPlus, Smile,
  Stethoscope, Syringe, Utensils, Wind, BadgeCheck, Bean, type LucideIcon,
} from 'lucide-react';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/servidor';
import { buscarProductos } from '@/lib/catalogo';
import { tienePermiso } from '@/lib/permisos';
import { mxn, num } from '@/lib/formato';
import { Controlado, Encabezado, EtiquetaProducto, Insignia, Kpi, Vacio } from '@/components/ui';

export const metadata = { title: 'Catálogo' };

const ICONO_GRUPO: Record<string, LucideIcon> = {
  'Analgesia': Pill, 'Anestesia': Syringe, 'Cardiología': HeartPulse, 'Dermatología': Hand, 'Endocrinología y Metabolismo': Activity,
  'Enfermedades Infecciosas y Parasitarias': Bug, 'Enfermedades Inmunoalérgicas': ShieldPlus, 'Estomatología (uso bucal)': Smile,
  'Gastroenterología': Utensils, 'Gineco-Obstetricia': Baby, 'Hematología': Droplets, 'Intoxicaciones': FlaskRound, 'Nefrología y Urología': Bean,
  'Neumología': Wind, 'Neurología': Brain, 'Nutriología': Apple, 'Oftalmología': Eye, 'Oncología': Ribbon, 'Otorrinolaringología': Ear,
  'Planificación Familiar': CalendarHeart, 'Psiquiatría': BrainCircuit, 'Reumatología y Traumatología': Bone,
  'Soluciones Electrolíticas y Sustitutos del Plasma': Droplet, 'Vacunas, Toxoides, Inmunoglobulinas, Antitoxinas': Syringe,
};

const TIPOS: Record<string, string> = { medicamento: 'Medicamento', dispositivo_medico: 'Dispositivo médico', insumo: 'Insumo' };

export default async function Catalogo({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario('catalogo.ver');
  const sp = await searchParams;
  const c = await db();
  const r = await buscarProductos(c, {
    q: sp.q, grupo: sp.grupo, tipo: sp.tipo, estatus: sp.estatus, etiqueta: sp.etiqueta, area: sp.area,
    sinCodigo: sp.sin_codigo === '1', controlado: sp.controlado === '1', cuadroBasico: sp.cuadro_basico === '1', antibiotico: sp.antibiotico === '1', pagina: Number(sp.pagina) || 1,
  });
  const etiquetas = (await c.query<{ codigo: string; nombre: string }>('SELECT codigo, nombre FROM etiquetas WHERE activa ORDER BY id')).rows;
  const porGrupo = (await c.query<{ g: string; n: number }>(
    `SELECT grupo_terapeutico g, count(*)::int n FROM productos WHERE grupo_terapeutico IS NOT NULL AND estatus = 'activo' GROUP BY 1 ORDER BY 2 DESC, 1`)).rows;
  const grupos = [...porGrupo].map((x) => x.g).sort((a, b) => a.localeCompare(b, 'es'));
  const k = (await c.query<{ total: number; controlados: number; sin_codigo: number; cuadro: number; antibioticos: number }>(
    `SELECT count(*)::int total, count(*) FILTER (WHERE controlado)::int controlados, count(*) FILTER (WHERE cuadro_basico)::int cuadro,
            count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM codigos_barras cb WHERE cb.producto_id = p.id AND cb.activo))::int sin_codigo,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM producto_etiquetas pe JOIN etiquetas e ON e.id = pe.etiqueta_id WHERE pe.producto_id = p.id AND e.codigo = 'ANTIBIOTICO'))::int antibioticos
       FROM productos p WHERE estatus = 'activo'`)).rows[0];
  const filtros = { ...sp };
  // Enlace a un grupo terapéutico conservando los demás filtros; tocar el grupo activo lo quita
  const enlaceGrupo = (g: string) => {
    const q = Object.fromEntries(Object.entries(filtros).filter(([key, v]) => v && key !== 'pagina' && key !== 'grupo')) as Record<string, string>;
    if (sp.grupo !== g) q.grupo = g;
    return '/catalogo' + (Object.keys(q).length ? '?' + new URLSearchParams(q) : '') + '#productos';
  };
  const VISIBLES = 8;
  const activoOculto = porGrupo.findIndex((x) => x.g === sp.grupo) >= VISIBLES;
  const enlace = (pagina: number) => '/catalogo?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) as Record<string, string>, pagina: String(pagina) });

  return (
    <>
      <Encabezado titulo="Catálogo" descripcion="Medicamentos, dispositivos médicos e insumos de ambas farmacias. Busca por clave, nombre, laboratorio, código de barras o localización del SIHO."
        acciones={tienePermiso(u.rol, 'catalogo.editar') && <Link href="/catalogo/nuevo" className="btn-primario"><Plus size={16} aria-hidden />Nuevo producto</Link>} />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icono={<Package size={22} />} rotulo="Productos activos" valor={num(k.total)} href="/catalogo#productos" />
        <Kpi icono={<ShieldAlert size={22} />} tono="peligro" rotulo="Controlados" valor={num(k.controlados)} href="/catalogo?controlado=1#productos" />
        <Kpi icono={<BadgeCheck size={22} />} tono="info" rotulo="Cuadro básico" valor={num(k.cuadro)} detalle={`${num(k.antibioticos)} con etiqueta de antibiótico`} href="/catalogo?cuadro_basico=1#productos" />
        <Kpi icono={<ScanBarcode size={22} />} tono="alerta" rotulo="Sin código de barras" valor={num(k.sin_codigo)} href="/catalogo?sin_codigo=1#productos" />
      </div>

      {porGrupo.length > 0 && (
        <section aria-label="Grupos terapéuticos" className="mb-4">
          <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {porGrupo.slice(0, VISIBLES).map((x) => <TarjetaGrupo key={x.g} grupo={x.g} n={x.n} activo={sp.grupo === x.g} href={enlaceGrupo(x.g)} />)}
          </ul>
          {porGrupo.length > VISIBLES && (
            <details className="group mt-3" open={activoOculto}>
              <summary className="btn-secundario btn-chico w-fit cursor-pointer list-none">
                <ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180" />
                <span className="group-open:hidden">Ver los {porGrupo.length} grupos terapéuticos</span><span className="hidden group-open:inline">Ver menos</span>
              </summary>
              <ul className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
                {porGrupo.slice(VISIBLES).map((x) => <TarjetaGrupo key={x.g} grupo={x.g} n={x.n} activo={sp.grupo === x.g} href={enlaceGrupo(x.g)} />)}
              </ul>
            </details>
          )}
        </section>
      )}

      <div id="productos" className="tarjeta scroll-mt-28 overflow-hidden">
        <form className="flex flex-wrap items-center gap-3 border-b border-[#ECE8E1] p-4" method="get">
        <div className="min-w-[240px] flex-[2_1_280px]">
          <label htmlFor="q" className="sr-only">Buscar</label>
          <div className="relative">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tenue" />
            <input id="q" name="q" defaultValue={sp.q} className="campo rounded-full pl-10" placeholder="Clave, nombre, laboratorio, código o ubicación" />
          </div>
        </div>
        <Seleccion nombre="area" valor={sp.area} rotulo="Área" opciones={[['', 'Ambas farmacias'], ['HOSP', 'Hospitalaria'], ['URG', 'Urgencias']]} />
        <Seleccion nombre="grupo" valor={sp.grupo} rotulo="Grupo terapéutico" opciones={[['', 'Todos los grupos terapéuticos'], ...grupos.map((g) => [g, g] as [string, string])]} />
        <Seleccion nombre="tipo" valor={sp.tipo} rotulo="Tipo" opciones={[['', 'Todos los tipos'], ...Object.entries(TIPOS)]} />
        <Seleccion nombre="etiqueta" valor={sp.etiqueta} rotulo="Etiqueta" opciones={[['', 'Cualquier etiqueta'], ...etiquetas.map((e) => [e.codigo, e.nombre] as [string, string])]} />
        <Seleccion nombre="estatus" valor={sp.estatus} rotulo="Estatus" opciones={[['', 'Cualquier estatus'], ['activo', 'Activo'], ['inactivo', 'Inactivo'], ['descontinuado', 'Descontinuado']]} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[13px] text-tenue"><input type="checkbox" name="sin_codigo" value="1" defaultChecked={sp.sin_codigo === '1'} className="h-4 w-4 accent-clinico" />Sin código</label>
          <label className="flex items-center gap-1.5 text-[13px] text-tenue"><input type="checkbox" name="controlado" value="1" defaultChecked={sp.controlado === '1'} className="h-4 w-4 accent-clinico" />Controlados</label>
          <label className="flex items-center gap-1.5 text-[13px] text-tenue"><input type="checkbox" name="cuadro_basico" value="1" defaultChecked={sp.cuadro_basico === '1'} className="h-4 w-4 accent-clinico" />Cuadro básico</label>
          <label className="flex items-center gap-1.5 text-[13px] text-tenue"><input type="checkbox" name="antibiotico" value="1" defaultChecked={sp.antibiotico === '1'} className="h-4 w-4 accent-clinico" />Antibióticos</label>
          <button className="btn-primario">Filtrar</button>
        </div>
      </form>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-3 text-[13px] text-tenue">
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
          <div className="overflow-x-auto px-3 pb-2">
            <table className="tabla min-w-[640px]">
              <thead><tr><th className="w-[1%]">Clave</th><th>Descripción</th><th className="w-[22%]">Ubicación SIHO</th><th className="num w-[1%] whitespace-nowrap">Costo</th><th className="w-[1%] whitespace-nowrap">Códigos</th></tr></thead>
              <tbody>
                {r.filas.map((p) => (
                  <tr key={p.id} className="relative">
                    <td className="whitespace-nowrap font-mono text-[13px]"><Link href={`/catalogo/${p.id}`} className="text-clinico after:absolute after:inset-0 hover:underline">{p.clave}</Link></td>
                    <td>
                      <span className="font-medium">{p.descripcion}</span>
                      <span className="block text-[13px] text-tenue">{p.unidad_minima.toLowerCase()}{p.factor ? <> · {p.presentacion?.toLowerCase()} c/{p.factor}</> : null}{p.grupo_terapeutico && <> · {p.grupo_terapeutico}</>}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {p.estatus !== 'activo' && <Insignia tono="neutro">{p.estatus === 'inactivo' ? 'Inactivo' : 'Descontinuado'}</Insignia>}
                        {p.tipo !== 'medicamento' && <Insignia tono="info">{TIPOS[p.tipo]}</Insignia>}
                        {p.controlado && <Controlado grupo={p.grupo_controlado} />}
                        {p.cuadro_basico && <Insignia tono="info">Cuadro básico</Insignia>}
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
          <nav className="flex items-center justify-end gap-2 px-4 pb-4 pt-2" aria-label="Paginación">
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

function TarjetaGrupo({ grupo, n, activo, href }: { grupo: string; n: number; activo: boolean; href: string }) {
  const I = ICONO_GRUPO[grupo] ?? Stethoscope;
  return (
    <li>
      <Link href={href} aria-current={activo ? 'true' : undefined}
        className={`flex h-full items-end justify-between gap-2 rounded-2xl border px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5 transition-shadow hover:shadow-md ${activo
          ? 'border-transparent bg-gradient-to-br from-marino to-marino-600 text-white shadow-tarjeta'
          : 'border-[#ECE8E1] bg-white shadow-tarjeta'}`}>
        <span className="min-w-0">
          <span className={`block truncate text-[13px] ${activo ? 'text-marino-100' : 'text-tenue'}`} title={grupo}>{grupo}</span>
          <span className={`mt-2 block font-titulo text-[24px] sm:text-[28px] font-semibold leading-none tabular-nums ${activo ? 'text-white' : 'text-marino'}`}>{num(n)}</span>
          <span className={`mt-1 block text-[12px] ${activo ? 'text-marino-300' : 'text-tenue'}`}>{activo ? 'Filtrando · toca para quitar' : 'productos activos'}</span>
        </span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full sm:h-11 sm:w-11 ${activo ? 'bg-marino-300 text-marino' : 'bg-[#EDF1F6] text-marino'}`} aria-hidden><I size={20} /></span>
      </Link>
    </li>
  );
}
