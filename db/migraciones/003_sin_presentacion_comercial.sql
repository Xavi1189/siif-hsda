-- 003 · Se retira "Presentación comercial" de la ficha del producto (16/10/2026).
-- Las presentaciones con su factor (caja c/6, etc.) siguen en la tabla presentaciones.
ALTER TABLE productos DROP COLUMN presentacion;
