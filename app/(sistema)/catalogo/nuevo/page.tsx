import Link from 'next/link';
import { exigirUsuario } from '@/lib/servidor';
import { db } from '@/lib/db';
import { tienePermiso } from '@/lib/permisos';
import { Encabezado, Seccion } from '@/components/ui';
import { FormularioProducto } from '@/components/catalogo/FormularioProducto';

export const metadata = { title: 'Nuevo producto' };

export default async function NuevoProducto() {
  const u = await exigirUsuario('catalogo.editar');
  const unidades = (await (await db()).query<{ u: string }>('SELECT DISTINCT unidad_minima u FROM productos ORDER BY 1')).rows.map((x) => x.u);
  return (
    <>
      <Encabezado migas={<Link href="/catalogo" className="hover:text-clinico hover:underline">Catálogo</Link>} titulo="Nuevo producto"
        descripcion="Usa la misma clave que en el SIHO para poder cuadrar. Después de crearlo podrás agregar presentaciones, códigos y parámetros por área." />
      <Seccion titulo="Datos del producto">
        <FormularioProducto id={null} editable unidadesEnUso={unidades} />
      </Seccion>
    </>
  );
}
