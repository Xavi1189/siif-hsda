-- 002 · Ajustes del Responsable Sanitario (16/10/2026)
-- 1. "Cuadro básico" reemplaza a clasificación institucional y proveedor principal en la ficha del producto.
-- 2. Etiqueta nueva: Antibiótico.
-- 3. Electrolito concentrado deja de ser etiqueta propia: queda dentro de Alto riesgo.

ALTER TABLE productos ADD COLUMN cuadro_basico boolean NOT NULL DEFAULT false;
ALTER TABLE productos DROP COLUMN clasificacion;
ALTER TABLE productos DROP COLUMN proveedor_principal;

INSERT INTO etiquetas (codigo, nombre, descripcion, icono, tono, advertencia) VALUES
  ('ANTIBIOTICO', 'Antibiótico', 'Antimicrobiano sujeto a la política institucional de uso de antibióticos', 'pill', 'info', NULL)
ON CONFLICT (codigo) DO NOTHING;

UPDATE etiquetas
   SET descripcion = 'Medicamento de alto riesgo según la política institucional (incluye electrolitos concentrados)'
 WHERE codigo = 'ALTO_RIESGO';

-- Los productos que ya tenían Electrolito concentrado pasan a Alto riesgo
INSERT INTO producto_etiquetas (producto_id, etiqueta_id, nota, asignada_por)
SELECT pe.producto_id, ar.id, 'Electrolito concentrado (migrado)', pe.asignada_por
  FROM producto_etiquetas pe
  JOIN etiquetas ec ON ec.id = pe.etiqueta_id AND ec.codigo = 'ELECTROLITO_CONC'
  CROSS JOIN etiquetas ar
 WHERE ar.codigo = 'ALTO_RIESGO'
ON CONFLICT (producto_id, etiqueta_id) DO NOTHING;

UPDATE etiquetas SET activa = false WHERE codigo = 'ELECTROLITO_CONC';
