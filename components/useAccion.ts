'use client';
import { useState, useTransition } from 'react';
import type { Resultado } from '@/lib/servidor';

/** Ejecuta una acción de servidor y guarda su mensaje (éxito o error) para mostrarlo junto al formulario. */
export function useAccion() {
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<{ tono: 'exito' | 'peligro'; texto: string; campos?: Record<string, string> } | null>(null);
  function ejecutar<T>(fn: () => Promise<Resultado<T>>, alTerminar?: (datos: T) => void) {
    iniciar(async () => {
      try {
        const r = await fn();
        if (r.ok) { setEstado(r.mensaje ? { tono: 'exito', texto: r.mensaje } : null); alTerminar?.(r.datos); }
        else setEstado({ tono: 'peligro', texto: r.error, campos: r.campos });
      } catch {
        setEstado({ tono: 'peligro', texto: 'No hubo respuesta del servidor. Revisa la conexión e intenta de nuevo.' });
      }
    });
  }
  return { pendiente, estado, setEstado, ejecutar };
}
