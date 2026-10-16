import { notFound } from 'next/navigation';
import { Construction } from 'lucide-react';
import { exigirUsuario } from '@/lib/servidor';
import { Aviso, Encabezado, Seccion } from '@/components/ui';

/** Módulos de fases posteriores: se muestran tal cual, sin datos ficticios. */
const MODULOS: Record<string, { titulo: string; fase: number; resumen: string; funciones: string[] }> = {
  recepciones: { titulo: 'Recepciones', fase: 3, resumen: 'Recepción de proveedor contra orden o factura.', funciones: ['Escaneo de cajas con conversión a unidad mínima', 'Captura obligatoria de lote y caducidad (o lectura GS1)', 'Diferencias contra la factura: faltantes, sobrantes y lotes distintos', 'Envío a cuarentena cuando aplique', 'Entrada al kárdex en una sola transacción'] },
  entradas: { titulo: 'Entradas', fase: 3, resumen: 'Entradas por compra, devolución, ajuste autorizado y conceptos configurables.', funciones: ['Conceptos con autorización y referencia obligatorias', 'Clave de idempotencia contra dobles registros', 'Reversa auditada en lugar de borrar'] },
  salidas: { titulo: 'Salidas', fase: 3, resumen: 'Surtido, consumo, merma, caducidad y devoluciones.', funciones: ['FEFO sugerido con advertencia si se elige otro lote', 'Bloqueo de lotes vencidos o en cuarentena', 'Sin inventario negativo (regla de la base de datos)', 'Advertencias LASA y alto riesgo al surtir'] },
  transferencias: { titulo: 'Transferencias', fase: 3, resumen: 'Movimientos entre Farmacia Hospitalaria y Urgencias.', funciones: ['Solicitud → autorización → envío → recepción', 'Paso por la ubicación virtual En tránsito: nunca se duplica la existencia', 'Recepción con diferencias registradas'] },
  'inventario-fisico': { titulo: 'Inventario físico', fase: 4, resumen: 'Conteos por área, ubicación, producto o categoría.', funciones: ['Captura con lector, lote y caducidad', 'Doble conteo opcional', 'Comparación teórico vs. físico y autorización antes de ajustar', 'Aplicación única del ajuste', 'Cuadre contra cortes del SIHO'] },
  caducidades: { titulo: 'Caducidades', fase: 3, resumen: 'Tablero de vencidos y próximos a caducar.', funciones: ['Rangos configurables (30, 60, 90, 180 días)', 'Bloqueo de surtido de lotes vencidos', 'Reportes de retiro, cuarentena, devolución o disposición'] },
  controlados: { titulo: 'Controlados', fase: 4, resumen: 'Control auxiliar por unidad dispensable real.', funciones: ['Movimientos por ampolleta o pieza, lote, usuario, motivo y destino', 'Conciliaciones y alertas de discrepancia', 'Acceso restringido', 'No sustituye libros oficiales, recetas ni requisitos de COFEPRIS'] },
  'cadena-fria': { titulo: 'Cadena fría', fase: 4, resumen: 'Registro de temperaturas por refrigerador.', funciones: ['Rangos configurados por ubicación según ficha técnica y política institucional', 'Excursiones con acción correctiva y evidencia'] },
  reabastecimiento: { titulo: 'Reabastecimiento', fase: 4, resumen: 'Alertas de punto de reorden y sugerencia de compra.', funciones: ['Consumo, existencia, pedidos pendientes, tiempo de entrega y stock de seguridad', 'Productos en riesgo de desabasto', 'Sin compras automáticas: siempre con autorización'] },
  reportes: { titulo: 'Reportes', fase: 5, resumen: 'Reportes y exportaciones institucionales.', funciones: ['Existencias, kárdex por producto y lote, entradas y salidas', 'Caducidades, controlados, LASA y alto riesgo', 'Excel/CSV y PDF con encabezado, filtros y responsables', 'Totales que cuadran con el kárdex'] },
};

export async function generateMetadata({ params }: { params: Promise<{ seccion: string }> }) {
  return { title: MODULOS[(await params).seccion]?.titulo ?? 'SIIF' };
}

export default async function Seccion_({ params }: { params: Promise<{ seccion: string }> }) {
  await exigirUsuario();
  const m = MODULOS[(await params).seccion];
  if (!m) notFound();
  return (
    <>
      <Encabezado titulo={m.titulo} descripcion={m.resumen} />
      <Aviso tono="info" titulo={`Módulo de la Fase ${m.fase}`}>Aún no está habilitado. La base de datos ya tiene las reglas de integridad que usará (kárdex inmutable, saldos sin negativos, lotes únicos).</Aviso>
      <Seccion titulo="Qué incluirá" className="mt-5">
        <ul className="flex flex-col gap-2 text-[14px]">
          {m.funciones.map((f) => <li key={f} className="flex gap-2"><Construction size={16} aria-hidden className="mt-0.5 shrink-0 text-marino-300" />{f}</li>)}
        </ul>
      </Seccion>
    </>
  );
}
