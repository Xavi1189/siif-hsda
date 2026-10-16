-- =====================================================================
-- SIIF · Migración 001 · Modelo de datos base
-- Todas las cantidades de inventario son ENTEROS en la unidad mínima
-- dispensable del producto (ampolleta, tableta, pieza…).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuración institucional (una sola fila)
-- ---------------------------------------------------------------------
CREATE TABLE configuracion (
  id                           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre_institucion           text NOT NULL DEFAULT 'Hospital San Diego de Alcalá',
  nombre_sistema               text NOT NULL DEFAULT 'Sistema Integral de Inventario Farmacéutico',
  siglas                       text NOT NULL DEFAULT 'SIIF',
  logo                         bytea,
  logo_tipo                    text CHECK (logo_tipo IS NULL OR logo_tipo IN ('image/png','image/jpeg','image/svg+xml','image/webp')),
  escaneo_ventana_duplicado_ms integer NOT NULL DEFAULT 1500 CHECK (escaneo_ventana_duplicado_ms BETWEEN 0 AND 10000),
  escaneo_sonido               boolean NOT NULL DEFAULT true,
  actualizado                  timestamptz NOT NULL DEFAULT now(),
  actualizado_por              uuid
);
INSERT INTO configuracion (id) VALUES (1);

-- ---------------------------------------------------------------------
-- Usuarios, sesiones y roles
-- ---------------------------------------------------------------------
CREATE TYPE rol_usuario AS ENUM
  ('administrador','responsable_sanitario','encargado','auxiliar','auditor','consulta');

CREATE TABLE usuarios (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario                 text NOT NULL UNIQUE CHECK (usuario ~ '^[a-z0-9._-]{3,40}$'),
  nombre                  text NOT NULL CHECK (length(trim(nombre)) BETWEEN 3 AND 120),
  cargo                   text,
  rol                     rol_usuario NOT NULL,
  hash_contrasena         text NOT NULL CHECK (hash_contrasena LIKE 'scrypt$%'),
  activo                  boolean NOT NULL DEFAULT true,
  debe_cambiar_contrasena boolean NOT NULL DEFAULT true,
  intentos_fallidos       integer NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta         timestamptz,
  ultimo_acceso           timestamptz,
  creado                  timestamptz NOT NULL DEFAULT now(),
  creado_por              uuid REFERENCES usuarios(id)
);

CREATE TABLE sesiones (
  token_hash   text PRIMARY KEY,              -- SHA-256 del token; el token en claro solo vive en la cookie
  usuario_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada       timestamptz NOT NULL DEFAULT now(),
  expira       timestamptz NOT NULL,          -- límite absoluto
  ultimo_uso   timestamptz NOT NULL DEFAULT now(),
  revocada     timestamptz,
  ip           text,
  agente       text
);
CREATE INDEX sesiones_usuario_idx ON sesiones (usuario_id);

-- ---------------------------------------------------------------------
-- Áreas y ubicaciones
-- ---------------------------------------------------------------------
CREATE TABLE areas (
  id       smallserial PRIMARY KEY,
  codigo   text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9_]{2,16}$'),
  nombre   text NOT NULL,
  virtual  boolean NOT NULL DEFAULT false,    -- p. ej. "En tránsito": no es un área física
  activa   boolean NOT NULL DEFAULT true
);

CREATE TYPE tipo_ubicacion AS ENUM
  ('anaquel','refrigerador','gaveta_controlados','carro_rojo','almacen','cuarentena','transito','otro');

CREATE TABLE ubicaciones (
  id              serial PRIMARY KEY,
  area_id         smallint NOT NULL REFERENCES areas(id),
  codigo          text NOT NULL CHECK (length(trim(codigo)) BETWEEN 1 AND 40),
  nombre          text NOT NULL,
  tipo            tipo_ubicacion NOT NULL DEFAULT 'anaquel',
  permite_surtido boolean NOT NULL DEFAULT true,  -- cuarentena y tránsito: false
  activa          boolean NOT NULL DEFAULT true,
  UNIQUE (area_id, codigo)
);

INSERT INTO areas (codigo, nombre) VALUES
  ('HOSP', 'Farmacia Hospitalaria (4to piso)'),
  ('URG',  'Farmacia de Urgencias');
INSERT INTO areas (codigo, nombre, virtual) VALUES ('TRANSITO', 'En tránsito', true);

INSERT INTO ubicaciones (area_id, codigo, nombre, tipo, permite_surtido)
SELECT id, 'TRANSITO', 'En tránsito entre áreas', 'transito', false FROM areas WHERE codigo = 'TRANSITO';
INSERT INTO ubicaciones (area_id, codigo, nombre, tipo, permite_surtido)
SELECT id, 'CUARENTENA', 'Cuarentena', 'cuarentena', false FROM areas WHERE codigo IN ('HOSP','URG');
INSERT INTO ubicaciones (area_id, codigo, nombre, tipo)
SELECT id, 'GENERAL', 'Ubicación general', 'anaquel' FROM areas WHERE codigo IN ('HOSP','URG');

CREATE TABLE usuario_areas (            -- si un usuario no tiene filas aquí, opera en todas las áreas
  usuario_id uuid     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  area_id    smallint NOT NULL REFERENCES areas(id),
  PRIMARY KEY (usuario_id, area_id)
);

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
CREATE TYPE tipo_producto   AS ENUM ('medicamento','dispositivo_medico','insumo');
CREATE TYPE estatus_producto AS ENUM ('activo','inactivo','descontinuado');

CREATE TABLE productos (
  id                   serial PRIMARY KEY,
  clave                text NOT NULL UNIQUE CHECK (clave ~ '^[A-Za-z0-9._-]{1,30}$'),
  tipo                 tipo_producto NOT NULL DEFAULT 'medicamento',
  descripcion          text NOT NULL CHECK (length(trim(descripcion)) >= 3),
  nombre_generico      text,
  nombre_comercial     text,
  concentracion        text,
  forma_farmaceutica   text,
  presentacion         text,
  unidad_minima        text NOT NULL CHECK (length(trim(unidad_minima)) >= 2),
  laboratorio          text,
  registro_sanitario   text,
  grupo_terapeutico    text,
  clasificacion        text,
  proveedor_principal  text,
  costo_unitario       numeric(14,4) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0), -- por unidad mínima, MXN
  controlado           boolean NOT NULL DEFAULT false,
  grupo_controlado     text CHECK (grupo_controlado IS NULL OR grupo_controlado IN ('I','II','III')),
  requiere_lote        boolean NOT NULL DEFAULT true,
  requiere_caducidad   boolean NOT NULL DEFAULT true,
  estatus              estatus_producto NOT NULL DEFAULT 'activo',
  origen               text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','siho')),
  creado               timestamptz NOT NULL DEFAULT now(),
  actualizado          timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid REFERENCES usuarios(id),
  busqueda             text GENERATED ALWAYS AS (
    upper(clave || ' ' || descripcion || ' ' || coalesce(nombre_generico,'') || ' ' ||
          coalesce(nombre_comercial,'') || ' ' || coalesce(laboratorio,''))
  ) STORED,
  CHECK (NOT (controlado = false AND grupo_controlado IS NOT NULL))
);
CREATE INDEX productos_busqueda_idx ON productos (busqueda);

-- Presentaciones: factor explícito de conversión a unidad mínima.
-- La unidad mínima misma tiene factor 1 y se crea automáticamente.
CREATE TABLE presentaciones (
  id           serial PRIMARY KEY,
  producto_id  integer NOT NULL REFERENCES productos(id),
  nombre       text NOT NULL CHECK (length(trim(nombre)) >= 2),
  factor       integer NOT NULL CHECK (factor BETWEEN 1 AND 100000),
  activa       boolean NOT NULL DEFAULT true,
  creado       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, nombre, factor)
);

CREATE TABLE codigos_barras (
  id              serial PRIMARY KEY,
  codigo          text NOT NULL CHECK (length(codigo) BETWEEN 4 AND 80),
  producto_id     integer NOT NULL REFERENCES productos(id),
  presentacion_id integer NOT NULL REFERENCES presentaciones(id),
  tipo            text NOT NULL CHECK (tipo IN ('GTIN','INTERNO','OTRO')),
  verificado      boolean NOT NULL DEFAULT false,   -- un vínculo propuesto por un auxiliar queda sin verificar
  activo          boolean NOT NULL DEFAULT true,
  creado          timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid REFERENCES usuarios(id),
  verificado_por  uuid REFERENCES usuarios(id),
  verificado_en   timestamptz
);
-- Un código activo identifica a un solo producto/presentación
CREATE UNIQUE INDEX codigos_barras_activo_uq ON codigos_barras (codigo) WHERE activo;
CREATE INDEX codigos_barras_producto_idx ON codigos_barras (producto_id);

-- La presentación del código debe pertenecer al mismo producto
CREATE FUNCTION siif_codigo_presentacion_valida() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM presentaciones p WHERE p.id = NEW.presentacion_id AND p.producto_id = NEW.producto_id) THEN
    RAISE EXCEPTION 'La presentación % no pertenece al producto %', NEW.presentacion_id, NEW.producto_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER codigos_barras_presentacion_trg BEFORE INSERT OR UPDATE ON codigos_barras
  FOR EACH ROW EXECUTE FUNCTION siif_codigo_presentacion_valida();

-- Etiquetas institucionales (LASA, alto riesgo, cadena fría…): siempre con texto e ícono, no solo color
CREATE TABLE etiquetas (
  id           smallserial PRIMARY KEY,
  codigo       text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9_]{2,24}$'),
  nombre       text NOT NULL,
  descripcion  text,
  icono        text NOT NULL DEFAULT 'tag',
  tono         text NOT NULL DEFAULT 'neutro' CHECK (tono IN ('neutro','alerta','peligro','info','frio')),
  advertencia  text,                      -- texto que se muestra al seleccionar o surtir
  activa       boolean NOT NULL DEFAULT true
);
INSERT INTO etiquetas (codigo, nombre, descripcion, icono, tono, advertencia) VALUES
  ('LASA', 'LASA', 'Nombre o aspecto parecido a otro medicamento (look-alike, sound-alike)', 'eye', 'alerta',
   'Medicamento LASA: verifica nombre, concentración y presentación antes de surtir.'),
  ('ALTO_RIESGO', 'Alto riesgo', 'Medicamento de alto riesgo según la política institucional', 'triangle-alert', 'peligro',
   'Medicamento de alto riesgo: aplica doble verificación según la política institucional.'),
  ('CADENA_FRIA', 'Cadena fría', 'Requiere refrigeración según ficha técnica', 'snowflake', 'frio',
   'Cadena fría: no dejar fuera de refrigeración; registra la hora de salida.'),
  ('ELECTROLITO_CONC', 'Electrolito concentrado', 'Electrolito concentrado (p. ej. KCl, NaCl hipertónico)', 'flask-conical', 'peligro',
   'Electrolito concentrado: almacenar separado y verificar dilución indicada.');

CREATE TABLE producto_etiquetas (
  producto_id  integer  NOT NULL REFERENCES productos(id),
  etiqueta_id  smallint NOT NULL REFERENCES etiquetas(id),
  nota         text,
  asignada     timestamptz NOT NULL DEFAULT now(),
  asignada_por uuid REFERENCES usuarios(id),
  PRIMARY KEY (producto_id, etiqueta_id)
);

-- Parámetros por producto y área (máximos, mínimos, reorden, ubicación)
CREATE TABLE parametros_area (
  producto_id               integer  NOT NULL REFERENCES productos(id),
  area_id                   smallint NOT NULL REFERENCES areas(id),
  ubicacion_predeterminada  integer REFERENCES ubicaciones(id),
  ubicacion_siho            text,
  minimo                    integer CHECK (minimo >= 0),
  maximo                    integer CHECK (maximo >= 0),
  punto_reorden             integer CHECK (punto_reorden >= 0),
  stock_seguridad           integer CHECK (stock_seguridad >= 0),
  tiempo_entrega_dias       integer CHECK (tiempo_entrega_dias BETWEEN 0 AND 365),
  maneja_en_area            boolean NOT NULL DEFAULT true,
  actualizado               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, area_id),
  CHECK (minimo IS NULL OR maximo IS NULL OR maximo >= minimo)
);

-- ---------------------------------------------------------------------
-- Lotes y existencias
-- ---------------------------------------------------------------------
CREATE TABLE lotes (
  id           serial PRIMARY KEY,
  producto_id  integer NOT NULL REFERENCES productos(id),
  numero_lote  text NOT NULL CHECK (length(trim(numero_lote)) BETWEEN 1 AND 40),
  caducidad    date,
  estatus      text NOT NULL DEFAULT 'liberado' CHECK (estatus IN ('liberado','cuarentena','bloqueado')),
  creado       timestamptz NOT NULL DEFAULT now(),
  creado_por   uuid REFERENCES usuarios(id),
  UNIQUE NULLS NOT DISTINCT (producto_id, numero_lote, caducidad)
);
CREATE INDEX lotes_caducidad_idx ON lotes (caducidad);

-- Saldo por ubicación y lote. SOLO se modifica desde el trigger de movimientos.
CREATE TABLE existencias (
  ubicacion_id integer NOT NULL REFERENCES ubicaciones(id),
  lote_id      integer NOT NULL REFERENCES lotes(id),
  producto_id  integer NOT NULL REFERENCES productos(id),
  cantidad     integer NOT NULL CHECK (cantidad >= 0),
  actualizado  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ubicacion_id, lote_id)
);
CREATE INDEX existencias_producto_idx ON existencias (producto_id);

-- ---------------------------------------------------------------------
-- Operaciones y movimientos (kárdex inmutable)
-- ---------------------------------------------------------------------
CREATE TYPE naturaleza_concepto AS ENUM ('entrada','salida','ajuste','transferencia','inicial','reversa');

CREATE TABLE conceptos (
  id                      smallserial PRIMARY KEY,
  codigo                  text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9_]{2,32}$'),
  nombre                  text NOT NULL,
  naturaleza              naturaleza_concepto NOT NULL,
  requiere_autorizacion   boolean NOT NULL DEFAULT false,
  requiere_referencia     boolean NOT NULL DEFAULT false,
  activo                  boolean NOT NULL DEFAULT true
);
INSERT INTO conceptos (codigo, nombre, naturaleza, requiere_autorizacion, requiere_referencia) VALUES
  ('INV_INICIAL',      'Inventario inicial (conteo físico)', 'inicial',       true,  true),
  ('COMPRA',           'Entrada por compra',                 'entrada',       false, true),
  ('RECEPCION_PROV',   'Recepción de proveedor',             'entrada',       false, true),
  ('DEVOLUCION_SERV',  'Devolución de servicio o paciente',   'entrada',       false, false),
  ('AJUSTE_ENTRADA',   'Ajuste positivo autorizado',         'ajuste',        true,  true),
  ('SURTIDO',          'Surtido a servicio o paciente',      'salida',        false, false),
  ('CONSUMO',          'Consumo interno',                    'salida',        false, false),
  ('DEVOLUCION_PROV',  'Devolución a proveedor',             'salida',        true,  true),
  ('MERMA',            'Merma',                              'salida',        true,  false),
  ('CADUCIDAD',        'Baja por caducidad',                 'salida',        true,  true),
  ('AJUSTE_SALIDA',    'Ajuste negativo autorizado',         'ajuste',        true,  true),
  ('TRANSF_SALIDA',    'Transferencia: salida de origen',    'transferencia', true,  true),
  ('TRANSF_ENTRADA',   'Transferencia: recepción en destino','transferencia', false, true),
  ('REVERSA',          'Reversa de operación',               'reversa',       true,  true);

CREATE TABLE operaciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio               bigserial UNIQUE,
  clave_idempotencia  uuid NOT NULL UNIQUE,       -- evita registrar dos veces la misma captura
  concepto_id         smallint NOT NULL REFERENCES conceptos(id),
  area_id             smallint NOT NULL REFERENCES areas(id),
  referencia          text,
  destino             text,                        -- servicio, cama o folio de receta (sin datos clínicos)
  observaciones       text,
  usuario_id          uuid NOT NULL REFERENCES usuarios(id),
  registrada          timestamptz NOT NULL DEFAULT now(),
  autorizada_por      uuid REFERENCES usuarios(id),
  autorizada_en       timestamptz,
  revierte_a          uuid UNIQUE REFERENCES operaciones(id),   -- una operación solo se revierte una vez
  CHECK ((autorizada_por IS NULL) = (autorizada_en IS NULL)),
  CHECK (revierte_a IS NULL OR revierte_a <> id)
);

CREATE TABLE movimientos (
  id              bigserial PRIMARY KEY,
  operacion_id    uuid    NOT NULL REFERENCES operaciones(id),
  ubicacion_id    integer NOT NULL REFERENCES ubicaciones(id),
  lote_id         integer NOT NULL REFERENCES lotes(id),
  producto_id     integer NOT NULL REFERENCES productos(id),
  cantidad        integer NOT NULL CHECK (cantidad <> 0),   -- con signo, en unidad mínima
  costo_unitario  numeric(14,4) CHECK (costo_unitario >= 0),
  creado          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_operacion_idx ON movimientos (operacion_id);
CREATE INDEX movimientos_producto_idx  ON movimientos (producto_id, creado);
CREATE INDEX movimientos_lote_idx      ON movimientos (lote_id);

-- Inmutabilidad: ni UPDATE ni DELETE ni TRUNCATE sobre el kárdex.
CREATE FUNCTION siif_bloquear_cambios() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo agregar: registra una reversa en lugar de modificar o borrar', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER operaciones_inmutable  BEFORE UPDATE OR DELETE ON operaciones FOR EACH ROW EXECUTE FUNCTION siif_bloquear_cambios();
CREATE TRIGGER movimientos_inmutable  BEFORE UPDATE OR DELETE ON movimientos FOR EACH ROW EXECUTE FUNCTION siif_bloquear_cambios();
CREATE TRIGGER operaciones_no_truncar BEFORE TRUNCATE ON operaciones FOR EACH STATEMENT EXECUTE FUNCTION siif_bloquear_cambios();
CREATE TRIGGER movimientos_no_truncar BEFORE TRUNCATE ON movimientos FOR EACH STATEMENT EXECUTE FUNCTION siif_bloquear_cambios();

-- Cada movimiento actualiza el saldo en la misma transacción.
-- Si el saldo quedaría negativo, la restricción CHECK aborta TODA la operación.
CREATE FUNCTION siif_aplicar_movimiento() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_prod integer;
BEGIN
  SELECT producto_id INTO v_prod FROM lotes WHERE id = NEW.lote_id;
  IF v_prod IS DISTINCT FROM NEW.producto_id THEN
    RAISE EXCEPTION 'El lote % no pertenece al producto %', NEW.lote_id, NEW.producto_id USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('siif.desde_movimiento', '1', true);
  BEGIN
    -- UPDATE bloquea el renglón: dos salidas simultáneas del mismo lote se aplican una tras otra
    UPDATE existencias SET cantidad = cantidad + NEW.cantidad, actualizado = now()
     WHERE ubicacion_id = NEW.ubicacion_id AND lote_id = NEW.lote_id;
    IF NOT FOUND THEN
      IF NEW.cantidad < 0 THEN
        RAISE EXCEPTION 'sin saldo' USING ERRCODE = 'check_violation';
      END IF;
      INSERT INTO existencias AS e (ubicacion_id, lote_id, producto_id, cantidad, actualizado)
      VALUES (NEW.ubicacion_id, NEW.lote_id, NEW.producto_id, NEW.cantidad, now())
      ON CONFLICT (ubicacion_id, lote_id)
      DO UPDATE SET cantidad = e.cantidad + EXCLUDED.cantidad, actualizado = now();
    END IF;
  EXCEPTION WHEN check_violation THEN
    PERFORM set_config('siif.desde_movimiento', '0', true);
    RAISE EXCEPTION 'Existencia insuficiente: el movimiento dejaría saldo negativo (producto %, lote %, ubicación %)',
      NEW.producto_id, NEW.lote_id, NEW.ubicacion_id USING ERRCODE = 'check_violation';
  END;
  PERFORM set_config('siif.desde_movimiento', '0', true);
  RETURN NEW;
END $$;
CREATE TRIGGER movimientos_aplicar AFTER INSERT ON movimientos FOR EACH ROW EXECUTE FUNCTION siif_aplicar_movimiento();

-- Las existencias no se escriben a mano: solo a través de movimientos.
CREATE FUNCTION siif_proteger_existencias() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('siif.desde_movimiento', true), '0') <> '1' THEN
    RAISE EXCEPTION 'Las existencias solo cambian mediante movimientos registrados' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER existencias_protegidas BEFORE INSERT OR UPDATE OR DELETE ON existencias
  FOR EACH ROW EXECUTE FUNCTION siif_proteger_existencias();

-- Conciliación: compara el saldo guardado con la suma del kárdex. Debe devolver cero filas.
CREATE FUNCTION siif_verificar_existencias()
RETURNS TABLE (ubicacion_id integer, lote_id integer, saldo_guardado integer, saldo_kardex bigint)
LANGUAGE sql STABLE AS $$
  WITH k AS (SELECT m.ubicacion_id, m.lote_id, sum(m.cantidad) AS s FROM movimientos m GROUP BY 1, 2)
  SELECT coalesce(e.ubicacion_id, k.ubicacion_id), coalesce(e.lote_id, k.lote_id), e.cantidad, k.s
  FROM existencias e FULL JOIN k ON k.ubicacion_id = e.ubicacion_id AND k.lote_id = e.lote_id
  WHERE coalesce(e.cantidad, 0) <> coalesce(k.s, 0);
$$;

-- ---------------------------------------------------------------------
-- Transferencias (lógica en Fase 3)
-- ---------------------------------------------------------------------
CREATE TYPE estado_transferencia AS ENUM ('solicitada','autorizada','enviada','recibida','cancelada');
CREATE TABLE transferencias (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             bigserial UNIQUE,
  area_origen       smallint NOT NULL REFERENCES areas(id),
  area_destino      smallint NOT NULL REFERENCES areas(id),
  estado            estado_transferencia NOT NULL DEFAULT 'solicitada',
  solicitada_por    uuid NOT NULL REFERENCES usuarios(id),
  solicitada_en     timestamptz NOT NULL DEFAULT now(),
  autorizada_por    uuid REFERENCES usuarios(id),
  autorizada_en     timestamptz,
  operacion_salida  uuid UNIQUE REFERENCES operaciones(id),
  operacion_entrada uuid UNIQUE REFERENCES operaciones(id),
  recibida_por      uuid REFERENCES usuarios(id),
  recibida_en       timestamptz,
  observaciones     text,
  CHECK (area_origen <> area_destino)
);
CREATE TABLE transferencia_renglones (
  id                  serial PRIMARY KEY,
  transferencia_id    uuid NOT NULL REFERENCES transferencias(id),
  producto_id         integer NOT NULL REFERENCES productos(id),
  cantidad_solicitada integer NOT NULL CHECK (cantidad_solicitada > 0),
  UNIQUE (transferencia_id, producto_id)
);

-- ---------------------------------------------------------------------
-- Inventarios físicos (lógica en Fase 4)
-- ---------------------------------------------------------------------
CREATE TYPE estado_conteo AS ENUM ('abierto','en_revision','autorizado','aplicado','cancelado');
CREATE TABLE conteos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             bigserial UNIQUE,
  area_id           smallint NOT NULL REFERENCES areas(id),
  alcance           text NOT NULL,              -- área completa, ubicación, categoría…
  doble_conteo      boolean NOT NULL DEFAULT false,
  estado            estado_conteo NOT NULL DEFAULT 'abierto',
  creado_por        uuid NOT NULL REFERENCES usuarios(id),
  creado            timestamptz NOT NULL DEFAULT now(),
  autorizado_por    uuid REFERENCES usuarios(id),
  autorizado_en     timestamptz,
  operacion_ajuste  uuid UNIQUE REFERENCES operaciones(id),  -- se aplica una sola vez
  justificacion     text
);
CREATE TABLE conteo_renglones (
  id            bigserial PRIMARY KEY,
  conteo_id     uuid NOT NULL REFERENCES conteos(id),
  ronda         smallint NOT NULL DEFAULT 1 CHECK (ronda IN (1, 2)),
  ubicacion_id  integer NOT NULL REFERENCES ubicaciones(id),
  lote_id       integer NOT NULL REFERENCES lotes(id),
  cantidad      integer NOT NULL CHECK (cantidad >= 0),
  usuario_id    uuid NOT NULL REFERENCES usuarios(id),
  capturado     timestamptz NOT NULL DEFAULT now(),
  clave_idempotencia uuid NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- Bitácora de auditoría (solo agregar)
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
  id          bigserial PRIMARY KEY,
  momento     timestamptz NOT NULL DEFAULT now(),
  usuario_id  uuid REFERENCES usuarios(id),
  accion      text NOT NULL,
  entidad     text,
  entidad_id  text,
  detalle     jsonb,
  ip          text
);
CREATE INDEX auditoria_momento_idx ON auditoria (momento DESC);
CREATE INDEX auditoria_entidad_idx ON auditoria (entidad, entidad_id);
CREATE TRIGGER auditoria_inmutable  BEFORE UPDATE OR DELETE ON auditoria FOR EACH ROW EXECUTE FUNCTION siif_bloquear_cambios();
CREATE TRIGGER auditoria_no_truncar BEFORE TRUNCATE ON auditoria FOR EACH STATEMENT EXECUTE FUNCTION siif_bloquear_cambios();
