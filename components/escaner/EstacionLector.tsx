'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, CircleHelp, Link2, ScanBarcode, Search, Volume2, VolumeX } from 'lucide-react';
import { leerCodigo, sugerir, vincular } from '@/app/(sistema)/acciones';
import type { ResultadoLectura } from '@/lib/catalogo';
import { fecha } from '@/lib/formato';
import { useEscaner } from './useEscaner';
import { guardarPreferenciaSonido, preferenciaSonido, sonar } from './sonido';
import { Aviso, Controlado, EtiquetaProducto, Insignia } from '../ui';

interface Lectura { id: number; codigo: string; hora: string; estado: 'encontrado' | 'sin-verificar' | 'desconocido' | 'repetida' | 'error'; texto: string }
type Sugerencia = Awaited<ReturnType<typeof sugerir>>[number];

export function EstacionLector({ ventanaMs, sonidoPredeterminado, puedeVincular, inicial }: {
  ventanaMs: number; sonidoPredeterminado: boolean; puedeVincular: 'directo' | 'propuesta' | null; inicial?: string;
}) {
  const [actual, setActual] = useState<ResultadoLectura | null>(null);
  const [historial, setHistorial] = useState<Lectura[]>([]);
  const [manual, setManual] = useState('');
  const [sonido, setSonido] = useState(sonidoPredeterminado);
  const [ocupado, setOcupado] = useState(false);
  const [destello, setDestello] = useState(0);
  const contador = useRef(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { setSonido(preferenciaSonido(sonidoPredeterminado)); }, [sonidoPredeterminado]);

  const registrar = (codigo: string, estado: Lectura['estado'], texto: string) =>
    setHistorial((h) => [{ id: ++contador.current, codigo, estado, texto, hora: new Date().toLocaleTimeString('es-MX', { hour12: false, timeZone: 'America/Hermosillo' }) }, ...h].slice(0, 25));

  const procesar = useCallback(async (codigo: string, desdePistola: boolean) => {
    setOcupado(true);
    try {
      const r = await leerCodigo(codigo);
      if (!r.ok) { registrar(codigo, 'error', r.error); if (sonido) sonar('error'); return; }
      setActual(r.datos);
      setDestello((x) => x + 1);
      const e = r.datos.encontrado;
      if (e) {
        registrar(codigo, e.verificado ? 'encontrado' : 'sin-verificar', `${e.producto.clave} · ${e.producto.descripcion}`);
        if (sonido && desdePistola) sonar(e.verificado && !e.etiquetas.length ? 'ok' : 'aviso');
      } else {
        registrar(codigo, 'desconocido', 'Código no vinculado');
        if (sonido && desdePistola) sonar('error');
      }
    } catch {
      registrar(codigo, 'error', 'Sin respuesta del servidor');
    } finally {
      setOcupado(false);
      campo.current?.focus();
    }
  }, [sonido]);

  useEscaner((e) => {
    if (e.repetida) { registrar(e.codigo, 'repetida', `Lectura repetida en menos de ${ventanaMs / 1000} s: se ignoró`); if (sonido) sonar('aviso'); return; }
    void procesar(e.codigo, true);
  }, { ventanaMs });

  useEffect(() => { if (inicial) void procesar(inicial, false); campo.current?.focus(); }, [inicial, procesar]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="tarjeta p-4">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void procesar(manual.trim(), false); setManual(''); } }}>
            <label htmlFor="lectura-manual" className="sr-only">Captura manual de código o clave</label>
            <div className="relative min-w-[220px] flex-1">
              <ScanBarcode size={20} aria-hidden className={`absolute left-3 top-1/2 -translate-y-1/2 ${ocupado ? 'animate-pulse text-clinico' : 'text-teal'}`} />
              <input id="lectura-manual" ref={campo} value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" spellCheck={false}
                className="campo py-3 pl-10 font-mono text-[18px]" placeholder="Listo para escanear… o escribe el código / clave" />
            </div>
            <button className="btn-primario px-4" disabled={ocupado}><Search size={16} aria-hidden />Buscar</button>
            <button type="button" className="btn-secundario" aria-pressed={sonido} title="Confirmación sonora"
              onClick={() => { setSonido(!sonido); guardarPreferenciaSonido(!sonido); if (!sonido) sonar('ok'); }}>
              {sonido ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}<span className="hidden sm:inline">{sonido ? 'Sonido' : 'Silencio'}</span>
            </button>
          </form>
          <p className="mt-2 text-[12px] text-tenue">La pistola funciona aunque el cursor no esté en este campo. Una lectura idéntica en menos de {(ventanaMs / 1000).toLocaleString('es-MX')} s se ignora para evitar duplicados.</p>
        </div>

        <div key={destello} className="tarjeta min-h-[220px] p-5 motion-safe:animate-[aparecer_.25s_ease-out]">
          {!actual ? (
            <div className="flex flex-col items-center py-10 text-center text-tenue">
              <ScanBarcode size={44} className="mb-3 text-marino-300" aria-hidden />
              <p className="font-titulo text-[18px] font-semibold text-marino">Escanea una caja o un empaque</p>
              <p className="mt-1 max-w-md text-[14px]">Verás aquí el producto, la presentación que identifica el código y cualquier advertencia (LASA, alto riesgo, controlado).</p>
            </div>
          ) : actual.encontrado ? <Encontrado r={actual} /> : <Desconocido r={actual} puedeVincular={puedeVincular} alVincular={(c) => void procesar(c, false)} />}
        </div>
      </div>

      <aside className="tarjeta min-w-0">
        <header className="flex items-center justify-between border-b border-linea px-4 py-3">
          <h2 className="text-[17px] font-semibold text-marino">Lecturas de esta sesión</h2>
          {historial.length > 0 && <button className="btn-fantasma btn-chico" onClick={() => setHistorial([])}>Limpiar</button>}
        </header>
        {historial.length === 0 ? <p className="px-4 py-6 text-[14px] text-tenue">Cada lectura aparecerá aquí con su resultado.</p> : (
          <ol className="max-h-[540px] divide-y divide-linea overflow-y-auto">
            {historial.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                <EstadoLectura e={l.estado} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px]">{l.codigo.replace(/\u001d/g, '⟨GS⟩')}</p>
                  <p className="truncate text-[13px] text-tenue">{l.texto}</p>
                </div>
                <span className="font-mono text-[12px] text-tenue">{l.hora}</span>
              </li>
            ))}
          </ol>
        )}
      </aside>
      <style>{`@keyframes aparecer{from{opacity:.4;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function EstadoLectura({ e }: { e: Lectura['estado'] }) {
  const m = {
    encontrado: <Insignia tono="exito">Encontrado</Insignia>, 'sin-verificar': <Insignia tono="alerta">Por verificar</Insignia>,
    desconocido: <Insignia tono="peligro">Desconocido</Insignia>, repetida: <Insignia>Repetida</Insignia>, error: <Insignia tono="peligro">Error</Insignia>,
  };
  return <span className="mt-0.5 shrink-0">{m[e]}</span>;
}

function DatosGS1({ r }: { r: ResultadoLectura }) {
  const g = r.lectura.gs1;
  return (
    <>
      {g && (g.lote || g.caducidad) && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-linea bg-fondo p-3 sm:grid-cols-3">
          <div><p className="rotulo">Lote (GS1)</p><p className="font-mono">{g.lote ?? '—'}</p></div>
          <div><p className="rotulo">Caducidad (GS1)</p><p className="font-mono">{g.caducidad ? fecha(g.caducidad) : '—'}</p></div>
          {g.serie && <div><p className="rotulo">Serie</p><p className="font-mono">{g.serie}</p></div>}
          <p className="col-span-full text-[12px] text-tenue">Datos leídos del código. Confírmalos contra el empaque al recibir o surtir.</p>
        </div>
      )}
      {!g && r.lectura.tipo === 'GTIN' && <p className="mt-3 text-[13px] text-tenue">Este código (EAN/GTIN) identifica el producto, no el lote ni la caducidad: esos datos se capturan a mano.</p>}
      {r.lectura.advertencias.map((a) => <div key={a} className="mt-3"><Aviso tono="alerta">{a}</Aviso></div>)}
    </>
  );
}

function Encontrado({ r }: { r: ResultadoLectura }) {
  const e = r.encontrado!;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[13px] text-tenue">{e.producto.clave} · {e.via === 'clave' ? 'clave interna' : `código ${r.lectura.normalizado}`}</p>
          <h2 className="mt-0.5 text-[24px] font-bold leading-tight text-marino">{e.producto.descripcion}</h2>
        </div>
        {e.verificado ? <Insignia tono="exito" icono={<BadgeCheck size={12} aria-hidden />}>Vínculo verificado</Insignia> : <Insignia tono="alerta">Vínculo por verificar</Insignia>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {e.producto.controlado && <Controlado grupo={null} />}
        {e.etiquetas.map((x) => <EtiquetaProducto key={x.codigo} e={x} />)}
        {e.producto.estatus !== 'activo' && <Insignia tono="peligro">Producto {e.producto.estatus}</Insignia>}
      </div>
      <div className="mt-4 rounded-md bg-clinico-claro px-4 py-3">
        <p className="rotulo">Este código identifica</p>
        <p className="mt-0.5 font-mono text-[20px] font-medium">
          1 {e.presentacion.nombre.toLowerCase()}{!e.presentacion.es_unidad && <> = {e.presentacion.factor.toLocaleString('es-MX')} {e.producto.unidad_minima.toLowerCase()}</>}
        </p>
      </div>
      {e.etiquetas.filter((x) => x.advertencia).map((x) => <div key={x.codigo} className="mt-3"><Aviso tono={x.tono === 'peligro' ? 'peligro' : 'alerta'} titulo={x.nombre}>{x.advertencia}</Aviso></div>)}
      {!e.verificado && <div className="mt-3"><Aviso tono="alerta">Un auxiliar propuso este vínculo. Confirma que el empaque corresponde antes de usarlo; un encargado puede verificarlo en la ficha.</Aviso></div>}
      <DatosGS1 r={r} />
      <div className="mt-4"><Link href={`/catalogo/${e.producto.id}`} className="btn-secundario">Abrir ficha del producto</Link></div>
    </div>
  );
}

function Desconocido({ r, puedeVincular, alVincular }: { r: ResultadoLectura; puedeVincular: 'directo' | 'propuesta' | null; alVincular: (c: string) => void }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<Sugerencia[]>([]);
  const [elegido, setElegido] = useState<Sugerencia | null>(null);
  const [pres, setPres] = useState('');
  const [msg, setMsg] = useState<{ tono: 'peligro' | 'exito'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { setQ(''); setLista([]); setElegido(null); setMsg(null); }, [r]);
  const buscar = (v: string) => {
    setQ(v); clearTimeout(t.current);
    t.current = setTimeout(async () => setLista(v.trim().length >= 2 ? await sugerir(v) : []), 200);
  };
  const presentaciones = useMemo(() => elegido?.presentaciones ?? [], [elegido]);
  return (
    <div>
      <div className="flex items-start gap-3">
        <CircleHelp size={28} className="mt-0.5 shrink-0 text-peligro" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold text-marino">Código no vinculado</h2>
          <p className="break-all font-mono text-[14px] text-tenue">{r.lectura.normalizado}{r.lectura.tipo === 'GTIN' && ' · GTIN válido'}</p>
        </div>
      </div>
      <DatosGS1 r={r} />
      {!puedeVincular ? (
        <p className="mt-4 text-[14px] text-tenue">Tu rol no puede vincular códigos. Pide a un encargado que lo haga, o busca el producto por nombre en el catálogo.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[14px]">Busca el producto que tienes en la mano para ligarle este código. {puedeVincular === 'propuesta' && <span className="text-tenue">Quedará como propuesta hasta que un encargado lo verifique.</span>}</p>
          {msg && <Aviso tono={msg.tono}>{msg.texto}</Aviso>}
          {!elegido ? (
            <>
              <label htmlFor="buscar-vincular" className="sr-only">Buscar producto</label>
              <input id="buscar-vincular" autoFocus className="campo" value={q} onChange={(e) => buscar(e.target.value)} placeholder="Nombre, clave o laboratorio (ej. ketorolaco 30)" autoComplete="off" />
              {lista.length > 0 && (
                <ul className="max-h-72 divide-y divide-linea overflow-y-auto rounded-md border border-linea">
                  {lista.map((p) => (
                    <li key={p.id}><button type="button" className="flex w-full gap-3 px-3 py-2 text-left hover:bg-clinico-claro focus:bg-clinico-claro"
                      onClick={() => { setElegido(p); const def = p.presentaciones.find((x) => !x.es_unidad) ?? p.presentaciones[0]; setPres(String(def?.id ?? '')); }}>
                      <span className="font-mono text-[13px] text-tenue">{p.clave}</span><span className="text-[14px]">{p.descripcion}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <form className="flex flex-col gap-3 rounded-md border border-clinico/30 bg-clinico-claro/50 p-3" onSubmit={async (e) => {
              e.preventDefault(); setEnviando(true);
              const res = await vincular(r.lectura.original, elegido.id, Number(pres)).catch(() => null);
              setEnviando(false);
              if (!res) setMsg({ tono: 'peligro', texto: 'Sin respuesta del servidor.' });
              else if (!res.ok) setMsg({ tono: 'peligro', texto: res.error });
              else { sonar('ok'); alVincular(r.lectura.original); }
            }}>
              <p className="text-[14px]"><span className="font-mono text-tenue">{elegido.clave}</span> · <span className="font-medium">{elegido.descripcion}</span></p>
              <div>
                <label htmlFor="pres-vincular" className="etiqueta-campo">El código está impreso en</label>
                <select id="pres-vincular" className="campo" value={pres} onChange={(e) => setPres(e.target.value)}>
                  {presentaciones.map((x) => <option key={x.id} value={x.id}>{!x.es_unidad ? `${x.nombre.toLowerCase()} con ${x.factor} ${elegido.unidad_minima.toLowerCase()}` : `${x.nombre.toLowerCase()} individual`}</option>)}
                </select>
                <p className="mt-1 text-[12px] text-tenue">Si la caja trae otro número de piezas, agrégalo primero como presentación en la ficha del producto.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primario" disabled={enviando}><Link2 size={16} aria-hidden />{puedeVincular === 'directo' ? 'Vincular código' : 'Proponer vínculo'}</button>
                <button type="button" className="btn-fantasma" onClick={() => setElegido(null)}>Elegir otro producto</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
