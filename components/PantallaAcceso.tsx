import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

/** Marco de las pantallas de acceso: panel institucional + formulario. */
export function PantallaAcceso({ institucion, sistema, siglas, tieneLogo, titulo, subtitulo, children }: {
  institucion: string; sistema: string; siglas: string; tieneLogo: boolean; titulo: string; subtitulo?: string; children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-marino text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 3px,#fff 3px 5px,transparent 5px 9px,#fff 9px 10px,transparent 10px 14px)', backgroundSize: '100% 38%', backgroundRepeat: 'no-repeat', backgroundPosition: 'bottom' }} />
        <div className="relative flex items-center gap-3">
          {tieneLogo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src="/api/logo" alt="" className="h-12 w-auto rounded bg-white p-1" />
            : <span className="grid h-12 w-12 place-items-center rounded bg-white/10 font-titulo text-[20px] font-bold">{siglas.slice(0, 2)}</span>}
          <div>
            <p className="font-titulo text-[20px] font-semibold leading-tight">{institucion}</p>
            <p className="text-[13px] text-marino-300">Farmacia Hospitalaria · Farmacia de Urgencias</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="font-titulo text-[44px] font-bold leading-[1.05]">{siglas}</p>
          <p className="mt-2 text-[18px] text-marino-100">{sistema}</p>
          <p className="mt-6 text-[14px] leading-relaxed text-marino-300">
            Trazabilidad por lote y caducidad, kárdex inmutable y control por roles. Sistema auxiliar del SIHO:
            no sustituye libros oficiales, recetas ni requisitos de COFEPRIS.
          </p>
        </div>
        <p className="relative flex items-center gap-2 text-[12px] text-marino-300"><ShieldCheck size={14} aria-hidden /> Acceso restringido a personal autorizado. Toda acción queda registrada.</p>
      </aside>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <p className="font-titulo text-[22px] font-bold text-marino">{siglas}</p>
            <p className="text-[13px] text-tenue">{institucion}</p>
          </div>
          <h1 className="text-[28px] font-bold text-marino">{titulo}</h1>
          {subtitulo && <p className="mb-6 mt-1 text-[14px] text-tenue">{subtitulo}</p>}
          {children}
        </div>
      </section>
    </main>
  );
}
