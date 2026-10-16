import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { configuracion } from '@/lib/config';
import { instalar } from '../acciones-sesion';
import { FormularioAcceso } from '@/components/FormularioAcceso';
import { PantallaAcceso } from '@/components/PantallaAcceso';
import { Aviso } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Instalación' };

export default async function Instalacion() {
  const hayUsuarios = (await (await db()).query('SELECT 1 FROM usuarios LIMIT 1')).rows.length > 0;
  if (hayUsuarios) redirect('/login');
  const c = await configuracion();
  const configurada = (process.env.SIIF_CLAVE_INSTALACION ?? '').length >= 16;
  return (
    <PantallaAcceso institucion={c.nombre_institucion} sistema={c.nombre_sistema} siglas={c.siglas} tieneLogo={c.tiene_logo}
      titulo="Primer administrador" subtitulo="Esta pantalla solo aparece mientras el sistema no tiene usuarios.">
      {!configurada ? (
        <Aviso tono="alerta" titulo="Falta la clave de instalación">
          Agrega la variable <code className="font-mono">SIIF_CLAVE_INSTALACION</code> (16 caracteres o más) en Vercel → Settings → Environment Variables,
          vuelve a desplegar y regresa a esta página.
        </Aviso>
      ) : (
        <FormularioAcceso accion={instalar} boton="Crear administrador y entrar"
          campos={[
            { name: 'clave', label: 'Clave de instalación', type: 'password', autoComplete: 'off', ayuda: 'La que guardaste en SIIF_CLAVE_INSTALACION.' },
            { name: 'nombre', label: 'Nombre completo', autoComplete: 'name' },
            { name: 'cargo', label: 'Cargo', required: false, placeholder: 'Jefe y Responsable Sanitario de Farmacia' },
            { name: 'usuario', label: 'Usuario', autoComplete: 'username', ayuda: 'Minúsculas, números, punto o guion. Ej.: javier.perez' },
            { name: 'contrasena', label: 'Contraseña', type: 'password', autoComplete: 'new-password', ayuda: '10 caracteres o más, con letras y números.' },
            { name: 'confirma', label: 'Confirma la contraseña', type: 'password', autoComplete: 'new-password' },
          ]}
          nota="Después de crearlo, borra SIIF_CLAVE_INSTALACION de Vercel. Esta pantalla deja de funcionar en cuanto existe un usuario." />
      )}
    </PantallaAcceso>
  );
}
