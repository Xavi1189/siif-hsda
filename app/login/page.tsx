import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { configuracion } from '@/lib/config';
import { usuarioActual } from '@/lib/servidor';
import { iniciarSesion } from '../acciones-sesion';
import { FormularioAcceso } from '@/components/FormularioAcceso';
import { PantallaAcceso } from '@/components/PantallaAcceso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Iniciar sesión' };

export default async function Login() {
  if (await usuarioActual()) redirect('/');
  const hayUsuarios = (await (await db()).query('SELECT 1 FROM usuarios LIMIT 1')).rows.length > 0;
  if (!hayUsuarios) redirect('/instalacion');
  const c = await configuracion();
  return (
    <PantallaAcceso institucion={c.nombre_institucion} sistema={c.nombre_sistema} siglas={c.siglas} tieneLogo={c.tiene_logo}
      titulo="Iniciar sesión" subtitulo="Usa el usuario que te asignó el administrador.">
      <FormularioAcceso accion={iniciarSesion} boton="Entrar"
        campos={[
          { name: 'usuario', label: 'Usuario', autoComplete: 'username', placeholder: 'nombre.apellido' },
          { name: 'contrasena', label: 'Contraseña', type: 'password', autoComplete: 'current-password' },
        ]}
        nota="¿Olvidaste tu contraseña? Un administrador o el Responsable Sanitario puede restablecerla desde Usuarios." />
    </PantallaAcceso>
  );
}
