-- =====================================================================================
--  Cerrar el acceso de los roles web de Supabase / PostgREST ("anon" y "authenticated")
--
--  Supabase publica el esquema "public" por su API REST y GraphQL y, por defecto, les da
--  permisos completos a esos roles sobre cada tabla nueva. Con la clave "anon" del
--  proyecto (que no es secreta) alguien podría leer usuarios o modificar datos sin pasar
--  por la API de la app. Esta app no usa esa API: todo pasa por NestJS.
--
--   - Quita los permisos de esos roles sobre las tablas y secuencias de la app.
--   - Cambia los permisos por defecto para que las tablas de migraciones futuras tampoco
--     queden expuestas.
--   - Activa RLS (sin políticas) en las tablas que no la tenían: segunda barrera si
--     alguien vuelve a dar permisos. La API se conecta como dueña de las tablas, así que
--     no la afecta.
--
--  En un PostgreSQL sin esos roles (instalación local, Docker) no hace nada.
-- =====================================================================================
DO $$
DECLARE
  v_rol   text;
  v_tabla text;
  v_tablas_app text[] := ARRAY[
    'users', 'roles', 'permissions', 'role_permissions', 'refresh_tokens', 'typeorm_migrations',
    'talleres', 'numeradores', 'clientes', 'vehiculos', 'catalogo_items', 'presupuestos',
    'presupuesto_items'];
  v_sin_rls text[] := ARRAY[
    'users', 'roles', 'permissions', 'role_permissions', 'refresh_tokens', 'typeorm_migrations'];
  v_hay_roles_web boolean := false;
BEGIN
  FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol);
    v_hay_roles_web := true;

    FOREACH v_tabla IN ARRAY v_tablas_app LOOP
      IF to_regclass(format('public.%I', v_tabla)) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', v_tabla, v_rol);
      END IF;
    END LOOP;
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', v_rol);

    -- Permisos por defecto de lo que cree este usuario (por esquema y globales).
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', v_rol);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', v_rol);
    EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM %I', v_rol);
    EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM %I', v_rol);
  END LOOP;

  IF v_hay_roles_web THEN
    FOREACH v_tabla IN ARRAY v_sin_rls LOOP
      IF to_regclass(format('public.%I', v_tabla)) IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabla);
      END IF;
    END LOOP;
  END IF;
END
$$;
