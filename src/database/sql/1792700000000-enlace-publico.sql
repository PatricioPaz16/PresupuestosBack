-- =====================================================================================
--  Enlace público de cada presupuesto (para mandarlo por WhatsApp sin adjuntar archivos)
--
--  El cliente abre /p/<token> sin usuario ni contraseña y ve la misma hoja que se imprime
--  (sin costos, proveedores ni notas internas), con su PDF.
--   - El token público lleva adentro el id del taller: la API fija el taller en la
--     transacción como en cualquier otra operación y busca el enlace con Row Level
--     Security activa. No hace falta ningún permiso para leer "de todos los talleres".
--   - visto_en / ultima_vista_en / vistas: cuándo lo abrió el cliente (las visitas de
--     usuarios del propio taller no cuentan).
--   - Se borra junto con el presupuesto (solo los borradores se pueden eliminar).
-- =====================================================================================

CREATE TABLE presupuesto_enlaces (
  presupuesto_id  uuid        NOT NULL,
  taller_id       uuid        NOT NULL DEFAULT app_taller_id(),
  token           text        NOT NULL,   -- parte aleatoria (24 bytes en base64url)
  creado_en       timestamptz NOT NULL DEFAULT now(),
  visto_en        timestamptz,            -- primera vez que lo abrió el cliente
  ultima_vista_en timestamptz,
  vistas          integer     NOT NULL DEFAULT 0,
  CONSTRAINT "PK_presupuesto_enlaces" PRIMARY KEY (presupuesto_id),
  CONSTRAINT "UQ_presupuesto_enlaces_token" UNIQUE (token),
  CONSTRAINT "FK_presupuesto_enlaces_presupuesto" FOREIGN KEY (taller_id, presupuesto_id)
    REFERENCES presupuestos (taller_id, id) ON DELETE CASCADE,
  CONSTRAINT "CHK_presupuesto_enlaces_token"  CHECK (token ~ '^[A-Za-z0-9_-]{32}$'),
  CONSTRAINT "CHK_presupuesto_enlaces_vistas" CHECK (vistas >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON presupuesto_enlaces TO presupuestos_app;

ALTER TABLE presupuesto_enlaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_enlaces FORCE ROW LEVEL SECURITY;
CREATE POLICY "POL_presupuesto_enlaces_taller" ON presupuesto_enlaces
  USING (taller_id = app_taller_id()) WITH CHECK (taller_id = app_taller_id());

-- Supabase: que la API REST pública ("anon" / "authenticated") tampoco vea esta tabla.
DO $$
DECLARE
  v_rol text;
BEGIN
  FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.presupuesto_enlaces FROM %I', v_rol);
    END IF;
  END LOOP;
END
$$;
