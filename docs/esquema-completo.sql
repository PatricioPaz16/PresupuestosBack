-- =====================================================================================
--  PRESUPUESTOS DE TALLER — ESQUEMA COMPLETO (PostgreSQL 14 o superior, probado en 16)
--
--  Crea toda la base en una base de datos VACÍA, en un solo paso:
--    psql -U postgres -d presupuestos -v ON_ERROR_STOP=1 -f esquema-completo.sql
--  o desde pgAdmin > Query Tool (abrir el archivo y ejecutar).
--  Corre dentro de una transacción: si algo falla, no queda nada a medias.
--
--  Es la suma de las dos migraciones del proyecto:
--    1. InitialSchema            usuarios, roles, permisos y sesiones (autenticación)
--    2. TalleresPresupuestos     talleres, clientes, vehículos, catálogo, presupuestos,
--                                triggers de totales y numeración, Row Level Security
--  Al final las registra en la tabla de migraciones de TypeORM, así la API no intenta
--  volver a aplicarlas cuando arranca.
--
--  La API no necesita este archivo: aplica las migraciones sola al arrancar. Sirve para
--  leer el modelo completo o crear la base a mano. Cualquier cambio de esquema se hace
--  con una migración nueva, no editando este archivo.
-- =====================================================================================

BEGIN;


-- =====================================================================================
--  PARTE 1 — AUTENTICACIÓN (migración InitialSchema1747400000000)
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "roles" (
  "id" SERIAL NOT NULL,
  "name" character varying NOT NULL,
  CONSTRAINT "UQ_roles_name" UNIQUE ("name"),
  CONSTRAINT "PK_roles" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "permissions" (
  "id" SERIAL NOT NULL,
  "action" character varying NOT NULL,
  CONSTRAINT "UQ_permissions_action" UNIQUE ("action"),
  CONSTRAINT "PK_permissions" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id" integer NOT NULL,
  "permission_id" integer NOT NULL,
  CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
  CONSTRAINT "FK_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_role_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "email" character varying NOT NULL,
  "password" character varying NOT NULL,
  "full_name" character varying NOT NULL,
  "role_id" integer NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_login_at" TIMESTAMPTZ,
  "failed_login_attempts" integer NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ,
  CONSTRAINT "UQ_users_email" UNIQUE ("email"),
  CONSTRAINT "PK_users" PRIMARY KEY ("id"),
  CONSTRAINT "FK_users_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id")
);

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "token_hash" character varying NOT NULL,
  "user_id" uuid NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"),
  CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
  CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id");

-- =====================================================================================
--  PARTE 2 — TALLERES Y PRESUPUESTOS (migración TalleresPresupuestos1792200000000)
-- =====================================================================================

-- =====================================================================================
--  Talleres y presupuestos: esquema multi-taller
--  PostgreSQL 14 o superior (probado en 16).
--
--  Lo ejecuta la migración TalleresPresupuestos1792200000000. También se puede correr
--  a mano (pgAdmin > Query Tool) sobre una base que ya tenga las tablas de la migración
--  inicial (users, roles, permissions, refresh_tokens).
-- =====================================================================================
--
--  AISLAMIENTO ENTRE TALLERES (dos capas)
--
--   1. Row Level Security. La API ejecuta cada operación de negocio dentro de una
--      transacción que hace:
--          SET LOCAL ROLE presupuestos_app;
--          SELECT set_config('app.taller_id', '<uuid del taller>', true);
--      Las políticas filtran por taller_id = app_taller_id(). Si una consulta se olvida
--      el WHERE, igual no devuelve datos de otro taller; sin contexto no devuelve nada.
--      El SET LOCAL ROLE hace que esto funcione aunque la API se conecte como
--      "postgres" (superusuario), que de otro modo saltearía RLS.
--
--   2. Claves foráneas compuestas (taller_id, id). La base no permite que un
--      presupuesto de un taller apunte a un vehículo, cliente o ítem de catálogo
--      de otro taller.
--
--  DINERO
--   numeric(14,2) para precios unitarios y numeric(18,2) para importes. Nunca float.
--   Subtotales y totales los calcula la base (columna generada + triggers): la API
--   nunca acepta un total que venga del navegador.
-- =====================================================================================


-- -------------------------------------------------------------------------------------
--  Extensiones (ambas son "trusted": las puede crear el dueño de la base)
-- -------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- búsqueda por similitud / ILIKE indexado
CREATE EXTENSION IF NOT EXISTS unaccent;  -- "bujia" encuentra "Bujía"


-- -------------------------------------------------------------------------------------
--  Funciones de soporte
-- -------------------------------------------------------------------------------------

-- unaccent() es STABLE y no se puede usar en índices. Este envoltorio IMMUTABLE con el
-- diccionario calificado sí (patrón estándar; el diccionario no cambia).
CREATE OR REPLACE FUNCTION f_unaccent(texto text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;

-- Taller de la transacción en curso (lo fija la API). NULL si no hay contexto.
-- NULLIF cubre el caso en que la variable quedó en '' después de una transacción previa.
CREATE OR REPLACE FUNCTION app_taller_id()
RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT NULLIF(current_setting('app.taller_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;


-- -------------------------------------------------------------------------------------
--  Tipos
-- -------------------------------------------------------------------------------------
CREATE TYPE condicion_iva      AS ENUM ('monotributo', 'responsable_inscripto', 'exento');
CREATE TYPE tipo_item          AS ENUM ('repuesto', 'trabajo');
CREATE TYPE estado_presupuesto AS ENUM ('borrador', 'enviado', 'aprobado', 'rechazado');
CREATE TYPE tipo_descuento     AS ENUM ('porcentaje', 'monto');
CREATE TYPE combustible        AS ENUM ('nafta', 'diesel', 'nafta_gnc', 'hibrido', 'electrico', 'otro');
-- u = unidad, l = litro, kg, m = metro, h = hora, jgo = juego
CREATE TYPE unidad_medida      AS ENUM ('u', 'l', 'kg', 'm', 'h', 'jgo');


-- =====================================================================================
--  TALLERES (tenant)
-- =====================================================================================
CREATE TABLE talleres (
  id                          uuid          NOT NULL DEFAULT gen_random_uuid(),
  nombre                      text          NOT NULL,
  razon_social                text,
  cuit                        text,
  condicion_iva               condicion_iva NOT NULL DEFAULT 'monotributo',
  direccion                   text,
  localidad                   text,
  telefono                    text,
  email                       text,
  logo_data_url               text,
  zona_horaria                text          NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  validez_dias_default        smallint      NOT NULL DEFAULT 5,
  iva_porcentaje_default      numeric(5,2)  NOT NULL DEFAULT 0,
  recargo_sugerido_porcentaje numeric(6,2)  NOT NULL DEFAULT 30,
  texto_condiciones           text          NOT NULL
    DEFAULT 'Presupuesto válido por {validez} días, sujeto a variación de precios de repuestos.',
  activo                      boolean       NOT NULL DEFAULT true,
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT "PK_talleres" PRIMARY KEY (id),
  CONSTRAINT "CHK_talleres_nombre"       CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  CONSTRAINT "CHK_talleres_razon_social" CHECK (razon_social IS NULL OR length(razon_social) <= 160),
  CONSTRAINT "CHK_talleres_cuit"         CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$'),
  CONSTRAINT "CHK_talleres_direccion"    CHECK (direccion IS NULL OR length(direccion) <= 160),
  CONSTRAINT "CHK_talleres_localidad"    CHECK (localidad IS NULL OR length(localidad) <= 120),
  CONSTRAINT "CHK_talleres_telefono"     CHECK (telefono IS NULL OR length(telefono) <= 40),
  CONSTRAINT "CHK_talleres_email"        CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT "CHK_talleres_logo"         CHECK (logo_data_url IS NULL OR (
                                           logo_data_url ~ '^data:image/(png|jpeg|webp);base64,'
                                           AND length(logo_data_url) <= 400000)),
  CONSTRAINT "CHK_talleres_validez"      CHECK (validez_dias_default BETWEEN 1 AND 90),
  CONSTRAINT "CHK_talleres_iva"          CHECK (iva_porcentaje_default IN (0, 10.5, 21)),
  CONSTRAINT "CHK_talleres_recargo"      CHECK (recargo_sugerido_porcentaje BETWEEN 0 AND 500),
  CONSTRAINT "CHK_talleres_condiciones"  CHECK (length(texto_condiciones) <= 1000)
);

CREATE TRIGGER "TRG_talleres_updated_at"
  BEFORE UPDATE ON talleres
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();


-- -------------------------------------------------------------------------------------
--  USERS (tabla de la base de autenticación): pertenencia a un taller + baja lógica
-- -------------------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN taller_id uuid;
ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Si la base ya tenía usuarios (de la versión anterior), se agrupan en un taller inicial.
INSERT INTO talleres (nombre)
SELECT 'Taller principal'
 WHERE EXISTS (SELECT 1 FROM users);

UPDATE users
   SET taller_id = (SELECT id FROM talleres ORDER BY created_at LIMIT 1)
 WHERE taller_id IS NULL;

ALTER TABLE users ALTER COLUMN taller_id SET NOT NULL;
ALTER TABLE users
  ADD CONSTRAINT "FK_users_taller" FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE RESTRICT;
-- Permite FKs compuestas (taller_id, usuario) desde presupuestos.
ALTER TABLE users
  ADD CONSTRAINT "UQ_users_taller_id" UNIQUE (taller_id, id);


-- =====================================================================================
--  NUMERADORES: correlativo propio de cada taller (#00001, #00002...)
-- =====================================================================================
CREATE TABLE numeradores (
  taller_id    uuid    NOT NULL DEFAULT app_taller_id(),
  entidad      text    NOT NULL,
  ultimo_valor integer NOT NULL DEFAULT 0,
  CONSTRAINT "PK_numeradores" PRIMARY KEY (taller_id, entidad),
  CONSTRAINT "FK_numeradores_taller" FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE RESTRICT,
  CONSTRAINT "CHK_numeradores_entidad" CHECK (entidad IN ('presupuesto')),
  CONSTRAINT "CHK_numeradores_valor"   CHECK (ultimo_valor >= 0)
);


-- =====================================================================================
--  CLIENTES
-- =====================================================================================
CREATE TABLE clientes (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  taller_id    uuid        NOT NULL DEFAULT app_taller_id(),
  nombre       text        NOT NULL,
  apellido     text,
  razon_social text,                       -- empresa / flota
  telefono     text,                       -- E.164 normalizado: +5491123456789
  email        text,
  documento    text,                       -- DNI o CUIT, solo dígitos
  notas        text,                       -- internas, no se imprimen
  archivado_en timestamptz,
  busqueda     text GENERATED ALWAYS AS (
                 lower(f_unaccent(nombre || ' ' || coalesce(apellido, '') || ' ' || coalesce(razon_social, '')))
               ) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_clientes" PRIMARY KEY (id),
  CONSTRAINT "UQ_clientes_taller_id" UNIQUE (taller_id, id),
  CONSTRAINT "FK_clientes_taller" FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE RESTRICT,
  CONSTRAINT "CHK_clientes_nombre"       CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  CONSTRAINT "CHK_clientes_apellido"     CHECK (apellido IS NULL OR length(apellido) <= 80),
  CONSTRAINT "CHK_clientes_razon_social" CHECK (razon_social IS NULL OR length(razon_social) <= 160),
  CONSTRAINT "CHK_clientes_telefono"     CHECK (telefono IS NULL OR telefono ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT "CHK_clientes_email"        CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT "CHK_clientes_documento"    CHECK (documento IS NULL OR documento ~ '^[0-9]{7,11}$'),
  CONSTRAINT "CHK_clientes_notas"        CHECK (notas IS NULL OR length(notas) <= 2000)
);

CREATE INDEX "IDX_clientes_telefono" ON clientes (taller_id, telefono) WHERE telefono IS NOT NULL;
CREATE INDEX "IDX_clientes_busqueda" ON clientes USING gin (busqueda gin_trgm_ops);

CREATE TRIGGER "TRG_clientes_updated_at"
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();


-- =====================================================================================
--  VEHÍCULOS
-- =====================================================================================
CREATE TABLE vehiculos (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  taller_id    uuid        NOT NULL DEFAULT app_taller_id(),
  cliente_id   uuid        NOT NULL,       -- dueño actual (el presupuesto guarda el suyo)
  patente      text COLLATE "C" NOT NULL,  -- normalizada: AB123CD / ABC123
  marca        text        NOT NULL,
  modelo       text        NOT NULL,
  version      text,                       -- versión / motor: "1.6 16v"
  anio         smallint,
  color        text,
  combustible  combustible,
  vin          text,                       -- número de chasis (17)
  notas        text,
  archivado_en timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_vehiculos" PRIMARY KEY (id),
  CONSTRAINT "UQ_vehiculos_taller_id" UNIQUE (taller_id, id),
  -- Única POR TALLER (dos talleres pueden atender el mismo auto). El índice con
  -- collation "C" también resuelve búsquedas por prefijo: patente LIKE 'AB1%'.
  CONSTRAINT "UQ_vehiculos_taller_patente" UNIQUE (taller_id, patente),
  CONSTRAINT "FK_vehiculos_taller" FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE RESTRICT,
  CONSTRAINT "FK_vehiculos_cliente" FOREIGN KEY (taller_id, cliente_id)
    REFERENCES clientes (taller_id, id) ON DELETE RESTRICT,
  CONSTRAINT "CHK_vehiculos_patente" CHECK (patente ~ '^[A-Z0-9]{5,10}$'),
  CONSTRAINT "CHK_vehiculos_marca"   CHECK (length(btrim(marca)) BETWEEN 1 AND 60),
  CONSTRAINT "CHK_vehiculos_modelo"  CHECK (length(btrim(modelo)) BETWEEN 1 AND 80),
  CONSTRAINT "CHK_vehiculos_version" CHECK (version IS NULL OR length(version) <= 80),
  CONSTRAINT "CHK_vehiculos_anio"    CHECK (anio IS NULL OR anio BETWEEN 1900 AND 2100),
  CONSTRAINT "CHK_vehiculos_color"   CHECK (color IS NULL OR length(color) <= 40),
  CONSTRAINT "CHK_vehiculos_vin"     CHECK (vin IS NULL OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  CONSTRAINT "CHK_vehiculos_notas"   CHECK (notas IS NULL OR length(notas) <= 2000)
);

CREATE INDEX "IDX_vehiculos_cliente" ON vehiculos (taller_id, cliente_id);

CREATE TRIGGER "TRG_vehiculos_updated_at"
  BEFORE UPDATE ON vehiculos
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();


-- =====================================================================================
--  CATÁLOGO (repuestos y trabajos frecuentes en una sola tabla)
-- =====================================================================================
CREATE TABLE catalogo_items (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
  taller_id             uuid          NOT NULL DEFAULT app_taller_id(),
  tipo                  tipo_item     NOT NULL,
  nombre                text          NOT NULL,
  marca                 text,
  codigo                text,                      -- código de fabricante / OEM
  unidad                unidad_medida NOT NULL DEFAULT 'u',
  precio_referencia     numeric(14,2) NOT NULL DEFAULT 0,
  costo_referencia      numeric(14,2),
  precio_actualizado_en timestamptz   NOT NULL DEFAULT now(),
  veces_usado           integer       NOT NULL DEFAULT 0,
  ultimo_uso_en         timestamptz,
  activo                boolean       NOT NULL DEFAULT true,
  busqueda              text GENERATED ALWAYS AS (
                          lower(f_unaccent(nombre || ' ' || coalesce(marca, '') || ' ' || coalesce(codigo, '')))
                        ) STORED,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT "PK_catalogo_items" PRIMARY KEY (id),
  CONSTRAINT "UQ_catalogo_items_taller_id" UNIQUE (taller_id, id),
  CONSTRAINT "FK_catalogo_items_taller" FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE RESTRICT,
  CONSTRAINT "CHK_catalogo_items_nombre" CHECK (length(btrim(nombre)) BETWEEN 1 AND 200),
  CONSTRAINT "CHK_catalogo_items_marca"  CHECK (marca IS NULL OR length(marca) <= 60),
  CONSTRAINT "CHK_catalogo_items_codigo" CHECK (codigo IS NULL OR length(codigo) <= 60),
  CONSTRAINT "CHK_catalogo_items_precio" CHECK (precio_referencia BETWEEN 0 AND 999999999.99),
  CONSTRAINT "CHK_catalogo_items_costo"  CHECK (costo_referencia IS NULL OR costo_referencia BETWEEN 0 AND 999999999.99),
  CONSTRAINT "CHK_catalogo_items_usos"   CHECK (veces_usado >= 0)
);

-- Evita duplicados "Filtro de aceite / Fram" dentro del mismo taller (solo activos).
CREATE UNIQUE INDEX "UQ_catalogo_items_nombre" ON catalogo_items
  (taller_id, tipo, lower(f_unaccent(nombre)), lower(coalesce(marca, '')))
  WHERE activo;
CREATE INDEX "IDX_catalogo_items_busqueda" ON catalogo_items USING gin (busqueda gin_trgm_ops);
CREATE INDEX "IDX_catalogo_items_ranking"  ON catalogo_items (taller_id, tipo, veces_usado DESC) WHERE activo;

-- precio_actualizado_en se mueve solo cuando cambia un precio; updated_at solo cuando
-- cambian datos (no cuando se incrementa el contador de uso).
CREATE OR REPLACE FUNCTION trg_catalogo_items_actualizar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.precio_referencia IS DISTINCT FROM OLD.precio_referencia
     OR NEW.costo_referencia IS DISTINCT FROM OLD.costo_referencia THEN
    NEW.precio_actualizado_en := now();
  END IF;

  IF (NEW.tipo, NEW.nombre, NEW.marca, NEW.codigo, NEW.unidad,
      NEW.precio_referencia, NEW.costo_referencia, NEW.activo)
     IS DISTINCT FROM
     (OLD.tipo, OLD.nombre, OLD.marca, OLD.codigo, OLD.unidad,
      OLD.precio_referencia, OLD.costo_referencia, OLD.activo) THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "TRG_catalogo_items_actualizar"
  BEFORE UPDATE ON catalogo_items
  FOR EACH ROW EXECUTE FUNCTION trg_catalogo_items_actualizar();


-- =====================================================================================
--  PRESUPUESTOS
-- =====================================================================================
CREATE TABLE presupuestos (
  id                 uuid               NOT NULL DEFAULT gen_random_uuid(),
  taller_id          uuid               NOT NULL DEFAULT app_taller_id(),
  numero             integer            NOT NULL,   -- lo asigna el trigger (correlativo por taller)
  cliente_id         uuid               NOT NULL,   -- a quién se le cotizó (histórico)
  vehiculo_id        uuid               NOT NULL,
  estado             estado_presupuesto NOT NULL DEFAULT 'borrador',
  fecha_emision      date               NOT NULL,   -- trigger: hoy en la zona horaria del taller
  validez_dias       smallint           NOT NULL,   -- trigger: default del taller
  kilometraje        integer,
  motivo_ingreso     text,                          -- lo que cuenta el cliente
  diagnostico        text,                          -- lo que encontró el mecánico
  notas_cliente      text,                          -- se imprimen
  notas_internas     text,                          -- NO se imprimen
  descuento_tipo     tipo_descuento,
  descuento_valor    numeric(14,2)      NOT NULL DEFAULT 0,
  iva_porcentaje     numeric(5,2)       NOT NULL,   -- trigger: default del taller
  -- Calculados por la base (trigger). Cualquier valor que se intente escribir se recalcula.
  subtotal_repuestos numeric(18,2)      NOT NULL DEFAULT 0,
  subtotal_trabajos  numeric(18,2)      NOT NULL DEFAULT 0,
  descuento_monto    numeric(18,2)      NOT NULL DEFAULT 0,
  iva_monto          numeric(18,2)      NOT NULL DEFAULT 0,
  total              numeric(18,2)      NOT NULL DEFAULT 0,
  costo_total        numeric(18,2)      NOT NULL DEFAULT 0,  -- interno: suma de costos cargados
  creado_por         uuid,
  enviado_en         timestamptz,
  respondido_en      timestamptz,
  version            integer            NOT NULL DEFAULT 1,  -- control de concurrencia optimista
  created_at         timestamptz        NOT NULL DEFAULT now(),
  updated_at         timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT "PK_presupuestos" PRIMARY KEY (id),
  CONSTRAINT "UQ_presupuestos_taller_id" UNIQUE (taller_id, id),
  CONSTRAINT "UQ_presupuestos_taller_numero" UNIQUE (taller_id, numero),
  CONSTRAINT "FK_presupuestos_taller" FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE RESTRICT,
  CONSTRAINT "FK_presupuestos_cliente" FOREIGN KEY (taller_id, cliente_id)
    REFERENCES clientes (taller_id, id) ON DELETE RESTRICT,
  CONSTRAINT "FK_presupuestos_vehiculo" FOREIGN KEY (taller_id, vehiculo_id)
    REFERENCES vehiculos (taller_id, id) ON DELETE RESTRICT,
  CONSTRAINT "FK_presupuestos_creado_por" FOREIGN KEY (taller_id, creado_por)
    REFERENCES users (taller_id, id) ON DELETE RESTRICT,
  CONSTRAINT "CHK_presupuestos_numero"      CHECK (numero > 0),
  CONSTRAINT "CHK_presupuestos_validez"     CHECK (validez_dias BETWEEN 1 AND 365),
  CONSTRAINT "CHK_presupuestos_km"          CHECK (kilometraje IS NULL OR kilometraje BETWEEN 0 AND 3000000),
  CONSTRAINT "CHK_presupuestos_motivo"      CHECK (motivo_ingreso IS NULL OR length(motivo_ingreso) <= 2000),
  CONSTRAINT "CHK_presupuestos_diagnostico" CHECK (diagnostico IS NULL OR length(diagnostico) <= 4000),
  CONSTRAINT "CHK_presupuestos_notas_cli"   CHECK (notas_cliente IS NULL OR length(notas_cliente) <= 4000),
  CONSTRAINT "CHK_presupuestos_notas_int"   CHECK (notas_internas IS NULL OR length(notas_internas) <= 4000),
  CONSTRAINT "CHK_presupuestos_desc_valor"  CHECK (descuento_valor BETWEEN 0 AND 999999999.99),
  CONSTRAINT "CHK_presupuestos_desc_tipo"   CHECK (descuento_tipo IS NOT NULL OR descuento_valor = 0),
  CONSTRAINT "CHK_presupuestos_desc_pct"    CHECK (descuento_tipo IS DISTINCT FROM 'porcentaje' OR descuento_valor <= 100),
  CONSTRAINT "CHK_presupuestos_iva"         CHECK (iva_porcentaje IN (0, 10.5, 21)),
  CONSTRAINT "CHK_presupuestos_version"     CHECK (version > 0)
);

CREATE INDEX "IDX_presupuestos_fecha"    ON presupuestos (taller_id, fecha_emision DESC, numero DESC);
CREATE INDEX "IDX_presupuestos_estado"   ON presupuestos (taller_id, estado, fecha_emision DESC);
CREATE INDEX "IDX_presupuestos_vehiculo" ON presupuestos (taller_id, vehiculo_id, fecha_emision DESC);
CREATE INDEX "IDX_presupuestos_cliente"  ON presupuestos (taller_id, cliente_id);


-- =====================================================================================
--  ÍTEMS DEL PRESUPUESTO (repuestos y mano de obra)
-- =====================================================================================
CREATE TABLE presupuesto_items (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  taller_id        uuid          NOT NULL DEFAULT app_taller_id(),
  presupuesto_id   uuid          NOT NULL,
  posicion         smallint      NOT NULL,          -- orden dentro del presupuesto
  tipo             tipo_item     NOT NULL,
  catalogo_item_id uuid,                            -- NULL = concepto libre (modo repuestera)
  descripcion      text          NOT NULL,          -- se imprime
  proveedor        text,                            -- INTERNO: dónde se compró/cotizó
  unidad           unidad_medida NOT NULL DEFAULT 'u',
  cantidad         numeric(10,3) NOT NULL,
  precio_costo     numeric(14,2),                   -- INTERNO: costo unitario
  precio_unitario  numeric(14,2) NOT NULL,          -- snapshot: precio final al cliente
  subtotal         numeric(18,2) GENERATED ALWAYS AS (round(cantidad * precio_unitario, 2)) STORED,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT "PK_presupuesto_items" PRIMARY KEY (id),
  -- DEFERRABLE: permite reordenar filas dentro de una transacción sin choques transitorios.
  CONSTRAINT "UQ_presupuesto_items_posicion" UNIQUE (presupuesto_id, posicion) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "FK_presupuesto_items_taller" FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE RESTRICT,
  CONSTRAINT "FK_presupuesto_items_presupuesto" FOREIGN KEY (taller_id, presupuesto_id)
    REFERENCES presupuestos (taller_id, id) ON DELETE CASCADE,
  -- Lo que ya se usó en un presupuesto no se borra del catálogo: se desactiva.
  CONSTRAINT "FK_presupuesto_items_catalogo" FOREIGN KEY (taller_id, catalogo_item_id)
    REFERENCES catalogo_items (taller_id, id) ON DELETE RESTRICT,
  CONSTRAINT "CHK_presupuesto_items_posicion"    CHECK (posicion BETWEEN 1 AND 500),
  CONSTRAINT "CHK_presupuesto_items_descripcion" CHECK (length(btrim(descripcion)) BETWEEN 1 AND 300),
  CONSTRAINT "CHK_presupuesto_items_proveedor"   CHECK (proveedor IS NULL OR length(proveedor) <= 120),
  CONSTRAINT "CHK_presupuesto_items_cantidad"    CHECK (cantidad > 0 AND cantidad <= 9999.999),
  CONSTRAINT "CHK_presupuesto_items_costo"       CHECK (precio_costo IS NULL OR precio_costo BETWEEN 0 AND 999999999.99),
  CONSTRAINT "CHK_presupuesto_items_precio"      CHECK (precio_unitario BETWEEN 0 AND 999999999.99)
);

CREATE INDEX "IDX_presupuesto_items_catalogo" ON presupuesto_items (taller_id, catalogo_item_id)
  WHERE catalogo_item_id IS NOT NULL;


-- -------------------------------------------------------------------------------------
--  Trigger 1 (BEFORE INSERT): número correlativo por taller + valores por defecto del
--  taller. El INSERT ... ON CONFLICT bloquea la fila del numerador hasta el COMMIT, así
--  que dos altas simultáneas en el mismo taller nunca reciben el mismo número.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_presupuestos_numerar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_taller talleres%ROWTYPE;
BEGIN
  SELECT * INTO v_taller FROM talleres WHERE id = NEW.taller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taller % inexistente o fuera de contexto', NEW.taller_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO numeradores AS n (taller_id, entidad, ultimo_valor)
  VALUES (NEW.taller_id, 'presupuesto', 1)
  ON CONFLICT (taller_id, entidad) DO UPDATE SET ultimo_valor = n.ultimo_valor + 1
  RETURNING ultimo_valor INTO NEW.numero;

  NEW.fecha_emision  := coalesce(NEW.fecha_emision, (now() AT TIME ZONE v_taller.zona_horaria)::date);
  NEW.validez_dias   := coalesce(NEW.validez_dias, v_taller.validez_dias_default);
  NEW.iva_porcentaje := coalesce(NEW.iva_porcentaje, v_taller.iva_porcentaje_default);
  RETURN NEW;
END
$$;

-- -------------------------------------------------------------------------------------
--  Trigger 2 (BEFORE INSERT/UPDATE): totales, marcas de estado y campos inmutables.
--  Es la única fuente de verdad de los importes del presupuesto.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_presupuestos_calcular()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_base numeric(18,2);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.taller_id IS DISTINCT FROM OLD.taller_id OR NEW.numero IS DISTINCT FROM OLD.numero THEN
      RAISE EXCEPTION 'taller_id y numero de un presupuesto no se pueden modificar'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := OLD.created_at;

    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      IF NEW.estado = 'enviado' THEN
        NEW.enviado_en := coalesce(NEW.enviado_en, now());
        NEW.respondido_en := NULL;
      ELSIF NEW.estado IN ('aprobado', 'rechazado') THEN
        NEW.respondido_en := now();
      ELSE
        NEW.respondido_en := NULL;
      END IF;
    END IF;
  END IF;

  SELECT coalesce(sum(i.subtotal) FILTER (WHERE i.tipo = 'repuesto'), 0),
         coalesce(sum(i.subtotal) FILTER (WHERE i.tipo = 'trabajo'), 0),
         coalesce(sum(round(i.cantidad * i.precio_costo, 2)), 0)
    INTO NEW.subtotal_repuestos, NEW.subtotal_trabajos, NEW.costo_total
    FROM presupuesto_items i
   WHERE i.presupuesto_id = NEW.id;

  v_base := NEW.subtotal_repuestos + NEW.subtotal_trabajos;

  NEW.descuento_monto := CASE NEW.descuento_tipo
                           WHEN 'porcentaje' THEN round(v_base * NEW.descuento_valor / 100, 2)
                           WHEN 'monto'      THEN least(NEW.descuento_valor, v_base)
                           ELSE 0
                         END;
  NEW.iva_monto := round((v_base - NEW.descuento_monto) * NEW.iva_porcentaje / 100, 2);
  NEW.total     := v_base - NEW.descuento_monto + NEW.iva_monto;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Los BEFORE triggers corren en orden alfabético: primero numerar, después calcular.
CREATE TRIGGER "TRG_presupuestos_10_numerar"
  BEFORE INSERT ON presupuestos
  FOR EACH ROW EXECUTE FUNCTION trg_presupuestos_numerar();

CREATE TRIGGER "TRG_presupuestos_20_calcular"
  BEFORE INSERT OR UPDATE ON presupuestos
  FOR EACH ROW EXECUTE FUNCTION trg_presupuestos_calcular();

-- -------------------------------------------------------------------------------------
--  Trigger 3 (AFTER, por sentencia): cuando cambian ítems, se "toca" el presupuesto una
--  sola vez por sentencia y el trigger 2 recalcula los totales.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_items_recalcular()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE presupuestos p SET updated_at = now()
     WHERE p.id IN (SELECT DISTINCT presupuesto_id FROM filas_viejas);
  ELSE
    UPDATE presupuestos p SET updated_at = now()
     WHERE p.id IN (SELECT DISTINCT presupuesto_id FROM filas_nuevas);
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER "TRG_presupuesto_items_recalcular_ins"
  AFTER INSERT ON presupuesto_items
  REFERENCING NEW TABLE AS filas_nuevas
  FOR EACH STATEMENT EXECUTE FUNCTION trg_items_recalcular();

CREATE TRIGGER "TRG_presupuesto_items_recalcular_upd"
  AFTER UPDATE ON presupuesto_items
  REFERENCING NEW TABLE AS filas_nuevas
  FOR EACH STATEMENT EXECUTE FUNCTION trg_items_recalcular();

CREATE TRIGGER "TRG_presupuesto_items_recalcular_del"
  AFTER DELETE ON presupuesto_items
  REFERENCING OLD TABLE AS filas_viejas
  FOR EACH STATEMENT EXECUTE FUNCTION trg_items_recalcular();

-- -------------------------------------------------------------------------------------
--  Trigger 4 (AFTER INSERT, por sentencia): uso del catálogo para ordenar sugerencias.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_items_uso_catalogo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE catalogo_items c
     SET veces_usado   = c.veces_usado + n.usos,
         ultimo_uso_en = now()
    FROM (SELECT catalogo_item_id, count(*)::int AS usos
            FROM filas_nuevas
           WHERE catalogo_item_id IS NOT NULL
           GROUP BY catalogo_item_id) n
   WHERE c.id = n.catalogo_item_id;
  RETURN NULL;
END
$$;

CREATE TRIGGER "TRG_presupuesto_items_uso_catalogo"
  AFTER INSERT ON presupuesto_items
  REFERENCING NEW TABLE AS filas_nuevas
  FOR EACH STATEMENT EXECUTE FUNCTION trg_items_uso_catalogo();


-- =====================================================================================
--  ROW LEVEL SECURITY
-- =====================================================================================

-- Rol sin login al que la API cambia (SET LOCAL ROLE) en cada transacción de negocio.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'presupuestos_app') THEN
    CREATE ROLE presupuestos_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- El usuario con el que se conecta la API tiene que poder hacer SET ROLE presupuestos_app.
-- Acá se le da ese permiso al usuario que corre las migraciones (normalmente el mismo de
-- la API). Si la API usa otro usuario:
--   GRANT presupuestos_app TO <usuario_api>;                 -- PostgreSQL 14/15
--   GRANT presupuestos_app TO <usuario_api> WITH SET TRUE;   -- PostgreSQL 16 o superior
-- Desde PostgreSQL 16, quien crea un rol (sin ser superusuario) queda como miembro con
-- ADMIN pero sin SET: por eso se pide SET explícitamente.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 160000 THEN
    IF NOT pg_has_role(current_user, 'presupuestos_app', 'SET') THEN
      EXECUTE format('GRANT presupuestos_app TO %I WITH SET TRUE', current_user);
    END IF;
  ELSIF NOT pg_has_role(current_user, 'presupuestos_app', 'MEMBER') THEN
    EXECUTE format('GRANT presupuestos_app TO %I', current_user);
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO presupuestos_app;
GRANT SELECT, UPDATE ON talleres TO presupuestos_app;
GRANT SELECT, INSERT, UPDATE ON numeradores TO presupuestos_app;
GRANT SELECT, INSERT, UPDATE, DELETE
   ON clientes, vehiculos, catalogo_items, presupuestos, presupuesto_items
   TO presupuestos_app;
-- Sin acceso a users / refresh_tokens / roles: el rol de negocio no ve credenciales.

-- talleres: el rol de negocio solo ve y edita su propio taller. El resto de los roles
-- (login, administración de la plataforma) no se ven afectados.
ALTER TABLE talleres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POL_talleres_propio" ON talleres
  USING      (current_user <> 'presupuestos_app' OR id = app_taller_id())
  WITH CHECK (current_user <> 'presupuestos_app' OR id = app_taller_id());

-- Tablas de negocio: FORCE para que ni siquiera el dueño de la tabla (si no es
-- superusuario) lea datos sin un taller en contexto.
ALTER TABLE numeradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE numeradores FORCE ROW LEVEL SECURITY;
CREATE POLICY "POL_numeradores_taller" ON numeradores
  USING (taller_id = app_taller_id()) WITH CHECK (taller_id = app_taller_id());

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes FORCE ROW LEVEL SECURITY;
CREATE POLICY "POL_clientes_taller" ON clientes
  USING (taller_id = app_taller_id()) WITH CHECK (taller_id = app_taller_id());

ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculos FORCE ROW LEVEL SECURITY;
CREATE POLICY "POL_vehiculos_taller" ON vehiculos
  USING (taller_id = app_taller_id()) WITH CHECK (taller_id = app_taller_id());

ALTER TABLE catalogo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "POL_catalogo_items_taller" ON catalogo_items
  USING (taller_id = app_taller_id()) WITH CHECK (taller_id = app_taller_id());

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos FORCE ROW LEVEL SECURITY;
CREATE POLICY "POL_presupuestos_taller" ON presupuestos
  USING (taller_id = app_taller_id()) WITH CHECK (taller_id = app_taller_id());

ALTER TABLE presupuesto_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "POL_presupuesto_items_taller" ON presupuesto_items
  USING (taller_id = app_taller_id()) WITH CHECK (taller_id = app_taller_id());

-- =====================================================================================
--  REGISTRO DE MIGRACIONES (para que la API las dé por aplicadas)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS typeorm_migrations (
  id          SERIAL            NOT NULL,
  "timestamp" bigint            NOT NULL,
  name        character varying NOT NULL,
  CONSTRAINT "PK_typeorm_migrations" PRIMARY KEY (id)
);

INSERT INTO typeorm_migrations ("timestamp", name)
SELECT m.ts, m.nombre
  FROM (VALUES (1747400000000::bigint, 'InitialSchema1747400000000'),
               (1792200000000::bigint, 'TalleresPresupuestos1792200000000')) AS m (ts, nombre)
 WHERE NOT EXISTS (SELECT 1 FROM typeorm_migrations t WHERE t.name = m.nombre);

COMMIT;

-- Siguiente paso: arrancar la API (crea el taller inicial y su administrador) o
-- `npm run taller:crear -- --nombre "…" --email … --password …`.
