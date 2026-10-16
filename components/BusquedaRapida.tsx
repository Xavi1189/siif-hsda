'use client';
import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ScanBarcode, Search } from 'lucide-react';
import { useEscaner } from './escaner/useEscaner';
import { sonar, preferenciaSonido } from './escaner/sonido';
import { leerCodigo } from '@/app/(sistema)/acciones';

/**
 * Búsqueda rápida del encabezado. También recibe lecturas de la pistola en cualquier pantalla:
 * si el código está vinculado abre la ficha del producto; si no, lleva al lector para vincularlo.
 * La pantalla del lector tiene su propio manejo y desactiva este.
 */
export function BusquedaRapida({ ventanaMs, sonidoPredeterminado }: { ventanaMs: number; sonidoPredeterminado: boolean }) {
  const router = useRouter();
  const ruta = usePathname();
  const [q, setQ] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const resolver = (texto: string, desdePistola: boolean) => iniciar(async () => {
    const r = await leerCodigo(texto);
    const sonido = desdePistola && preferenciaSonido(sonidoPredeterminado);
    if (r.ok && r.datos.encontrado) {
      if (sonido) sonar(r.datos.encontrado.verificado ? 'ok' : 'aviso');
      router.push(`/catalogo/${r.datos.encontrado.producto.id}`);
      setQ('');
    } else if (desdePistola) {
      if (sonido) sonar('error');
      router.push(`/lector?codigo=${encodeURIComponent(texto)}`);
    } else {
      router.push(`/catalogo?q=${encodeURIComponent(texto)}`);
    }
  });

  const activo = !ruta.startsWith('/lector');
  useEscaner((e) => {
    if (e.repetida) { setAviso('Lectura repetida ignorada'); setTimeout(() => setAviso(null), 1500); return; }
    resolver(e.codigo, true);
  }, { activo, ventanaMs });

  return (
    <form role="search" className="relative w-full max-w-md" onSubmit={(e) => { e.preventDefault(); if (q.trim()) resolver(q.trim(), false); }}>
      <label htmlFor="busqueda-rapida" className="sr-only">Buscar por código, clave, nombre o ubicación</label>
      <Search size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tenue" />
      <input id="busqueda-rapida" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar o escanear: código, clave, nombre, ubicación"
        className="campo rounded-full border-[#ECE8E1] bg-[#FAF8F5] pl-10 pr-10" autoComplete="off" spellCheck={false} />
      <ScanBarcode size={16} aria-hidden className={`absolute right-4 top-1/2 -translate-y-1/2 ${pendiente ? 'animate-pulse text-clinico' : 'text-tenue'}`} />
      {aviso && <span role="status" className="absolute left-0 top-full mt-1 rounded bg-marino px-2 py-1 text-[12px] text-white">{aviso}</span>}
    </form>
  );
}
