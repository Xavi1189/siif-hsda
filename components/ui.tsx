import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Eye, FlaskConical, Info, Snowflake, Tag, TriangleAlert, ShieldAlert } from 'lucide-react';

export function Encabezado({ titulo, descripcion, acciones, migas }: { titulo: string; descripcion?: ReactNode; acciones?: ReactNode; migas?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {migas && <div className="mb-1 text-[13px] text-tenue">{migas}</div>}
        <h1 className="text-[26px] font-bold leading-tight text-marino">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-3xl text-[14px] text-tenue">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

const TONOS = {
  neutro: 'bg-[#EEF1F5] text-tinta border-[#D9E0E8]',
  info: 'bg-clinico-claro text-clinico-oscuro border-clinico/20',
  exito: 'bg-teal-claro text-teal border-teal/20',
  alerta: 'bg-alerta-claro text-alerta border-alerta/25',
  peligro: 'bg-peligro-claro text-peligro border-peligro/25',
  frio: 'bg-frio-claro text-frio border-frio/25',
} as const;
export type Tono = keyof typeof TONOS;

export function Insignia({ tono = 'neutro', children, icono, titulo }: { tono?: Tono; children: ReactNode; icono?: ReactNode; titulo?: string }) {
  return (
    <span title={titulo} className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[12px] font-semibold leading-none ${TONOS[tono]}`}>
      {icono}{children}
    </span>
  );
}

const ICONOS: Record<string, typeof Tag> = { eye: Eye, 'triangle-alert': TriangleAlert, snowflake: Snowflake, 'flask-conical': FlaskConical, tag: Tag, 'shield-alert': ShieldAlert };

/** Etiqueta de producto: siempre ícono + texto, nunca solo color. */
export function EtiquetaProducto({ e }: { e: { codigo: string; nombre: string; icono: string; tono: string } }) {
  const I = ICONOS[e.icono] ?? Tag;
  const tono: Tono = e.tono === 'peligro' ? 'peligro' : e.tono === 'alerta' ? 'alerta' : e.tono === 'frio' ? 'frio' : e.tono === 'info' ? 'info' : 'neutro';
  return <Insignia tono={tono} icono={<I size={12} aria-hidden />}>{e.nombre}</Insignia>;
}

export function Controlado({ grupo }: { grupo: string | null }) {
  return <Insignia tono="peligro" icono={<ShieldAlert size={12} aria-hidden />} titulo="Medicamento controlado">Controlado{grupo ? ` · Gpo. ${grupo}` : ''}</Insignia>;
}

export function Aviso({ tono = 'info', titulo, children }: { tono?: 'info' | 'exito' | 'alerta' | 'peligro'; titulo?: string; children?: ReactNode }) {
  const I = tono === 'exito' ? CircleCheck : tono === 'peligro' ? CircleAlert : tono === 'alerta' ? TriangleAlert : Info;
  const c = { info: 'border-clinico/25 bg-clinico-claro', exito: 'border-teal/25 bg-teal-claro', alerta: 'border-alerta/30 bg-alerta-claro', peligro: 'border-peligro/30 bg-peligro-claro' }[tono];
  const ic = { info: 'text-clinico', exito: 'text-teal', alerta: 'text-alerta', peligro: 'text-peligro' }[tono];
  return (
    <div role={tono === 'peligro' ? 'alert' : 'status'} className={`flex gap-3 rounded-md border px-3.5 py-3 text-[14px] ${c}`}>
      <I size={18} className={`mt-0.5 shrink-0 ${ic}`} aria-hidden />
      <div className="min-w-0">{titulo && <p className="font-semibold">{titulo}</p>}{children && <div className={titulo ? 'mt-0.5' : ''}>{children}</div>}</div>
    </div>
  );
}

export function Vacio({ titulo, children, icono }: { titulo: string; children?: ReactNode; icono?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icono && <div className="mb-3 text-marino-300">{icono}</div>}
      <p className="font-titulo text-[18px] font-semibold text-marino">{titulo}</p>
      {children && <div className="mt-1 max-w-md text-[14px] text-tenue">{children}</div>}
    </div>
  );
}

export function Seccion({ titulo, descripcion, acciones, children, className = '' }: { titulo: string; descripcion?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tarjeta ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-linea px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-marino">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-[13px] text-tenue">{descripcion}</p>}
        </div>
        {acciones}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-[15px]">{children ?? <span className="text-tenue">—</span>}</dd>
    </div>
  );
}
