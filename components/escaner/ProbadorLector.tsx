'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { code128B } from '@/lib/code128';
import { interpretarCodigo, GS } from '@/lib/codigos';
import { DetectorEscaneo, OPCIONES_DETECTOR } from '@/lib/escaner';
import { fecha } from '@/lib/formato';
import { Aviso, Insignia } from '../ui';

const TEXTO_PRUEBA = 'Siif-Prueba_7/2';

interface Tecla { key: string; dt: number }

/** Pantalla de diagnóstico: muestra exactamente qué envía la pistola, a qué velocidad y si la distribución de teclado coincide. */
export function ProbadorLector() {
  const [teclas, setTeclas] = useState<Tecla[]>([]);
  const [lecturas, setLecturas] = useState<{ codigo: string; ms: number; fin: string }[]>([]);
  const ultimo = useRef(0);
  useEffect(() => {
    const det = new DetectorEscaneo(OPCIONES_DETECTOR);
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = ev.ctrlKey && ev.key === ']' ? 'GroupSeparator' : ev.key;
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(k)) return;
      const dt = ultimo.current ? ev.timeStamp - ultimo.current : 0;
      ultimo.current = ev.timeStamp;
      if (k === 'Enter' || k === 'Tab') ev.preventDefault();
      setTeclas((t) => [...t.slice(-119), { key: k, dt }]);
      const r = det.tecla(k, ev.timeStamp);
      if (r.tipo === 'lectura') setLecturas((l) => [{ codigo: r.codigo, ms: r.msPromedio, fin: r.terminador }, ...l].slice(0, 8));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const barras = useMemo(() => code128B(TEXTO_PRUEBA), []);
  const ancho = barras.reduce((s, w) => s + w, 0) + 20;
  let x = 10;
  const ultimaLectura = lecturas[0];
  const coincide = ultimaLectura?.codigo === TEXTO_PRUEBA;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="tarjeta p-4">
        <h2 className="text-[17px] font-semibold text-marino">1. Escanea esta etiqueta de prueba</h2>
        <p className="mt-1 text-[14px] text-tenue">Contiene <span className="font-mono text-tinta">{TEXTO_PRUEBA}</span>: mayúsculas, minúsculas, guion, guion bajo y diagonal. Si la distribución de teclado de la pistola no coincide con la de la computadora, alguno de esos símbolos saldrá cambiado.</p>
        <div className="mt-4 overflow-x-auto rounded-md border border-linea bg-white p-4">
          <svg viewBox={`0 0 ${ancho} 60`} className="mx-auto h-28 w-full max-w-[520px]" role="img" aria-label={`Código de barras de prueba ${TEXTO_PRUEBA}`} shapeRendering="crispEdges">
            <rect width={ancho} height="60" fill="#fff" />
            {barras.map((w, i) => { const r = i % 2 === 0 ? <rect key={i} x={x} y={4} width={w} height={44} fill="#000" /> : null; x += w; return r; })}
            <text x={ancho / 2} y={57} textAnchor="middle" fontSize="7" fontFamily="IBM Plex Mono, monospace" fill="#000">{TEXTO_PRUEBA}</text>
          </svg>
        </div>
        <p className="mt-2 text-[12px] text-tenue">Las pistolas láser a veces no leen pantallas; si no lee, sube el brillo o imprime esta página. Las pistolas de imagen (2D) la leen sin problema.</p>
        <div className="mt-4">
          {!ultimaLectura ? <Aviso>Esperando una lectura…</Aviso>
            : coincide ? <Aviso tono="exito" titulo="La pistola está bien configurada">Leyó exactamente <span className="font-mono">{ultimaLectura.codigo}</span>, a {ultimaLectura.ms} ms por carácter, y terminó con {ultimaLectura.fin}.</Aviso>
              : <Aviso tono="peligro" titulo="La lectura no coincide">
                  Se recibió <span className="font-mono">{ultimaLectura.codigo}</span> en lugar de <span className="font-mono">{TEXTO_PRUEBA}</span>.
                  {ultimaLectura.codigo.toLowerCase() === TEXTO_PRUEBA.toLowerCase() ? ' Las mayúsculas están invertidas: revisa que Bloq Mayús esté apagado.' : ' Configura en la pistola el mismo idioma de teclado que usa Windows (ver Instrucciones).'}
                </Aviso>}
        </div>
      </section>

      <section className="tarjeta p-4">
        <h2 className="text-[17px] font-semibold text-marino">2. Lecturas detectadas</h2>
        <p className="mt-1 text-[14px] text-tenue">Escanea cualquier código. Una lectura válida llega en ráfaga (menos de {OPCIONES_DETECTOR.msMaxEntreTeclas} ms entre caracteres) y termina en Enter o Tab.</p>
        {lecturas.length === 0 ? <p className="mt-4 text-[14px] text-tenue">Aún no hay lecturas.</p> : (
          <ul className="mt-3 flex flex-col divide-y divide-linea">
            {lecturas.map((l, i) => {
              const c = interpretarCodigo(l.codigo);
              return (
                <li key={i} className="py-2.5">
                  <p className="break-all font-mono text-[14px]">{l.codigo.replaceAll(GS, '⟨GS⟩')}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-tenue">
                    <Insignia tono={c.tipo === 'GTIN' ? 'exito' : 'neutro'}>{c.gs1 ? 'GS1' : c.tipo === 'GTIN' ? 'EAN / GTIN válido' : c.tipo === 'INTERNO' ? 'Código interno' : 'Caracteres no estándar'}</Insignia>
                    {l.codigo.length} caracteres · {l.ms} ms/carácter · terminó con {l.fin}
                    {c.gs1?.lote && <> · lote <span className="font-mono">{c.gs1.lote}</span></>}
                    {c.gs1?.caducidad && <> · caduca {fecha(c.gs1.caducidad)}</>}
                  </p>
                  {c.advertencias.map((a) => <p key={a} className="mt-1 text-[12px] text-alerta">{a}</p>)}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="tarjeta p-4 xl:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-marino">3. Teclas recibidas (diagnóstico)</h2>
          <button className="btn-fantasma btn-chico" onClick={() => { setTeclas([]); setLecturas([]); ultimo.current = 0; }}>Limpiar</button>
        </div>
        <p className="mt-1 text-[14px] text-tenue">Cada tecla con los milisegundos desde la anterior. Útil para ver si la pistola agrega prefijos o un sufijo distinto de Enter.</p>
        <div className="mt-3 flex min-h-[64px] flex-wrap gap-1 rounded-md border border-linea bg-fondo p-2 font-mono text-[12px]">
          {teclas.length === 0 ? <span className="text-tenue">Sin teclas todavía.</span> : teclas.map((t, i) => (
            <span key={i} className={`rounded px-1.5 py-0.5 ${t.key.length > 1 ? 'bg-marino text-white' : t.dt > 0 && t.dt < OPCIONES_DETECTOR.msMaxEntreTeclas ? 'bg-teal-claro text-teal' : 'bg-white text-tinta'}`}>
              {t.key === ' ' ? '␠' : t.key === 'GroupSeparator' ? 'GS' : t.key}<sub className="ml-0.5 text-[9px] opacity-70">{Math.round(t.dt)}</sub>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
