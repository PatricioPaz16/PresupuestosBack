/**
 * SQL del módulo de presupuestos. Las consultas de lectura arman el JSON de respuesta
 * directamente en PostgreSQL (json_build_object / json_agg): una sola ida y vuelta.
 * Los importes se castean a text para no perder precisión al pasar por JSON.
 */

/** Columnas de la entrada de ítems (jsonb_to_recordset). */
export const RECORDSET_ITEMS = `
  jsonb_to_recordset($2::jsonb) AS e(
    id uuid, posicion smallint, tipo tipo_item, catalogo_item_id uuid,
    descripcion text, proveedor text, unidad unidad_medida,
    cantidad numeric, precio_costo numeric, precio_unitario numeric)`;

export const SQL_ITEMS_BORRAR = `
  DELETE FROM presupuesto_items i
   WHERE i.presupuesto_id = $1
     AND i.id <> ALL (SELECT e.id FROM ${RECORDSET_ITEMS} WHERE e.id IS NOT NULL)`;

/** Solo actualiza las filas que realmente cambiaron. */
export const SQL_ITEMS_ACTUALIZAR = `
  UPDATE presupuesto_items i
     SET posicion = e.posicion, tipo = e.tipo, catalogo_item_id = e.catalogo_item_id,
         descripcion = e.descripcion, proveedor = e.proveedor, unidad = e.unidad,
         cantidad = e.cantidad, precio_costo = e.precio_costo, precio_unitario = e.precio_unitario
    FROM ${RECORDSET_ITEMS}
   WHERE i.presupuesto_id = $1
     AND i.id = e.id
     AND (i.posicion, i.tipo, i.catalogo_item_id, i.descripcion, i.proveedor, i.unidad,
          i.cantidad, i.precio_costo, i.precio_unitario)
         IS DISTINCT FROM
         (e.posicion, e.tipo, e.catalogo_item_id, e.descripcion, e.proveedor, e.unidad,
          e.cantidad, e.precio_costo, e.precio_unitario)`;

export const SQL_ITEMS_INSERTAR = `
  INSERT INTO presupuesto_items
         (presupuesto_id, posicion, tipo, catalogo_item_id, descripcion, proveedor, unidad,
          cantidad, precio_costo, precio_unitario)
  SELECT $1, e.posicion, e.tipo, e.catalogo_item_id, e.descripcion, e.proveedor, e.unidad,
         e.cantidad, e.precio_costo, e.precio_unitario
    FROM ${RECORDSET_ITEMS}
   WHERE e.id IS NULL`;

export const SQL_DETALLE = `
  SELECT json_build_object(
           'id', p.id, 'numero', p.numero, 'estado', p.estado,
           'fechaEmision', p.fecha_emision, 'validezDias', p.validez_dias,
           'validoHasta', p.fecha_emision + p.validez_dias,
           'kilometraje', p.kilometraje, 'motivoIngreso', p.motivo_ingreso,
           'diagnostico', p.diagnostico, 'notasCliente', p.notas_cliente,
           'notasInternas', p.notas_internas,
           'descuentoTipo', p.descuento_tipo, 'descuentoValor', p.descuento_valor::text,
           'ivaPorcentaje', p.iva_porcentaje::text,
           'totales', json_build_object(
              'subtotalRepuestos', p.subtotal_repuestos::text,
              'subtotalTrabajos', p.subtotal_trabajos::text,
              'descuentoMonto', p.descuento_monto::text,
              'ivaMonto', p.iva_monto::text,
              'total', p.total::text,
              'costoTotal', p.costo_total::text),
           'creadoPor', p.creado_por, 'enviadoEn', p.enviado_en, 'respondidoEn', p.respondido_en,
           'version', p.version, 'createdAt', p.created_at, 'updatedAt', p.updated_at,
           'cliente', (SELECT json_build_object(
                          'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
                          'razonSocial', c.razon_social, 'telefono', c.telefono, 'email', c.email,
                          'documento', c.documento, 'notas', c.notas)
                         FROM clientes c WHERE c.id = p.cliente_id),
           'vehiculo', (SELECT json_build_object(
                          'id', v.id, 'patente', v.patente, 'marca', v.marca, 'modelo', v.modelo,
                          'version', v.version, 'anio', v.anio, 'color', v.color,
                          'combustible', v.combustible)
                          FROM vehiculos v WHERE v.id = p.vehiculo_id),
           'items', coalesce((
              SELECT json_agg(json_build_object(
                       'id', i.id, 'tipo', i.tipo, 'catalogoItemId', i.catalogo_item_id,
                       'descripcion', i.descripcion, 'proveedor', i.proveedor, 'unidad', i.unidad,
                       'cantidad', i.cantidad::text, 'precioCosto', i.precio_costo::text,
                       'precioUnitario', i.precio_unitario::text, 'subtotal', i.subtotal::text)
                     ORDER BY i.posicion)
                FROM presupuesto_items i WHERE i.presupuesto_id = p.id), '[]'::json)
         ) AS dto
    FROM presupuestos p
   WHERE p.id = $1`;

/** Datos para imprimir: sin costo, proveedor, notas internas ni autor. */
export const SQL_DOCUMENTO = `
  SELECT json_build_object(
           'id', p.id, 'numero', p.numero, 'estado', p.estado,
           'fechaEmision', p.fecha_emision, 'validezDias', p.validez_dias,
           'validoHasta', p.fecha_emision + p.validez_dias,
           'kilometraje', p.kilometraje, 'motivoIngreso', p.motivo_ingreso,
           'diagnostico', p.diagnostico, 'notasCliente', p.notas_cliente,
           'descuentoTipo', p.descuento_tipo, 'descuentoValor', p.descuento_valor::text,
           'ivaPorcentaje', p.iva_porcentaje::text,
           'totales', json_build_object(
              'subtotalRepuestos', p.subtotal_repuestos::text,
              'subtotalTrabajos', p.subtotal_trabajos::text,
              'descuentoMonto', p.descuento_monto::text,
              'ivaMonto', p.iva_monto::text,
              'total', p.total::text),
           'taller', (SELECT json_build_object(
                         'nombre', t.nombre, 'razonSocial', t.razon_social, 'cuit', t.cuit,
                         'condicionIva', t.condicion_iva, 'direccion', t.direccion,
                         'localidad', t.localidad, 'telefono', t.telefono, 'email', t.email,
                         'logoDataUrl', t.logo_data_url, 'textoCondiciones', t.texto_condiciones)
                        FROM talleres t WHERE t.id = p.taller_id),
           'cliente', (SELECT json_build_object(
                          'nombre', c.nombre, 'apellido', c.apellido, 'razonSocial', c.razon_social,
                          'telefono', c.telefono, 'email', c.email, 'documento', c.documento)
                         FROM clientes c WHERE c.id = p.cliente_id),
           'vehiculo', (SELECT json_build_object(
                          'patente', v.patente, 'marca', v.marca, 'modelo', v.modelo,
                          'version', v.version, 'anio', v.anio, 'color', v.color,
                          'combustible', v.combustible)
                          FROM vehiculos v WHERE v.id = p.vehiculo_id),
           'items', coalesce((
              SELECT json_agg(json_build_object(
                       'tipo', i.tipo, 'descripcion', i.descripcion, 'unidad', i.unidad,
                       'cantidad', i.cantidad::text, 'precioUnitario', i.precio_unitario::text,
                       'subtotal', i.subtotal::text)
                     ORDER BY i.posicion)
                FROM presupuesto_items i WHERE i.presupuesto_id = p.id), '[]'::json)
         ) AS dto
    FROM presupuestos p
   WHERE p.id = $1`;
