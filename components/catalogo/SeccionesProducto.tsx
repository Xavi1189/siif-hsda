'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Link2, Plus, Unlink } from 'lucide-react';
import {
  agregarPresentacionAccion, desactivarCodigoAccion, desactivarPresentacionAccion, etiquetaAccion, parametrosAccion,
  verificarCodigoAccion, vincular,
} from '@/app/(sistema)/acciones';
import type { ProductoDetalle } from '@/lib/catalogo';
import { fechaHora } from '@/lib/formato';
import { useAccion } from '../useAccion';
import { Aviso, EtiquetaProducto, Insignia } from '../ui';

type P = ProductoDetalle;

// --------------------------------------------------------------------------
export function Presentaciones({ id, unidad, presentaciones, editable }: { id: number; unidad: string; presentaciones: P['presentaciones']; editable: boolean }) {
  const router = useRouter();
  const { pendiente, estado, ejecutar } = useAccion();
  const [nombre, setNombre] = useState('CAJA');
  const [factor, setFactor] = useState('');
  return (
    <div className="flex flex-col gap-3">
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      <table className="tabla">
        <thead><tr><th>Presentación</th><th className="num">Equivale a</th><th /></tr></thead>
        <tbody>
          {presentaciones.map((p) => (
            <tr key={p.id} className={p.activa ? '' : 'opacity-50'}>
              <td>{p.nombre}{p.factor === 1 && <span className="ml-2"><Insignia tono="info">Unidad mínima</Insignia></span>}{!p.activa && <span className="ml-2 text-[12px] text-tenue">inactiva</span>}</td>
              <td className="num font-mono">{p.factor.toLocaleString('es-MX')} {unidad.toLowerCase()}</td>
              <td className="text-right">{editable && p.factor > 1 && p.activa && (
                <button className="btn-fantasma btn-chico" disabled={pendiente} onClick={() => ejecutar(() => desactivarPresentacionAccion(id, p.id), () => router.refresh())}>Desactivar</button>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); ejecutar(() => agregarPresentacionAccion(id, nombre, Number(factor)), () => { setFactor(''); router.refresh(); }); }}>
          <div className="w-36"><label htmlFor="pres-n" className="etiqueta-campo">Presentación</label><input id="pres-n" className="campo" value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} /></div>
          <div className="w-36"><label htmlFor="pres-f" className="etiqueta-campo">Contiene ({unidad.toLowerCase()})</label><input id="pres-f" className="campo" type="number" min={2} step={1} inputMode="numeric" value={factor} onChange={(e) => setFactor(e.target.value)} required /></div>
          <button className="btn-secundario" disabled={pendiente}><Plus size={16} aria-hidden />Agregar</button>
        </form>
      )}
      <p className="text-[12px] text-tenue">Todo el inventario se guarda en {unidad.toLowerCase()}. El factor convierte cajas o frascos a unidades al recibir, contar o surtir.</p>
    </div>
  );
}

// --------------------------------------------------------------------------
export function Codigos({ id, codigos, presentaciones, puedeVincular, puedeVerificar }: {
  id: number; codigos: P['codigos']; presentaciones: P['presentaciones']; puedeVincular: 'directo' | 'propuesta' | null; puedeVerificar: boolean;
}) {
  const router = useRouter();
  const { pendiente, estado, setEstado, ejecutar } = useAccion();
  const activas = presentaciones.filter((p) => p.activa);
  const [codigo, setCodigo] = useState('');
  const [pres, setPres] = useState(String(activas.find((p) => p.factor > 1)?.id ?? activas[0]?.id ?? ''));
  const [motivo, setMotivo] = useState<{ id: number; texto: string } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      {codigos.length ? (
        <div className="overflow-x-auto">
          <table className="tabla min-w-[560px]">
            <thead><tr><th>Código</th><th>Presentación</th><th>Estado</th><th>Registro</th><th /></tr></thead>
            <tbody>
              {codigos.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-[13px]">{c.codigo}<span className="block font-sans text-[11px] text-tenue">{c.tipo === 'GTIN' ? 'GTIN / EAN' : 'Interno'}</span></td>
                  <td className="text-[13px]">{c.presentacion.toLowerCase()}{c.factor > 1 && ` c/${c.factor}`}</td>
                  <td>{c.verificado ? <Insignia tono="exito" icono={<BadgeCheck size={12} aria-hidden />}>Verificado</Insignia> : <Insignia tono="alerta">Por verificar</Insignia>}</td>
                  <td className="text-[12px] text-tenue">{c.creado_por ?? '—'}<br />{fechaHora(c.creado)}</td>
                  <td className="whitespace-nowrap text-right">
                    {puedeVerificar && !c.verificado && <button className="btn-secundario btn-chico mr-1" disabled={pendiente} onClick={() => ejecutar(() => verificarCodigoAccion(id, c.id), () => router.refresh())}>Verificar</button>}
                    {puedeVerificar && <button className="btn-fantasma btn-chico" disabled={pendiente} onClick={() => setMotivo({ id: c.id, texto: '' })}><Unlink size={14} aria-hidden />Desvincular</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-[14px] text-tenue">Este producto aún no tiene códigos de barras.</p>}

      {motivo && (
        <form className="flex flex-wrap items-end gap-2 rounded-md border border-alerta/30 bg-alerta-claro p-3"
          onSubmit={(e) => { e.preventDefault(); ejecutar(() => desactivarCodigoAccion(id, motivo.id, motivo.texto), () => { setMotivo(null); router.refresh(); }); }}>
          <div className="min-w-[240px] flex-1"><label htmlFor="motivo" className="etiqueta-campo">Motivo para desvincular (queda en la bitácora)</label>
            <input id="motivo" autoFocus className="campo" value={motivo.texto} onChange={(e) => setMotivo({ ...motivo, texto: e.target.value })} placeholder="Ej.: código ligado a la presentación equivocada" /></div>
          <button className="btn-peligro" disabled={pendiente}>Desvincular</button>
          <button type="button" className="btn-fantasma" onClick={() => setMotivo(null)}>Cancelar</button>
        </form>
      )}

      {puedeVincular && (
        <form className="flex flex-wrap items-end gap-2 border-t border-linea pt-3" onSubmit={(e) => {
          e.preventDefault();
          if (!codigo.trim()) return;
          setEstado(null);
          ejecutar(() => vincular(codigo, id, Number(pres)), () => { setCodigo(''); router.refresh(); });
        }}>
          <div className="min-w-[220px] flex-1">
            <label htmlFor="nuevo-codigo" className="etiqueta-campo">Vincular código (escanéalo aquí o escríbelo)</label>
            <input id="nuevo-codigo" data-escaner="propio" className="campo font-mono" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="7501234567893" autoComplete="off" spellCheck={false} />
          </div>
          <div className="w-44">
            <label htmlFor="cod-pres" className="etiqueta-campo">Identifica a</label>
            <select id="cod-pres" className="campo" value={pres} onChange={(e) => setPres(e.target.value)}>
              {activas.map((p) => <option key={p.id} value={p.id}>{p.nombre.toLowerCase()}{p.factor > 1 ? ` c/${p.factor}` : ' (unidad)'}</option>)}
            </select>
          </div>
          <button className="btn-secundario" disabled={pendiente}><Link2 size={16} aria-hidden />Vincular</button>
          {puedeVincular === 'propuesta' && <p className="w-full text-[12px] text-tenue">Tu vínculo quedará como propuesta hasta que un encargado lo verifique.</p>}
        </form>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
export function Etiquetas({ id, etiquetas, editable }: { id: number; etiquetas: P['etiquetas']; editable: boolean }) {
  const router = useRouter();
  const { pendiente, estado, setEstado, ejecutar } = useAccion();
  const [marcadas, setMarcadas] = useState<Record<number, boolean>>(() => Object.fromEntries(etiquetas.map((e) => [e.id, e.asignada])));
  const cambiar = (eid: number, v: boolean) => {
    setMarcadas((m) => ({ ...m, [eid]: v }));
    setEstado(null);
    ejecutar(async () => {
      const r = await etiquetaAccion(id, eid, v);
      if (!r.ok) setMarcadas((m) => ({ ...m, [eid]: !v }));
      return r;
    }, () => router.refresh());
  };
  return (
    <div className="flex flex-col gap-3">
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {etiquetas.map((e) => (
          <li key={e.id}>
            <label className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${marcadas[e.id] ? 'border-clinico/40 bg-clinico-claro/50' : 'border-linea'} ${editable ? 'cursor-pointer' : ''}`}>
              <input type="checkbox" className="mt-1 h-4 w-4 accent-clinico" checked={!!marcadas[e.id]} disabled={!editable || pendiente}
                onChange={(ev) => cambiar(e.id, ev.target.checked)} />
              <span className="min-w-0"><EtiquetaProducto e={e} />{e.advertencia && <span className="mt-1 block text-[12px] text-tenue">{e.advertencia}</span>}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------------
export function ParametrosArea({ id, unidad, p, ubicaciones, editable }: { id: number; unidad: string; p: P['parametros'][0]; ubicaciones: P['ubicaciones']; editable: boolean }) {
  const router = useRouter();
  const { pendiente, estado, ejecutar } = useAccion();
  const [d, setD] = useState({
    maneja_en_area: p.maneja_en_area, ubicacion_predeterminada: p.ubicacion_predeterminada ?? '',
    minimo: p.minimo ?? '', maximo: p.maximo ?? '', punto_reorden: p.punto_reorden ?? '', stock_seguridad: p.stock_seguridad ?? '', tiempo_entrega_dias: p.tiempo_entrega_dias ?? '',
  });
  const n = (k: keyof typeof d, rotulo: string) => (
    <div>
      <label htmlFor={`${p.area}-${k}`} className="etiqueta-campo">{rotulo}</label>
      <input id={`${p.area}-${k}`} type="number" min={0} step={1} inputMode="numeric" className={`campo font-mono ${estado?.campos?.[k] ? 'campo-error' : ''}`}
        value={String(d[k])} onChange={(e) => setD({ ...d, [k]: e.target.value })} disabled={!editable || pendiente || !d.maneja_en_area} />
      {estado?.campos?.[k] && <p className="mt-1 text-[12px] text-peligro">{estado.campos[k]}</p>}
    </div>
  );
  return (
    <form className="flex flex-col gap-3 rounded-md border border-linea p-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => parametrosAccion(id, p.area_id, d), () => router.refresh()); }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-titulo text-[16px] font-semibold text-marino">{p.area_nombre}</p>
        <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-clinico" checked={d.maneja_en_area} disabled={!editable || pendiente} onChange={(e) => setD({ ...d, maneja_en_area: e.target.checked })} />Se maneja en esta área</label>
      </div>
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      <p className="text-[13px] text-tenue">Localización en el SIHO: <span className="font-medium text-tinta">{p.ubicacion_siho ?? 'sin dato'}</span></p>
      <div>
        <label htmlFor={`${p.area}-ubic`} className="etiqueta-campo">Ubicación en SIIF</label>
        <select id={`${p.area}-ubic`} className="campo" value={String(d.ubicacion_predeterminada)} disabled={!editable || pendiente || !d.maneja_en_area}
          onChange={(e) => setD({ ...d, ubicacion_predeterminada: e.target.value })}>
          <option value="">Sin asignar</option>
          {ubicaciones.filter((u) => u.area_id === p.area_id).map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {n('minimo', `Mínimo (${unidad.toLowerCase()})`)}{n('maximo', 'Máximo')}{n('punto_reorden', 'Punto de reorden')}
        {n('stock_seguridad', 'Stock de seguridad')}{n('tiempo_entrega_dias', 'Entrega (días)')}
      </div>
      {editable && <div className="flex justify-end"><button className="btn-secundario btn-chico" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar parámetros'}</button></div>}
    </form>
  );
}
