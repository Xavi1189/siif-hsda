'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { guardarProductoAccion } from '@/app/(sistema)/acciones';
import { useAccion } from '../useAccion';
import { Aviso } from '../ui';

/** Unidades dispensables más comunes; se puede escribir otra. */
const UNIDADES = ['TABLETA', 'CÁPSULA', 'GRAGEA', 'COMPRIMIDO', 'AMPULA', 'FRASCO ÁMPULA', 'JERINGA PRELLENADA', 'FRASCO', 'BOLSA', 'SOBRE',
  'SUPOSITORIO', 'ÓVULO', 'PARCHE', 'TUBO', 'INHALADOR', 'PLUMA PRECARGADA', 'CARTUCHO', 'BOTELLA', 'LATA', 'PIEZA'];

export type DatosFormulario = Record<string, string | boolean | null>;

const VACIO: DatosFormulario = {
  clave: '', tipo: 'medicamento', descripcion: '', nombre_generico: '', nombre_comercial: '', concentracion: '', forma_farmaceutica: '',
  presentacion: '', unidad_minima: '', laboratorio: '', registro_sanitario: '', grupo_terapeutico: '',
  cuadro_basico: false, costo_unitario: '0', requiere_lote: true, requiere_caducidad: true, estatus: 'activo',
};

export function FormularioProducto({ id, inicial, editable }: { id: number | null; inicial?: DatosFormulario; editable: boolean }) {
  const router = useRouter();
  const [d, setD] = useState<DatosFormulario>({ ...VACIO, ...inicial });
  const { pendiente, estado, ejecutar } = useAccion();
  const err = (k: string) => estado?.campos?.[k];
  const set = (k: string, v: string | boolean | null) => setD((x) => ({ ...x, [k]: v }));
  const txt = (k: string, rotulo: string, { className: envoltura, ...props }: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={envoltura}>
      <label htmlFor={`p-${k}`} className="etiqueta-campo">{rotulo}</label>
      <input id={`p-${k}`} value={String(d[k] ?? '')} onChange={(e) => set(k, e.target.value)} disabled={!editable}
        className={`campo ${err(k) ? 'campo-error' : ''}`} aria-invalid={!!err(k)} {...props} />
      {err(k) && <p className="mt-1 text-[12px] text-peligro">{err(k)}</p>}
    </div>
  );

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutar(() => guardarProductoAccion(id, d), (nuevo) => {
      if (id == null) router.push(`/catalogo/${nuevo}`); else router.refresh();
    });
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" disabled={!editable || pendiente}>
        <legend className="rotulo mb-2">Identificación</legend>
        {txt('clave', 'Clave interna (SIHO)', { required: true, className: 'lg:col-span-1', spellCheck: false })}
        <div>
          <label htmlFor="p-tipo" className="etiqueta-campo">Tipo</label>
          <select id="p-tipo" className="campo" value={String(d.tipo)} onChange={(e) => set('tipo', e.target.value)}>
            <option value="medicamento">Medicamento</option><option value="dispositivo_medico">Dispositivo médico</option><option value="insumo">Insumo</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-estatus" className="etiqueta-campo">Estatus</label>
          <select id="p-estatus" className="campo" value={String(d.estatus)} onChange={(e) => set('estatus', e.target.value)}>
            <option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="descontinuado">Descontinuado</option>
          </select>
        </div>
        {txt('costo_unitario', 'Costo por unidad mínima (MXN)', { type: 'number', min: 0, step: '0.0001', inputMode: 'decimal' })}
        {txt('descripcion', 'Descripción', { required: true, className: 'sm:col-span-2 lg:col-span-4' })}
        {txt('nombre_generico', 'Nombre genérico', { className: 'sm:col-span-1 lg:col-span-2' })}
        {txt('nombre_comercial', 'Nombre comercial', { className: 'sm:col-span-1 lg:col-span-2' })}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" disabled={!editable || pendiente}>
        <legend className="rotulo mb-2">Presentación y unidad</legend>
        {txt('concentracion', 'Concentración')}
        {txt('forma_farmaceutica', 'Forma farmacéutica')}
        {txt('presentacion', 'Presentación comercial')}
        {txt('unidad_minima', 'Unidad mínima dispensable', { required: true, placeholder: 'Elige o escribe', list: 'unidades-minimas' })}
        <datalist id="unidades-minimas">
          {UNIDADES.map((u) => <option key={u} value={u} />)}
        </datalist>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" disabled={!editable || pendiente}>
        <legend className="rotulo mb-2">Origen y cuadro básico</legend>
        {txt('laboratorio', 'Laboratorio / fabricante')}
        {txt('registro_sanitario', 'Registro sanitario')}
        {txt('grupo_terapeutico', 'Grupo terapéutico')}
        <label className="flex items-start gap-2 rounded-md border border-linea px-3 py-2.5 text-[14px]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-clinico" checked={!!d.cuadro_basico} onChange={(e) => set('cuadro_basico', e.target.checked)} />
          <span>Cuadro básico<span className="block text-[12px] text-tenue">Pertenece al cuadro básico de medicamentos.</span></span>
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" disabled={!editable || pendiente}>
        <legend className="rotulo mb-2">Control</legend>
        <label className="flex items-start gap-2 rounded-md border border-linea px-3 py-2.5 text-[14px]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-clinico" checked={!!d.requiere_lote} onChange={(e) => set('requiere_lote', e.target.checked)} />
          <span>Requiere lote<span className="block text-[12px] text-tenue">Se exige al recibir y surtir.</span></span>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-linea px-3 py-2.5 text-[14px]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-clinico" checked={!!d.requiere_caducidad} onChange={(e) => set('requiere_caducidad', e.target.checked)} />
          <span>Requiere caducidad<span className="block text-[12px] text-tenue">Desmárcalo solo en insumos sin caducidad.</span></span>
        </label>
      </fieldset>

      {editable && (
        <div className="flex justify-end border-t border-linea pt-4">
          <button className="btn-primario" disabled={pendiente}><Save size={16} aria-hidden />{pendiente ? 'Guardando…' : id == null ? 'Crear producto' : 'Guardar cambios'}</button>
        </div>
      )}
    </form>
  );
}
