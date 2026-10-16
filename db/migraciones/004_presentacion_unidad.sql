-- 004 · Permite presentaciones con una sola unidad (p. ej. CAJA con 1 ampolleta), 16/10/2026.
-- Hasta ahora la unidad mínima se identificaba por factor = 1; ahora se marca de forma explícita.
ALTER TABLE presentaciones ADD COLUMN es_unidad boolean NOT NULL DEFAULT false;
UPDATE presentaciones SET es_unidad = true WHERE factor = 1;
ALTER TABLE presentaciones ADD CONSTRAINT presentacion_unidad_factor CHECK (NOT es_unidad OR factor = 1);
CREATE UNIQUE INDEX presentaciones_una_unidad ON presentaciones (producto_id) WHERE es_unidad;
