'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, ImageUp, MapPinPlus } from 'lucide-react';
import { agregarUbicacionAccion, cambiarUbicacionAccion, guardarConfiguracionAccion, importarSihoAccion, subirLogoAccion } from '@/app/(sistema)/acciones';
import { useAccion } from '../useAccion';
import { Aviso, Insignia } from '../ui';

export function FormInstitucion({ inicial }: { inicial: { nombre_institucion: string; nombre_sistema: string; siglas: string; escaneo_ventana_duplicado_ms: number; escaneo_sonido: boolean } }) {
  const router = useRouter();
  const [d, setD] = useState(inicial);
  const { pendiente, estado, ejecutar } = useAccion();
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => guardarConfiguracionAccion(d), () => router.refresh()); }}>
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      <div><label htmlFor="c-inst" className="etiqueta-campo">Nombre de la institución</label><input id="c-inst" className="campo" value={d.nombre_institucion} onChange={(e) => setD({ ...d, nombre_institucion: e.target.value })} /></div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div><label htmlFor="c-sis" className="etiqueta-campo">Nombre del sistema</label><input id="c-sis" className="campo" value={d.nombre_sistema} onChange={(e) => setD({ ...d, nombre_sistema: e.target.value })} /></div>
        <div><label htmlFor="c-sig" className="etiqueta-campo">Siglas</label><input id="c-sig" className="campo" value={d.siglas} onChange={(e) => setD({ ...d, siglas: e.target.value })} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="c-ven" className="etiqueta-campo">Ignorar lectura repetida durante (ms)</label>
          <input id="c-ven" type="number" min={0} max={10000} step={100} className="campo font-mono" value={d.escaneo_ventana_duplicado_ms} onChange={(e) => setD({ ...d, escaneo_ventana_duplicado_ms: Number(e.target.value) })} />
          <p className="mt-1 text-[12px] text-tenue">1,500 ms evita el doble disparo sin estorbar al escanear piezas seguidas.</p></div>
        <label className="flex items-start gap-2 self-start rounded-md border border-linea px-3 py-2.5 text-[14px] sm:mt-6">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-clinico" checked={d.escaneo_sonido} onChange={(e) => setD({ ...d, escaneo_sonido: e.target.checked })} />
          <span>Sonido de confirmación activado por omisión<span className="block text-[12px] text-tenue">Cada equipo puede silenciarlo.</span></span>
        </label>
      </div>
      <div className="flex justify-end"><button className="btn-primario" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar'}</button></div>
    </form>
  );
}

export function FormLogo({ tieneLogo, version }: { tieneLogo: boolean; version: string }) {
  const router = useRouter();
  const { pendiente, estado, ejecutar } = useAccion();
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); ejecutar(() => subirLogoAccion(f), () => router.refresh()); }}>
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-md border border-linea bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {tieneLogo ? <img src={`/api/logo?v=${encodeURIComponent(version)}`} alt="Logotipo actual" className="max-h-full max-w-full object-contain" /> : <span className="text-[12px] text-tenue">Sin logo</span>}
        </div>
        <div className="flex flex-col gap-2">
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-[13px] file:mr-3 file:rounded-md file:border file:border-linea file:bg-white file:px-3 file:py-1.5 file:text-[13px]" aria-label="Archivo de logotipo" />
          <p className="text-[12px] text-tenue">PNG, JPG o WebP, máximo 300 KB. Fondo transparente o blanco.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-secundario" disabled={pendiente}><ImageUp size={16} aria-hidden />Subir logotipo</button>
        {tieneLogo && <button type="button" className="btn-fantasma" disabled={pendiente} onClick={() => ejecutar(() => subirLogoAccion(new FormData()), () => router.refresh())}>Quitar</button>}
      </div>
    </form>
  );
}

export function ImportarSiho({ productos, puede }: { productos: number; puede: boolean }) {
  const router = useRouter();
  const { pendiente, estado, ejecutar } = useAccion();
  const [resumen, setResumen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-tenue">Corte del reporte <em>Existencias</em> del SIHO del 15/10/2026: 826 productos únicos (404 registros de Urgencias y 686 de la Farmacia Hospitalaria). Importa clave, descripción, unidad mínima, contenido por caja, costo, localización y grupo terapéutico (archivo de grupos de la farmacia; solo llena los productos que no lo tengan). <strong className="text-tinta">No carga existencias</strong>: el inventario inicial saldrá del conteo físico.</p>
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      {resumen && <Aviso tono="exito">{resumen}</Aviso>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primario" disabled={!puede || pendiente} onClick={() => ejecutar(() => importarSihoAccion(), (r) => {
          setResumen(`Listo: ${r.productosNuevos} productos nuevos, ${r.productosExistentes} ya existían, ${r.presentacionesNuevas} presentaciones nuevas, ${r.ubicacionesActualizadas} localizaciones actualizadas, ${r.gruposAsignados} grupos terapéuticos asignados.`);
          router.refresh();
        })}><Database size={16} aria-hidden />{pendiente ? 'Importando…' : productos ? 'Volver a importar (solo agrega lo que falte)' : 'Importar catálogo del SIHO'}</button>
        <span className="text-[13px] text-tenue">Productos en el catálogo: <span className="font-mono text-tinta">{productos.toLocaleString('es-MX')}</span></span>
      </div>
    </div>
  );
}

interface Ubic { id: number; area_id: number; codigo: string; nombre: string; tipo: string; activa: boolean; permite_surtido: boolean }
const TIPOS: Record<string, string> = { anaquel: 'Anaquel', refrigerador: 'Refrigerador', gaveta_controlados: 'Gaveta de controlados', carro_rojo: 'Carro rojo', almacen: 'Almacén', cuarentena: 'Cuarentena', otro: 'Otro', transito: 'Tránsito' };

export function Ubicaciones({ areas, ubicaciones }: { areas: { id: number; nombre: string }[]; ubicaciones: Ubic[] }) {
  const router = useRouter();
  const { pendiente, estado, ejecutar } = useAccion();
  const [n, setN] = useState({ area: String(areas[0]?.id ?? ''), codigo: '', nombre: '', tipo: 'anaquel' });
  return (
    <div className="flex flex-col gap-4">
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      <div className="grid gap-4 lg:grid-cols-2">
        {areas.map((a) => (
          <div key={a.id} className="rounded-md border border-linea">
            <p className="border-b border-linea px-3 py-2 font-titulo text-[15px] font-semibold text-marino">{a.nombre}</p>
            <ul className="max-h-72 divide-y divide-linea overflow-y-auto">
              {ubicaciones.filter((u) => u.area_id === a.id).map((u) => (
                <li key={u.id} className={`flex items-center gap-2 px-3 py-2 text-[14px] ${u.activa ? '' : 'opacity-50'}`}>
                  <span className="w-28 shrink-0 truncate font-mono text-[13px]">{u.codigo}</span>
                  <span className="min-w-0 flex-1 truncate">{u.nombre}</span>
                  <Insignia tono={u.tipo === 'cuarentena' ? 'alerta' : u.tipo === 'refrigerador' ? 'frio' : u.tipo === 'gaveta_controlados' ? 'peligro' : 'neutro'}>{TIPOS[u.tipo]}</Insignia>
                  <button className="btn-fantasma btn-chico" disabled={pendiente} onClick={() => ejecutar(() => cambiarUbicacionAccion(u.id, !u.activa), () => router.refresh())}>{u.activa ? 'Desactivar' : 'Activar'}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.6fr_1.2fr_auto]" onSubmit={(e) => {
        e.preventDefault();
        ejecutar(() => agregarUbicacionAccion(Number(n.area), n.codigo, n.nombre, n.tipo), () => { setN({ ...n, codigo: '', nombre: '' }); router.refresh(); });
      }}>
        <select className="campo" aria-label="Área" value={n.area} onChange={(e) => setN({ ...n, area: e.target.value })}>{areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
        <input className="campo font-mono" aria-label="Código" placeholder="A3, REF-1…" value={n.codigo} onChange={(e) => setN({ ...n, codigo: e.target.value.toUpperCase() })} required />
        <input className="campo" aria-label="Nombre" placeholder="Anaquel A, nivel 3" value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} required />
        <select className="campo" aria-label="Tipo" value={n.tipo} onChange={(e) => setN({ ...n, tipo: e.target.value })}>{Object.entries(TIPOS).filter(([k]) => k !== 'transito').map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <button className="btn-secundario" disabled={pendiente}><MapPinPlus size={16} aria-hidden />Agregar</button>
      </form>
    </div>
  );
}
