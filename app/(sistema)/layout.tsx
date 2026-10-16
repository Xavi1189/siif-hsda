import { exigirUsuario } from '@/lib/servidor';
import { configuracion } from '@/lib/config';
import { NOMBRE_ROL, tienePermiso } from '@/lib/permisos';
import { fechaLarga } from '@/lib/formato';
import { Shell, type ItemNav } from '@/components/Shell';
import { BusquedaRapida } from '@/components/BusquedaRapida';
import { cerrarSesion } from '../acciones-sesion';

export const dynamic = 'force-dynamic';

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const c = await configuracion();
  const nav: ItemNav[] = [
    { href: '/', texto: 'Dashboard', icono: 'dashboard', grupo: 'General' },
    { href: '/catalogo', texto: 'Catálogo', icono: 'catalogo', grupo: 'General' },
    ...(tienePermiso(u.rol, 'lector.usar') ? [{ href: '/lector', texto: 'Lector de códigos', icono: 'lector', grupo: 'General' } as ItemNav] : []),
    { href: '/recepciones', texto: 'Recepciones', icono: 'recepciones', fase: 3, grupo: 'Operación' },
    { href: '/entradas', texto: 'Entradas', icono: 'entradas', fase: 3, grupo: 'Operación' },
    { href: '/salidas', texto: 'Salidas', icono: 'salidas', fase: 3, grupo: 'Operación' },
    { href: '/transferencias', texto: 'Transferencias', icono: 'transferencias', fase: 3, grupo: 'Operación' },
    { href: '/inventario-fisico', texto: 'Inventario físico', icono: 'inventario', fase: 4, grupo: 'Operación' },
    { href: '/caducidades', texto: 'Caducidades', icono: 'caducidades', fase: 3, grupo: 'Control' },
    { href: '/controlados', texto: 'Controlados', icono: 'controlados', fase: 4, grupo: 'Control' },
    { href: '/cadena-fria', texto: 'Cadena fría', icono: 'cadena', fase: 4, grupo: 'Control' },
    { href: '/reabastecimiento', texto: 'Reabastecimiento', icono: 'reabasto', fase: 4, grupo: 'Control' },
    { href: '/reportes', texto: 'Reportes', icono: 'reportes', fase: 5, grupo: 'Control' },
    ...(tienePermiso(u.rol, 'usuarios.administrar') || tienePermiso(u.rol, 'auditoria.ver')
      ? [{ href: '/usuarios', texto: tienePermiso(u.rol, 'usuarios.administrar') ? 'Usuarios' : 'Bitácora', icono: 'usuarios', grupo: 'Administración' } as ItemNav] : []),
    ...(tienePermiso(u.rol, 'configuracion.editar') ? [{ href: '/configuracion', texto: 'Configuración', icono: 'configuracion', grupo: 'Administración' } as ItemNav] : []),
  ];
  return (
    <Shell nav={nav} institucion={c.nombre_institucion} siglas={c.siglas} tieneLogo={c.tiene_logo} usuario={u.nombre} rol={NOMBRE_ROL[u.rol]}
      fecha={fechaLarga()} salir={cerrarSesion}
      busqueda={tienePermiso(u.rol, 'catalogo.ver') ? <BusquedaRapida ventanaMs={c.escaneo_ventana_duplicado_ms} sonidoPredeterminado={c.escaneo_sonido} /> : null}>
      {children}
    </Shell>
  );
}
