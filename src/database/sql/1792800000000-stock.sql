-- =====================================================================================
--  Stock de repuestos
--
--  Cada repuesto del catálogo puede llevar stock (controla_stock). El stock cambia solo
--  con movimientos (stock_movimientos), que quedan como historial y no se editan:
--   - ingreso:     compra de mercadería (+), con costo, proveedor y comprobante.
--   - ajuste:      conteo o corrección (+ o −), por ejemplo el stock inicial.
--   - presupuesto: al aprobar un presupuesto se descuentan sus repuestos del catálogo que
--                  llevan stock (−), con la misma unidad que el catálogo. Si se anulara la
--                  aprobación, se devuelve lo descontado (+).
--  El stock puede quedar negativo (se aprobó sin haber cargado el ingreso): la pantalla
--  lo muestra para que se corrija.
-- =====================================================================================

ALTER TABLE catalogo_items
  ADD COLUMN controla_stock boolean       NOT NULL DEFAULT false,
  ADD COLUMN stock          numeric(12,3) NOT NULL DEFAULT 0,  -- lo cambian solo los movimientos
  ADD COLUMN stock_minimo   numeric(12,3),                     -- aviso de faltante
  ADD COLUMN ubicacion      text,                              -- estante, cajón…
  ADD CONSTRAINT "CHK_catalogo_items_stock"
    CHECK (stock BETWEEN -999999.999 AND 999999.999),
  ADD CONSTRAINT "CHK_catalogo_items_stock_minimo"
    CHECK (stock_minimo IS NULL OR stock_minimo BETWEEN 0 AND 999999.999),
  ADD CONSTRAINT "CHK_catalogo_items_ubicacion"
    CHECK (ubicacion IS NULL OR length(ubicacion) <= 60),
  ADD CONSTRAINT "CHK_catalogo_items_stock_tipo"
    CHECK (tipo = 'repuesto' OR NOT controla_stock);

CREATE INDEX "IDX_catalogo_items_stock" ON catalogo_items (taller_id, nombre)
  WHERE activo AND controla_stock;


CREATE TABLE stock_movimientos (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  taller_id        uuid          NOT NULL DEFAULT app_taller_id(),
  catalogo_item_id uuid          NOT NULL,
  tipo             text          NOT NULL,
  cantidad         numeric(12,3) NOT NULL,           -- con signo: + entra, − sale
  stock_resultante numeric(12,3) NOT NULL DEFAULT 0, -- lo completa el trigger
  costo_unitario   numeric(14,2),                    -- ingresos: costo de compra
  proveedor        text,
  comprobante      text,                             -- factura o remito del proveedor
  presupuesto_id   uuid,
  nota             text,
  usuario_id       uuid,                             -- NULL si no se sabe quién fue
  created_at       timestamptz   NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "PK_stock_movimientos" PRIMARY KEY (id),
  CONSTRAINT "FK_stock_movimientos_item" FOREIGN KEY (taller_id, catalogo_item_id)
    REFERENCES catalogo_items (taller_id, id) ON DELETE RESTRICT,
  -- Solo se borran presupuestos en borrador, que nunca tienen movimientos.
  CONSTRAINT "FK_stock_movimientos_presupuesto" FOREIGN KEY (taller_id, presupuesto_id)
    REFERENCES presupuestos (taller_id, id) ON DELETE RESTRICT,
  CONSTRAINT "FK_stock_movimientos_usuario" FOREIGN KEY (taller_id, usuario_id)
    REFERENCES users (taller_id, id) ON DELETE RESTRICT,
  CONSTRAINT "CHK_stock_movimientos_tipo"
    CHECK (tipo IN ('ingreso', 'ajuste', 'presupuesto')),
  CONSTRAINT "CHK_stock_movimientos_cantidad"
    CHECK (cantidad <> 0 AND cantidad BETWEEN -999999.999 AND 999999.999),
  CONSTRAINT "CHK_stock_movimientos_ingreso"
    CHECK (tipo <> 'ingreso' OR cantidad > 0),
  CONSTRAINT "CHK_stock_movimientos_presupuesto"
    CHECK ((tipo = 'presupuesto') = (presupuesto_id IS NOT NULL)),
  CONSTRAINT "CHK_stock_movimientos_costo"
    CHECK (costo_unitario IS NULL OR costo_unitario BETWEEN 0 AND 999999999.99),
  CONSTRAINT "CHK_stock_movimientos_proveedor"
    CHECK (proveedor IS NULL OR length(proveedor) <= 120),
  CONSTRAINT "CHK_stock_movimientos_comprobante"
    CHECK (comprobante IS NULL OR length(comprobante) <= 60),
  CONSTRAINT "CHK_stock_movimientos_nota"
    CHECK (nota IS NULL OR length(nota) <= 300)
);

CREATE INDEX "IDX_stock_movimientos_item"
  ON stock_movimientos (taller_id, catalogo_item_id, created_at DESC);
CREATE INDEX "IDX_stock_movimientos_presupuesto"
  ON stock_movimientos (taller_id, presupuesto_id) WHERE presupuesto_id IS NOT NULL;


-- -------------------------------------------------------------------------------------
--  Cada movimiento suma (o resta) al stock del repuesto y deja anotado cómo quedó.
--  Cargar stock a un repuesto lo pasa a "controla stock".
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_stock_movimientos_aplicar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE catalogo_items
     SET stock = stock + NEW.cantidad,
         controla_stock = true
   WHERE taller_id = NEW.taller_id AND id = NEW.catalogo_item_id
  RETURNING stock INTO NEW.stock_resultante;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El repuesto no existe en el catálogo'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'FK_stock_movimientos_item';
  END IF;

  NEW.created_at := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TRIGGER "TRG_stock_movimientos_aplicar"
  BEFORE INSERT ON stock_movimientos
  FOR EACH ROW EXECUTE FUNCTION trg_stock_movimientos_aplicar();


-- -------------------------------------------------------------------------------------
--  El stock no se escribe a mano: solo desde el trigger de movimientos (que corre un
--  nivel más adentro). Así el stock es siempre la suma de su historial.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_catalogo_items_actualizar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'El stock cambia solo con movimientos (ingreso, ajuste o presupuesto aprobado)'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'CHK_catalogo_items_stock_movimientos';
  END IF;

  IF NEW.precio_referencia IS DISTINCT FROM OLD.precio_referencia
     OR NEW.costo_referencia IS DISTINCT FROM OLD.costo_referencia THEN
    NEW.precio_actualizado_en := now();
  END IF;

  IF (NEW.tipo, NEW.nombre, NEW.marca, NEW.codigo, NEW.unidad,
      NEW.precio_referencia, NEW.costo_referencia, NEW.activo,
      NEW.controla_stock, NEW.stock_minimo, NEW.ubicacion)
     IS DISTINCT FROM
     (OLD.tipo, OLD.nombre, OLD.marca, OLD.codigo, OLD.unidad,
      OLD.precio_referencia, OLD.costo_referencia, OLD.activo,
      OLD.controla_stock, OLD.stock_minimo, OLD.ubicacion) THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION trg_catalogo_items_stock_inicial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stock <> 0 THEN
    RAISE EXCEPTION 'El stock inicial se carga con un movimiento de ajuste'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'CHK_catalogo_items_stock_movimientos';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "TRG_catalogo_items_stock_inicial"
  BEFORE INSERT ON catalogo_items
  FOR EACH ROW EXECUTE FUNCTION trg_catalogo_items_stock_inicial();


-- -------------------------------------------------------------------------------------
--  Presupuesto aprobado: descuenta del stock sus repuestos del catálogo (sumando las
--  filas repetidas). Solo los que llevan stock y con la misma unidad que el catálogo
--  (si se cotizó "1,5 l" de un repuesto que se lleva por unidad, no se puede saber
--  cuánto descontar). Quién lo aprobó viene de app.usuario_id, que fija la API.
--  Si se anulara la aprobación, devuelve exactamente lo que se había descontado.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_presupuestos_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_usuario uuid := nullif(current_setting('app.usuario_id', true), '')::uuid;
BEGIN
  IF NEW.estado = 'aprobado' THEN
    INSERT INTO stock_movimientos
           (taller_id, catalogo_item_id, tipo, cantidad, presupuesto_id, usuario_id)
    SELECT i.taller_id, i.catalogo_item_id, 'presupuesto', -sum(i.cantidad), NEW.id, v_usuario
      FROM presupuesto_items i
      JOIN catalogo_items c ON c.taller_id = i.taller_id AND c.id = i.catalogo_item_id
     WHERE i.presupuesto_id = NEW.id
       AND i.tipo = 'repuesto'
       AND c.controla_stock
       AND i.unidad = c.unidad
     GROUP BY i.taller_id, i.catalogo_item_id;
  ELSE
    INSERT INTO stock_movimientos
           (taller_id, catalogo_item_id, tipo, cantidad, presupuesto_id, usuario_id, nota)
    SELECT m.taller_id, m.catalogo_item_id, 'presupuesto', -sum(m.cantidad), NEW.id, v_usuario,
           'Se anuló la aprobación'
      FROM stock_movimientos m
     WHERE m.presupuesto_id = NEW.id
     GROUP BY m.taller_id, m.catalogo_item_id
    HAVING sum(m.cantidad) <> 0;
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER "TRG_presupuestos_30_stock"
  AFTER UPDATE ON presupuestos
  FOR EACH ROW
  WHEN ((NEW.estado = 'aprobado') IS DISTINCT FROM (OLD.estado = 'aprobado'))
  EXECUTE FUNCTION trg_presupuestos_stock();


-- -------------------------------------------------------------------------------------
--  Permisos y Row Level Security. El historial no se edita ni se borra: el rol de
--  negocio solo puede leer y agregar.
-- -------------------------------------------------------------------------------------
GRANT SELECT, INSERT ON stock_movimientos TO presupuestos_app;

ALTER TABLE stock_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movimientos FORCE ROW LEVEL SECURITY;
CREATE POLICY "POL_stock_movimientos_taller" ON stock_movimientos
  USING (taller_id = app_taller_id()) WITH CHECK (taller_id = app_taller_id());

-- Supabase: que la API REST pública ("anon" / "authenticated") tampoco vea esta tabla.
DO $$
DECLARE
  v_rol text;
BEGIN
  FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.stock_movimientos FROM %I', v_rol);
    END IF;
  END LOOP;
END
$$;
