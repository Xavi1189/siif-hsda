import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/servidor';
import { configuracion } from '@/lib/config';
import { tienePermiso } from '@/lib/permisos';
import { Aviso, Encabezado, EtiquetaProducto, Seccion } from '@/components/ui';
import { FormInstitucion, FormLogo, ImportarSiho, Ubicaciones } from '@/components/admin/Configuracion';

export const metadata = { title: 'Configuración' };

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ bienvenida?: string }> }) {
  const u = await exigirUsuario('configuracion.editar');
  const sp = await searchParams;
  const c = await configuracion();
  const conn = await db();
  const [areas, ubicaciones, etiquetas, productos] = await Promise.all([
    conn.query<{ id: number; nombre: string }>('SELECT id, nombre FROM areas WHERE NOT virtual AND activa ORDER BY id'),
    conn.query<{ id: number; area_id: number; codigo: string; nombre: string; tipo: string; activa: boolean; permite_surtido: boolean }>(
      `SELECT u.id, u.area_id, u.codigo, u.nombre, u.tipo, u.activa, u.permite_surtido FROM ubicaciones u JOIN areas a ON a.id = u.area_id WHERE NOT a.virtual ORDER BY u.area_id, u.codigo`),
    conn.query<{ codigo: string; nombre: string; icono: string; tono: string; descripcion: string | null }>('SELECT codigo, nombre, icono, tono, descripcion FROM etiquetas WHERE activa ORDER BY id'),
    conn.query<{ n: number }>('SELECT count(*)::int n FROM productos'),
  ]);
  return (
    <>
      <Encabezado titulo="Configuración" descripcion="Identidad institucional, lector, ubicaciones y carga del catálogo. Todos los cambios quedan en la bitácora." />
      {sp.bienvenida && <div className="mb-5"><Aviso tono="exito" titulo="Administrador creado">Empieza importando el catálogo del SIHO y después da de alta al equipo en Usuarios. Recuerda borrar SIIF_CLAVE_INSTALACION de Vercel.</Aviso></div>}
      <div className="grid gap-5 xl:grid-cols-2">
        <Seccion titulo="Institución y lector"><FormInstitucion inicial={c} /></Seccion>
        <Seccion titulo="Logotipo" descripcion="Aparece en el menú, en la pantalla de acceso y en los reportes."><FormLogo tieneLogo={c.tiene_logo} version={c.actualizado} /></Seccion>
        <div id="catalogo" className="xl:col-span-2"><Seccion titulo="Catálogo inicial del SIHO"><ImportarSiho productos={productos.rows[0].n} puede={tienePermiso(u.rol, 'catalogo.importar')} /></Seccion></div>
        <Seccion titulo="Áreas y ubicaciones" className="xl:col-span-2" descripcion="Anaqueles, refrigeradores, gavetas y almacenes de cada farmacia. Cuarentena no permite surtir. Las ubicaciones no se borran: se desactivan.">
          <Ubicaciones areas={areas.rows} ubicaciones={ubicaciones.rows} />
        </Seccion>
        <Seccion titulo="Etiquetas institucionales" className="xl:col-span-2" descripcion="Se asignan en la ficha de cada producto. La edición de etiquetas personalizadas llega en la Fase 4.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {etiquetas.rows.map((e) => <li key={e.codigo} className="flex flex-col gap-1 rounded-md border border-linea p-3"><EtiquetaProducto e={e} /><span className="text-[13px] text-tenue">{e.descripcion}</span></li>)}
          </ul>
        </Seccion>
      </div>
    </>
  );
}
