import { redirect } from 'next/navigation';
import { configuracion } from '@/lib/config';
import { usuarioActual } from '@/lib/servidor';
import { cambiarContrasena, cerrarSesion } from '../acciones-sesion';
import { FormularioAcceso } from '@/components/FormularioAcceso';
import { PantallaAcceso } from '@/components/PantallaAcceso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cambiar contraseña' };

export default async function CambiarContrasena() {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  const c = await configuracion();
  return (
    <PantallaAcceso institucion={c.nombre_institucion} sistema={c.nombre_sistema} siglas={c.siglas} tieneLogo={c.tiene_logo}
      titulo="Cambia tu contraseña"
      subtitulo={u.debe_cambiar_contrasena ? `${u.nombre}, tu contraseña es temporal. Elige una nueva para continuar.` : 'Las demás sesiones abiertas con tu usuario se cerrarán.'}>
      <FormularioAcceso accion={cambiarContrasena} boton="Guardar contraseña"
        campos={[
          { name: 'actual', label: u.debe_cambiar_contrasena ? 'Contraseña temporal' : 'Contraseña actual', type: 'password', autoComplete: 'current-password' },
          { name: 'nueva', label: 'Nueva contraseña', type: 'password', autoComplete: 'new-password', ayuda: '10 caracteres o más, con letras y números, sin tu usuario.' },
          { name: 'confirma', label: 'Confirma la nueva contraseña', type: 'password', autoComplete: 'new-password' },
        ]} />
      <form action={cerrarSesion} className="mt-4"><button className="btn-fantasma btn-chico">Salir sin cambiar</button></form>
    </PantallaAcceso>
  );
}
