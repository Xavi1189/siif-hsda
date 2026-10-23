-- 005 · La clave interna del SIHO puede quedar en blanco (medicamentos que aún no tienen clave), 23/10/2026.
-- Sigue siendo única cuando existe; varios productos pueden no tenerla.
ALTER TABLE productos ALTER COLUMN clave DROP NOT NULL;

-- La columna de búsqueda concatenaba la clave; con clave vacía quedaría nula
DROP INDEX IF EXISTS productos_busqueda_idx;
ALTER TABLE productos DROP COLUMN busqueda;
ALTER TABLE productos ADD COLUMN busqueda text GENERATED ALWAYS AS (
  upper(coalesce(clave, '') || ' ' || descripcion || ' ' || coalesce(nombre_generico, '') || ' ' ||
        coalesce(nombre_comercial, '') || ' ' || coalesce(laboratorio, ''))
) STORED;
CREATE INDEX productos_busqueda_idx ON productos (busqueda);
