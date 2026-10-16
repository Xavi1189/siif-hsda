'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CalendarClock, ClipboardList, FileBarChart, LayoutDashboard, LogOut, Menu,
  PackageCheck, Pill, ScanBarcode, Settings, ShieldAlert, ShoppingCart, Thermometer, Users, X,
} from 'lucide-react';

const ICONOS = {
  dashboard: LayoutDashboard, catalogo: Pill, lector: ScanBarcode, recepciones: PackageCheck, entradas: ArrowDownToLine,
  salidas: ArrowUpFromLine, transferencias: ArrowLeftRight, inventario: ClipboardList, caducidades: CalendarClock,
  controlados: ShieldAlert, cadena: Thermometer, reabasto: ShoppingCart, reportes: FileBarChart, usuarios: Users, configuracion: Settings,
};
export type IconoNav = keyof typeof ICONOS;
export interface ItemNav { href: string; texto: string; icono: IconoNav; fase?: number; grupo: string }

export function Shell({ nav, institucion, siglas, tieneLogo, usuario, rol, fecha, busqueda, salir, children }: {
  nav: ItemNav[]; institucion: string; siglas: string; tieneLogo: boolean; usuario: string; rol: string; fecha: string;
  busqueda: ReactNode; salir: (f: FormData) => void; children: ReactNode;
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const activo = (h: string) => (h === '/' ? ruta === '/' : ruta === h || ruta.startsWith(h + '/'));
  const grupos = [...new Set(nav.map((n) => n.grupo))];

  const lateral = (
    <nav aria-label="Módulos" className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-3 px-5 pb-5 pt-5" onClick={() => setAbierto(false)}>
        {/* Isotipo blanco: uso alternativo del manual para espacios reducidos y contextos digitales */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/isotipo-blanco.png" alt="Hospital San Diego de Alcalá" width={44} height={44} className="h-11 w-11 shrink-0" />
        <span className="min-w-0">
          <span className="block font-titulo text-[19px] font-bold leading-none">{siglas}</span>
          <span className="block truncate text-[12px] text-marino-300">Inventario farmacéutico</span>
        </span>
      </Link>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {grupos.map((g) => (
          <div key={g} className="mb-3">
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-marino-300/80">{g}</p>
            <ul className="flex flex-col gap-0.5">
              {nav.filter((n) => n.grupo === g).map((n) => {
                const I = ICONOS[n.icono];
                const act = activo(n.href);
                return (
                  <li key={n.href}>
                    <Link href={n.href} onClick={() => setAbierto(false)} aria-current={act ? 'page' : undefined}
                      className={`group flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[14px] transition-colors ${act ? 'bg-white text-marino font-semibold' : 'text-marino-100 hover:bg-white/10'} ${n.fase ? 'opacity-75' : ''}`}>
                      <I size={17} aria-hidden className={act ? 'text-clinico' : 'text-marino-300 group-hover:text-white'} />
                      <span className="flex-1 truncate">{n.texto}</span>
                      {n.fase && <span className={`rounded px-1.5 py-px font-mono text-[10px] ${act ? 'bg-clinico-claro text-clinico' : 'bg-white/10 text-marino-300'}`} title={`Se habilita en la Fase ${n.fase}`}>F{n.fase}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-5 py-4 text-[12px] leading-snug text-marino-300">
        Sistema auxiliar del SIHO. No sustituye libros oficiales ni requisitos de COFEPRIS.
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen bg-marino text-white lg:block">{lateral}</aside>
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-marino/50" onClick={() => setAbierto(false)} />
          <aside className="absolute inset-y-0 left-0 w-[272px] max-w-[85vw] bg-marino text-white shadow-xl">
            <button onClick={() => setAbierto(false)} className="absolute right-3 top-4 rounded p-1 text-marino-100 hover:bg-white/10" aria-label="Cerrar menú"><X size={20} /></button>
            {lateral}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-linea bg-white/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
            <button className="rounded p-1.5 text-marino hover:bg-clinico-claro lg:hidden" onClick={() => setAbierto(true)} aria-label="Abrir menú"><Menu size={22} /></button>
            <div className="hidden min-w-0 flex-col leading-tight md:flex">
              <span className="truncate font-titulo text-[16px] font-semibold text-marino">{institucion}</span>
              <span className="text-[12px] text-tenue">{fecha}</span>
            </div>
            <div className="order-last flex w-full flex-1 justify-center sm:order-none sm:w-auto">{busqueda}</div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right leading-tight sm:block">
                <span className="block text-[14px] font-medium">{usuario}</span>
                <span className="block text-[12px] text-tenue">{rol}</span>
              </div>
              <Link href="/cambiar-contrasena" className="grid h-9 w-9 place-items-center rounded-full bg-clinico-claro font-titulo text-[14px] font-semibold text-clinico" title="Mi cuenta: cambiar contraseña">
                {usuario.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </Link>
              <form action={salir}><button className="btn-fantasma btn-chico" title="Cerrar sesión"><LogOut size={16} aria-hidden /><span className="hidden sm:inline">Salir</span></button></form>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 pb-16 pt-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
