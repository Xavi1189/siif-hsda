import Link from 'next/link';
import { exigirUsuario } from '@/lib/servidor';
import { configuracion } from '@/lib/config';
import { tienePermiso } from '@/lib/permisos';
import { Encabezado, Seccion } from '@/components/ui';
import { EstacionLector } from '@/components/escaner/EstacionLector';
import { ProbadorLector } from '@/components/escaner/ProbadorLector';

export const metadata = { title: 'Lector de códigos' };

const VISTAS = [['escanear', 'Escanear'], ['probar', 'Probar lector'], ['instrucciones', 'Instrucciones de configuración']] as const;

export default async function Lector({ searchParams }: { searchParams: Promise<{ vista?: string; codigo?: string }> }) {
  const u = await exigirUsuario('lector.usar');
  const sp = await searchParams;
  const c = await configuracion();
  const vista = VISTAS.some(([v]) => v === sp.vista) ? sp.vista! : 'escanear';
  const puedeVincular = tienePermiso(u.rol, 'codigos.vincular') ? 'directo' : tienePermiso(u.rol, 'codigos.proponer') ? 'propuesta' : null;
  return (
    <>
      <Encabezado titulo="Lector de códigos" descripcion="Consulta productos escaneando, vincula códigos nuevos y comprueba que la pistola esté bien configurada. No requiere instalar controladores: la pistola funciona como un teclado." />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-linea" aria-label="Vistas del lector">
        {VISTAS.map(([v, t]) => (
          <Link key={v} href={`/lector?vista=${v}`} aria-current={vista === v ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-[3px] px-3 py-2 font-titulo text-[15px] font-semibold ${vista === v ? 'border-clinico text-marino' : 'border-transparent text-tenue hover:text-marino'}`}>{t}</Link>
        ))}
      </nav>
      {vista === 'escanear' && <EstacionLector ventanaMs={c.escaneo_ventana_duplicado_ms} sonidoPredeterminado={c.escaneo_sonido} puedeVincular={puedeVincular} inicial={sp.codigo?.slice(0, 200)} />}
      {vista === 'probar' && <ProbadorLector />}
      {vista === 'instrucciones' && <Instrucciones ventana={c.escaneo_ventana_duplicado_ms} />}
    </>
  );
}

function Instrucciones({ ventana }: { ventana: number }) {
  const pasos: [string, React.ReactNode][] = [
    ['Conecta la base o empareja la pistola', <>Con base USB (como la de la farmacia), conecta la base a la computadora: Windows la reconoce como teclado en segundos y la pistola inalámbrica trabaja a través de ella. Con Bluetooth directo, empareja la pistola en <em>Configuración → Bluetooth</em> en modo <strong>HID / teclado</strong> (no en modo SPP o puerto serie).</>],
    ['Sufijo: Enter', <>La pistola debe terminar cada lectura con <strong>Enter</strong> (CR). Casi todas vienen así de fábrica; si la tuya usa Tab, también funciona. Si no envía ningún sufijo, busca en su manual el código de configuración &laquo;Add CR suffix&raquo; o &laquo;Enter&raquo;.</>],
    ['Idioma del teclado', <>La pistola &laquo;teclea&raquo; según un idioma de teclado. Debe coincidir con el de Windows (normalmente <strong>Español – Latinoamérica</strong>). Si no coincide, guiones, diagonales y letras con acento salen cambiados. Usa la pestaña <Link href="/lector?vista=probar" className="text-clinico underline">Probar lector</Link>: si la etiqueta de prueba no se lee idéntica, escanea en el manual de la pistola el código de &laquo;Keyboard country: Latin America&raquo; (o cambia Windows a teclado EE. UU. en el equipo del lector).</>],
    ['Bloq Mayús apagado', <>Con Bloq Mayús encendido, muchas pistolas invierten mayúsculas y minúsculas. Los códigos EAN solo tienen números, pero los internos y GS1 pueden traer letras.</>],
    ['Códigos GS1 (DataMatrix)', <>Para leer lote y caducidad de los códigos 2D (DataMatrix GS1) se necesita una pistola de imagen 2D. Activa en su manual la transmisión de <strong>FNC1 como carácter GS (ASCII 29)</strong> para que el sistema separe correctamente lote y caducidad. Un código de barras lineal de caja (EAN-13) solo identifica el producto.</>],
    ['Lecturas repetidas', <>Si el gatillo dispara dos veces, la segunda lectura idéntica dentro de {(ventana / 1000).toLocaleString('es-MX')} s se ignora y se avisa. El administrador puede ajustar esa ventana en Configuración.</>],
    ['Sonido', <>La confirmación sonora es opcional y se activa por equipo con el botón de bocina en la pantalla Escanear. El navegador solo permite sonido después de que hayas hecho clic una vez en la página.</>],
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Seccion titulo="Configuración en 7 pasos">
        <ol className="flex flex-col gap-4">
          {pasos.map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-clinico-claro font-mono text-[13px] font-medium text-clinico">{i + 1}</span>
              <div><p className="font-semibold">{t}</p><p className="mt-0.5 text-[14px] leading-relaxed text-tenue">{d}</p></div>
            </li>
          ))}
        </ol>
      </Seccion>
      <Seccion titulo="Cómo usa el sistema cada lectura">
        <ul className="flex flex-col gap-3 text-[14px] leading-relaxed text-tenue">
          <li><strong className="text-tinta">Código vinculado:</strong> abre el producto con la presentación que identifica (por ejemplo, 1 caja = 6 ámpulas) y muestra sus advertencias.</li>
          <li><strong className="text-tinta">Código desconocido:</strong> te deja buscar el producto y vincularlo. Si eres auxiliar, queda como propuesta hasta que un encargado lo verifique.</li>
          <li><strong className="text-tinta">Clave del SIHO:</strong> si escaneas o escribes la clave interna, también encuentra el producto.</li>
          <li><strong className="text-tinta">En cualquier pantalla:</strong> la pistola funciona aunque no estés en el lector; si el cursor está en otro campo, la lectura no lo ensucia.</li>
          <li><strong className="text-tinta">EAN-13, UPC y GTIN-14</strong> de la misma caja se reconocen como el mismo código.</li>
        </ul>
      </Seccion>
    </div>
  );
}
