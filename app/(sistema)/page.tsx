import Link from 'next/link';
import { Barcode, CheckCircle2, Circle, ClipboardList, Pill, Tags, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/servidor';
import { tienePermiso, PERMISOS, type Permiso } from '@/lib/permisos';
import { fechaHora, num } from '@/lib/formato';
import { Aviso, Encabezado, Insignia, Seccion } from '@/components/ui';
import { ACCIONES } from '@/lib/acciones-auditoria';

export const metadata = { title: 'Dashboard' };


export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const c = await db();
  const k = (await c.query<{
    productos: number; activos: number; medicamentos: number; dispositivos: number; insumos: number; con_codigo: number;
    codigos: number; sin_verificar: number; controlados: number; con_etiqueta: number; usuarios: number; urg: number; hosp: number; con_minmax: number;
  }>(`SELECT
      (SELECT count(*)::int FROM productos) productos,
      (SELECT count(*)::int FROM productos WHERE estatus = 'activo') activos,
      (SELECT count(*)::int FROM productos WHERE estatus = 'activo' AND tipo = 'medicamento') medicamentos,
      (SELECT count(*)::int FROM productos WHERE estatus = 'activo' AND tipo = 'dispositivo_medico') dispositivos,
      (SELECT count(*)::int FROM productos WHERE estatus = 'activo' AND tipo = 'insumo') insumos,
      (SELECT count(DISTINCT producto_id)::int FROM codigos_barras WHERE activo) con_codigo,
      (SELECT count(*)::int FROM codigos_barras WHERE activo) codigos,
      (SELECT count(*)::int FROM codigos_barras WHERE activo AND NOT verificado) sin_verificar,
      (SELECT count(*)::int FROM productos WHERE controlado) controlados,
      (SELECT count(DISTINCT producto_id)::int FROM producto_etiquetas) con_etiqueta,
      (SELECT count(*)::int FROM usuarios WHERE activo) usuarios,
      (SELECT count(*)::int FROM parametros_area pa JOIN areas a ON a.id = pa.area_id WHERE a.codigo = 'URG' AND pa.maneja_en_area) urg,
      (SELECT count(*)::int FROM parametros_area pa JOIN areas a ON a.id = pa.area_id WHERE a.codigo = 'HOSP' AND pa.maneja_en_area) hosp,
      (SELECT count(*)::int FROM parametros_area WHERE minimo IS NOT NULL AND maximo IS NOT NULL) con_minmax`)).rows[0];
  const etiquetas = (await c.query<{ codigo: string; nombre: string; n: number }>(
    `SELECT e.codigo, e.nombre, count(pe.producto_id)::int n FROM etiquetas e LEFT JOIN producto_etiquetas pe ON pe.etiqueta_id = e.id WHERE e.activa GROUP BY e.id ORDER BY e.id`)).rows;
  const verBitacora = tienePermiso(u.rol, 'auditoria.ver');
  const eventos = verBitacora ? (await c.query<{ momento: string; accion: string; nombre: string | null; entidad: string | null; entidad_id: string | null }>(
    `SELECT a.momento, a.accion, u.nombre, a.entidad, a.entidad_id FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.accion <> 'sesion.cerrar' ORDER BY a.momento DESC LIMIT 8`)).rows : [];
  const cobertura = k.activos ? Math.round((k.con_codigo / k.activos) * 1000) / 10 : 0;

  const pasos = [
    { hecho: k.productos > 0, texto: 'Importar el catálogo del SIHO', href: '/configuracion#catalogo', permiso: 'catalogo.importar' },
    { hecho: k.usuarios > 1, texto: 'Dar de alta al equipo de farmacia con su rol', href: '/usuarios', permiso: 'usuarios.administrar' },
    { hecho: k.controlados > 0, texto: 'Marcar los medicamentos controlados y su grupo', href: '/catalogo?q=CONTROLADOS', permiso: 'catalogo.etiquetas' },
    { hecho: etiquetas.some((e) => e.n > 0), texto: 'Asignar etiquetas LASA, alto riesgo y cadena fría', href: '/catalogo', permiso: 'catalogo.etiquetas' },
    { hecho: k.codigos >= 50, texto: 'Vincular códigos de barras escaneando las cajas', href: '/lector', permiso: 'lector.usar' },
    { hecho: k.con_minmax > 0, texto: 'Capturar mínimos y máximos por área', href: '/catalogo', permiso: 'catalogo.editar' },
  ].filter((p) => tienePermiso(u.rol, p.permiso as Permiso));

  return (
    <>
      <Encabezado titulo={`Hola, ${u.nombre.split(' ')[0]}`} descripcion="Estado del catálogo y de la configuración. Los indicadores de existencias aparecen cuando se registren movimientos (Fase 3)." />
      {sp['sin-permiso'] && <div className="mb-4"><Aviso tono="alerta">No tienes permiso para: {PERMISOS[sp['sin-permiso'] as Permiso]?.toLowerCase() ?? 'esa sección'}.</Aviso></div>}
      {sp.contrasena === 'actualizada' && <div className="mb-4"><Aviso tono="exito">Tu contraseña se actualizó.</Aviso></div>}

      <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icono={<Pill size={18} />} rotulo="Productos activos" valor={num(k.activos)}
          detalle={`${num(k.medicamentos)} medicamentos · ${num(k.dispositivos)} dispositivos · ${num(k.insumos)} insumos`}
          calculo="Productos del catálogo con estatus Activo." />
        <Indicador icono={<Barcode size={18} />} rotulo="Cobertura de códigos" valor={`${cobertura}%`}
          detalle={`${num(k.con_codigo)} productos con código · ${num(k.codigos)} códigos`} barra={cobertura}
          calculo="Productos activos con al menos un código de barras vinculado ÷ productos activos." />
        <Indicador icono={<Tags size={18} />} rotulo="Productos etiquetados" valor={num(k.con_etiqueta)}
          detalle={`${num(k.controlados)} marcados como controlados`}
          calculo="Productos con al menos una etiqueta (LASA, alto riesgo, cadena fría, antibiótico). Controlados se cuenta aparte." />
        <Indicador icono={<Users size={18} />} rotulo="Usuarios activos" valor={num(k.usuarios)}
          detalle={k.sin_verificar ? `${num(k.sin_verificar)} códigos por verificar` : 'Sin códigos pendientes de verificar'}
          calculo="Cuentas activas. Los códigos propuestos por auxiliares quedan pendientes hasta que un encargado los verifica." />
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          {pasos.length > 0 && (
            <Seccion titulo="Puesta en marcha" descripcion="Lo que falta para que el catálogo esté listo antes de registrar movimientos.">
              <ol className="flex flex-col divide-y divide-linea">
                {pasos.map((p) => (
                  <li key={p.texto} className="flex items-center gap-3 py-2.5">
                    {p.hecho ? <CheckCircle2 size={18} className="shrink-0 text-teal" aria-label="Hecho" /> : <Circle size={18} className="shrink-0 text-marino-300" aria-label="Pendiente" />}
                    <span className={`flex-1 ${p.hecho ? 'text-tenue line-through decoration-linea' : ''}`}>{p.texto}</span>
                    {!p.hecho && <Link href={p.href} className="btn-secundario btn-chico">Ir</Link>}
                  </li>
                ))}
              </ol>
            </Seccion>
          )}
          <Seccion titulo="Catálogo por área" descripcion="Productos que maneja cada farmacia según el SIHO y los parámetros capturados.">
            <div className="grid gap-3 sm:grid-cols-2">
              {[{ n: 'Farmacia Hospitalaria (4to piso)', v: k.hosp }, { n: 'Farmacia de Urgencias', v: k.urg }].map((a) => (
                <div key={a.n} className="rounded-xl bg-[#F6F3EE] px-4 py-3">
                  <p className="text-[13px] text-tenue">{a.n}</p>
                  <p className="mt-0.5 font-titulo text-[24px] font-semibold tabular-nums text-marino">{num(a.v)} <span className="font-sans text-[13px] text-tenue">productos</span></p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {etiquetas.map((e) => <Link key={e.codigo} href={`/catalogo?etiqueta=${e.codigo}`}><Insignia tono="neutro">{e.nombre}: {num(e.n)}</Insignia></Link>)}
            </div>
          </Seccion>
          <Seccion titulo="Indicadores de inventario" descripcion="Se calculan a partir del kárdex; no se muestran cifras mientras no haya movimientos.">
            <ul className="grid gap-x-6 gap-y-1.5 text-[14px] text-tenue sm:grid-cols-2">
              {['Valor del inventario', 'Existencias críticas y agotados', 'Próximos a caducar y vencidos', 'Movimientos del día', 'Consumo, rotación y días de inventario', 'Diferencias de inventario físico'].map((x) => (
                <li key={x} className="flex items-center gap-2"><ClipboardList size={14} aria-hidden className="text-marino-300" />{x}</li>
              ))}
            </ul>
          </Seccion>
        </div>
        {verBitacora && (
          <Seccion titulo="Actividad reciente" acciones={<Link href="/usuarios/bitacora" className="btn-fantasma btn-chico">Ver bitácora</Link>}>
            {eventos.length ? (
              <ul className="flex flex-col divide-y divide-linea">
                {eventos.map((e, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[14px]">
                    <span className="min-w-0"><span className="font-medium">{e.nombre ?? 'Sistema'}</span> · {ACCIONES[e.accion] ?? e.accion}</span>
                    <span className="shrink-0 font-mono text-[12px] text-tenue">{fechaHora(e.momento)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[14px] text-tenue">Sin actividad registrada.</p>}
          </Seccion>
        )}
      </div>
    </>
  );
}

function Indicador({ icono, rotulo, valor, detalle, calculo, barra }: { icono: React.ReactNode; rotulo: string; valor: string; detalle: string; calculo: string; barra?: number }) {
  return (
    <div className="tarjeta px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#EDF1F6] text-marino" aria-hidden>{icono}</span>
        <div className="min-w-0">
          <dt className="text-[13px] text-tenue">{rotulo}</dt>
          <dd className="font-titulo text-[26px] font-semibold leading-tight tabular-nums text-marino">{valor}</dd>
        </div>
      </div>
      <dd className="mt-1.5 text-[13px] text-tenue">{detalle}</dd>
      {barra != null && <dd className="mt-2 h-1.5 overflow-hidden rounded bg-fondo"><span className="block h-full bg-teal" style={{ width: `${Math.min(100, barra)}%` }} /></dd>}
      <dd className="mt-2 border-t border-linea pt-2 text-[12px] text-tenue"><span className="font-semibold">Cálculo:</span> {calculo}</dd>
    </div>
  );
}
