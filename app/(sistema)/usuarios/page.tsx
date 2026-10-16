import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/servidor';
import { NOMBRE_ROL, PERMISOS, ROLES, permisosDe, tienePermiso, type Permiso } from '@/lib/permisos';
import { Encabezado, Seccion } from '@/components/ui';
import { GestionUsuarios, type FilaUsuario } from '@/components/admin/Usuarios';
import { Check, Minus } from 'lucide-react';

export const metadata = { title: 'Usuarios' };

export default async function Usuarios() {
  const u = await exigirUsuario();
  if (!tienePermiso(u.rol, 'usuarios.administrar')) {
    if (tienePermiso(u.rol, 'auditoria.ver')) redirect('/usuarios/bitacora');
    redirect('/?sin-permiso=usuarios.administrar');
  }
  const filas = (await (await db()).query<FilaUsuario>(
    `SELECT id, usuario, nombre, cargo, rol, activo, ultimo_acceso, (bloqueado_hasta > now()) AS bloqueado, debe_cambiar_contrasena AS debe_cambiar
       FROM usuarios ORDER BY activo DESC, nombre`)).rows;
  const permisos = Object.keys(PERMISOS) as Permiso[];
  return (
    <>
      <Encabezado titulo="Usuarios y roles" descripcion="Cada persona entra con su propio usuario; así cada movimiento queda ligado a quien lo hizo."
        acciones={<Link href="/usuarios/bitacora" className="btn-secundario">Bitácora de auditoría</Link>} />
      <GestionUsuarios usuarios={filas} yo={u.id} soyAdmin={u.rol === 'administrador'} />
      <Seccion titulo="Qué puede hacer cada rol" className="mt-5" descripcion="Permisos mínimos por rol. Se validan en el servidor en cada acción, no solo en pantalla.">
        <div className="overflow-x-auto">
          <table className="tabla min-w-[760px]">
            <thead><tr><th>Permiso</th>{ROLES.map((r) => <th key={r} className="text-center">{NOMBRE_ROL[r].replace(' de farmacia', '').replace(' del sistema', '')}</th>)}</tr></thead>
            <tbody>
              {permisos.map((p) => (
                <tr key={p}>
                  <td className="text-[13px]">{PERMISOS[p]}</td>
                  {ROLES.map((r) => <td key={r} className="text-center">{permisosDe(r).includes(p)
                    ? <Check size={16} className="inline text-teal" aria-label="Sí" /> : <Minus size={16} className="inline text-linea" aria-label="No" />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </>
  );
}
