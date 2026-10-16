'use client';
import { useEffect, useRef } from 'react';
import { DetectorEscaneo, FiltroDuplicados, OPCIONES_DETECTOR } from '@/lib/escaner';

export interface EventoLectura { codigo: string; repetida: boolean; msPromedio: number; terminador: 'Enter' | 'Tab' }

/**
 * Escucha la pistola en toda la página (aunque el cursor esté en otro campo).
 * Cuando reconoce una ráfaga de escaneo, revierte lo que alcanzó a escribirse en el campo enfocado,
 * evita el envío del formulario y entrega la lectura una sola vez.
 */
export function useEscaner(onLectura: (e: EventoLectura) => void, opts: { activo?: boolean; ventanaMs: number }) {
  const cb = useRef(onLectura);
  cb.current = onLectura;
  useEffect(() => {
    if (opts.activo === false) return;
    const det = new DetectorEscaneo(OPCIONES_DETECTOR);
    const filtro = new FiltroDuplicados(opts.ventanaMs);
    let campo: HTMLInputElement | HTMLTextAreaElement | null = null;
    let valorPrevio = '';
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) {
        if (ev.ctrlKey && ev.key === ']') { det.tecla('GroupSeparator', ev.timeStamp); ev.preventDefault(); }
        return;
      }
      // Un campo marcado data-escaner="propio" recibe la lectura tal cual (p. ej. "vincular código" en la ficha)
      if ((document.activeElement as HTMLElement | null)?.dataset?.escaner === 'propio') { det.reiniciar(); return; }
      if (ev.key.length === 1 && !det.enCurso) {
        const el = document.activeElement;
        campo = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
        valorPrevio = campo?.value ?? '';
      }
      const r = det.tecla(ev.key, ev.timeStamp);
      if (r.tipo === 'lectura') {
        ev.preventDefault();
        ev.stopPropagation();
        if (campo) {
          // Revertimos los caracteres que la pistola alcanzó a teclear dentro del campo enfocado
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(campo), 'value')?.set;
          setter?.call(campo, valorPrevio);
          campo.dispatchEvent(new Event('input', { bubbles: true }));
        }
        campo = null;
        cb.current({ codigo: r.codigo, repetida: filtro.revisar(r.codigo, ev.timeStamp) === 'repetida', msPromedio: r.msPromedio, terminador: r.terminador });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [opts.activo, opts.ventanaMs]);
}
