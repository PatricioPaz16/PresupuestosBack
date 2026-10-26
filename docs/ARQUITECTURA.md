# Arquitectura — Presupuestos de Taller

Documento de referencia del sistema: qué problema resuelve, cómo está armado, el modelo de
datos y por qué se tomó cada decisión. La pantalla de armado del presupuesto (componentes,
estado, teclado) está detallada en el front: `PresupuestosFront/docs/PANTALLA-PRESUPUESTO.md`.

---

## 1. El problema

Un taller mecánico arma presupuestos con dos tipos de renglones: **repuestos** y **mano de
obra**. Muchos repuestos no están en stock: se cotizan por teléfono en la repuestera en el
momento y el precio cambia seguido. Por eso:

- Cada renglón se carga desde un catálogo (lo frecuente) **o** se escribe libre, tal como lo
  dictó la repuestera ("modo repuestera").
- El precio de cada renglón es una **foto** del momento: editarlo no toca el catálogo y
  cambiar el catálogo no altera presupuestos ya hechos.
- El taller anota el **costo** y el **proveedor** para saber cuánto gana, pero eso nunca
  sale impreso ni por WhatsApp.
- El sistema lo usan **varios talleres**, cada uno con sus usuarios, y ninguno puede ver
  datos de otro.

---

## 2. Vista general

```
┌──────────────────────────┐   HTTPS + cookies HttpOnly   ┌──────────────────────────────┐
│  PresupuestosFront        │ ───────────────────────────▶ │  PresupuestosBack (NestJS)   │
│  Angular 21 (signals)     │      JSON, importes como     │                              │
│  - Armado por teclado     │      texto "12345.67"        │  Guards: JWT + sesión activa │
│  - Totales en vivo        │ ◀─────────────────────────── │          + rol (ADMIN/USER)  │
│  - Vista A4 / PDF         │                              │  TenantService.run(taller)   │
│  - WhatsApp (wa.me)       │                              │    BEGIN                      │
└──────────────────────────┘                              │    SET LOCAL ROLE app         │
                                                          │    set app.taller_id          │
                                                          │    ...consultas...            │
                                                          │    COMMIT                     │
                                                          └──────────────┬───────────────┘
                                                                         │
                                                          ┌──────────────▼───────────────┐
                                                          │  PostgreSQL 14+              │
                                                          │  - RLS por taller (FORCE)    │
                                                          │  - FKs compuestas (taller,id)│
                                                          │  - Triggers: número, totales │
                                                          │  - Columna generada subtotal │
                                                          │  - pg_trgm + unaccent        │
                                                          └──────────────────────────────┘
```

Reparto de responsabilidades:

| Capa | Se ocupa de | No se ocupa de |
|------|-------------|----------------|
| Front | Carga rápida, formato argentino ("1.500,50"), totales en vivo con la misma aritmética que la base, impresión | Ser la fuente de verdad de importes |
| API | Autenticación, permisos, validación de entrada, normalizar patentes y teléfonos, transiciones de estado, armar el documento imprimible | Calcular totales (los lee de la base) |
| Base | Aislamiento entre talleres, integridad, numeración, **todos los importes** | — |

---

### Despliegue

```
navegador ─▶ Vercel (front estático) ─/api/*─▶ Render (API NestJS) ─SSL─▶ Supabase (pooler)
```

El front y la API se ven desde el mismo dominio gracias a la reescritura de Vercel: las
cookies de sesión son del propio sitio (Safari las acepta) y no hay CORS. Detalle de la
configuración en `SETUP.md`, sección 7b.

---

## 3. Multi-taller

### Modelo

- `talleres` es el *tenant*. Cada `user` tiene un `taller_id` (un usuario = un taller).
  ADMIN y USER son roles **dentro** de su taller.
- Todas las tablas de negocio llevan `taller_id` con valor por defecto `app_taller_id()`
  (el taller de la transacción en curso): la API no tiene que acordarse de completarlo.

### Dos capas de aislamiento

1. **Row Level Security.** Cada operación de negocio corre en una transacción que hace
   `SET LOCAL ROLE presupuestos_app` y fija `app.taller_id`. Las políticas exigen
   `taller_id = app_taller_id()` para leer **y** escribir (`USING` + `WITH CHECK`). Las
   tablas tienen `FORCE ROW LEVEL SECURITY`, y el cambio de rol hace que valga aunque la
   API se conecte como `postgres`. Si una consulta se olvida el `WHERE taller_id`, igual no
   ve datos ajenos; sin contexto, no ve nada.
2. **Claves foráneas compuestas** `(taller_id, id)`. La base rechaza un presupuesto de un
   taller que apunte a un vehículo, cliente, ítem de catálogo o usuario de otro.

El rol de negocio no tiene permisos sobre `users`, `refresh_tokens` ni `roles`: aunque
hubiera un error en una consulta de negocio, no puede leer credenciales.

En Supabase hay además roles web (`anon`, `authenticated`) a los que la plataforma da
acceso a todo lo nuevo de `public` para su API REST. La migración `CerrarAccesoExterno`
se lo quita, cambia los permisos por defecto para tablas futuras y activa RLS en las tablas
de autenticación.

### Alta de talleres

`npm run taller:crear -- --nombre … --email … --password …` crea el taller y su primer
administrador. Un panel de "dueño de la plataforma" para administrar talleres desde la web
queda para una versión siguiente (ver §11).

---

## 4. Modelo de datos

```
talleres ─┬─< users
          ├─< numeradores            (último número usado por taller)
          ├─< clientes ─┬─< vehiculos
          │             └──────────────┐
          ├─< catalogo_items           │
          └─< presupuestos >───────────┘ (cliente_id: a quién se le cotizó)
                 │   >── vehiculos
                 │   >── users (creado_por)
                 └─< presupuesto_items >── catalogo_items (opcional: NULL = concepto libre)
```

### talleres

Datos del encabezado del presupuesto y valores por defecto.

| Campo | Tipo | Notas |
|-------|------|-------|
| nombre, razon_social | text | El nombre comercial sale grande en el encabezado |
| cuit | text | 11 dígitos, se imprime con guiones |
| condicion_iva | enum | monotributo, responsable_inscripto, exento |
| direccion, localidad, telefono, email | text | Encabezado |
| logo_data_url | text | PNG/JPEG/WebP en base64, ≤ 300 KB aprox.; el front lo achica a 600×240 |
| zona_horaria | text | Para la fecha de emisión ("hoy" del taller, no del servidor) |
| validez_dias_default | smallint | 1–90, por defecto 5 |
| iva_porcentaje_default | numeric(5,2) | 0, 10,5 o 21 |
| recargo_sugerido_porcentaje | numeric(6,2) | Precio propuesto = costo + recargo |
| texto_condiciones | text | Pie del presupuesto; admite `{validez}` y `{vencimiento}` |
| activo | boolean | Desactivar un taller corta el acceso de todos sus usuarios |

### clientes

| Campo | Tipo | Notas |
|-------|------|-------|
| nombre, apellido | text | |
| razon_social | text | Empresa / flota |
| telefono | text | Normalizado a E.164 (`+5493511234567`) para WhatsApp; se busca por teléfono |
| email | text | |
| documento | text | DNI o CUIT, solo dígitos |
| notas | text | Internas |
| archivado_en | timestamptz | Baja lógica ("dar de baja"): no aparece al buscar ni en los desplegables |
| busqueda | text generada | nombre + apellido + razón social sin acentos, con índice trigram |

### vehiculos

| Campo | Tipo | Notas |
|-------|------|-------|
| cliente_id | uuid | **Dueño actual**. Cada presupuesto guarda además su propio cliente |
| patente | text (collation C) | Normalizada sin espacios ni guiones: `AB123CD`, `ABC123`. **Única por taller** |
| marca, modelo, version | text | version = motor/versión ("1.6 16v") |
| anio, color | | |
| combustible | enum | nafta, diesel, nafta_gnc, hibrido, electrico, otro |
| vin | text | 17 caracteres, opcional |
| archivado_en | timestamptz | Baja lógica. La patente sigue reservada: al escribirla se ofrece darla de alta de nuevo |

### Alta y baja, cambio de dueño

- **Baja de un vehículo** (`POST /vehiculos/:id/baja`): deja de aparecer en búsquedas y
  listas; sus presupuestos quedan. No se le pueden hacer presupuestos nuevos (la API
  responde 400) hasta darlo de **alta** de nuevo (`POST /vehiculos/:id/alta`). Si el dueño
  también estaba dado de baja, vuelve con el vehículo.
- **Baja de un cliente** (`POST /clientes/:id/baja`): se dan de baja él y sus vehículos
  activos con la **misma marca de tiempo**. El alta devuelve exactamente esos vehículos, no
  los que ya estaban dados de baja de antes.
- **Cambio de dueño** (`PATCH /vehiculos/:id/duenio`, a un cliente existente o a uno nuevo
  en la misma transacción): cambia `vehiculos.cliente_id`. Los presupuestos anteriores
  conservan su `cliente_id`, así el historial de cada cliente no cambia.

### catalogo_items

Repuestos y trabajos frecuentes en **una** tabla (`tipo`).

| Campo | Tipo | Notas |
|-------|------|-------|
| tipo | enum | repuesto / trabajo |
| nombre, marca, codigo | text | Único por taller entre los activos (nombre + marca) |
| unidad | enum | u, l, kg, m, h, jgo |
| precio_referencia, costo_referencia | numeric(14,2) | Punto de partida; en el presupuesto se pueden cambiar |
| precio_actualizado_en | timestamptz | El front avisa si el precio tiene más de 45 días |
| veces_usado, ultimo_uso_en | | Ordenan las sugerencias del autocompletado |
| activo | boolean | Lo usado en presupuestos no se borra: se desactiva |

### presupuestos

| Campo | Tipo | Notas |
|-------|------|-------|
| numero | integer | Correlativo **por taller**, lo asigna la base. Se muestra como `00124` |
| cliente_id, vehiculo_id | uuid | |
| estado | enum | borrador, enviado, aprobado, rechazado |
| fecha_emision | date | Por defecto, hoy en la zona horaria del taller |
| validez_dias | smallint | `valido_hasta` = fecha + validez (se calcula al leer) |
| kilometraje | integer | |
| motivo_ingreso | text | Lo que cuenta el cliente |
| diagnostico | text | Lo que encontró el mecánico (se imprime) |
| notas_cliente | text | Se imprimen |
| notas_internas | text | No se imprimen |
| descuento_tipo, descuento_valor | enum, numeric | Porcentaje o monto fijo |
| iva_porcentaje | numeric(5,2) | 0 = precios finales |
| subtotal_repuestos, subtotal_trabajos, descuento_monto, iva_monto, total | numeric(18,2) | **Calculados por trigger** |
| costo_total | numeric(18,2) | Interno: suma de costos cargados |
| creado_por | uuid | Usuario que lo creó |
| enviado_en, respondido_en | timestamptz | Los marca el trigger al cambiar de estado |
| version | integer | Concurrencia optimista |

### presupuesto_items

| Campo | Tipo | Notas |
|-------|------|-------|
| posicion | smallint | Orden; único por presupuesto (diferible, para reordenar) |
| tipo | enum | repuesto / trabajo |
| catalogo_item_id | uuid | `NULL` = concepto libre (modo repuestera) |
| descripcion | text | Se imprime |
| proveedor | text | **Interno**: dónde se compró o cotizó |
| unidad | enum | |
| cantidad | numeric(10,3) | Admite 4,5 litros |
| precio_costo | numeric(14,2) | **Interno** |
| precio_unitario | numeric(14,2) | Precio al cliente, foto del momento |
| subtotal | numeric(18,2) generada | `round(cantidad * precio_unitario, 2)` |

### Del pedido original a este modelo

| Pedido | Quedó como | Por qué |
|--------|-----------|---------|
| `clientes.empresa` | `razon_social` | Es lo que va en un presupuesto a empresas |
| `clientes.createdAt` | `created_at` + `updated_at` | Convención de la base |
| — | `clientes.documento`, `notas`, `archivado_en` | DNI/CUIT para facturar después; baja sin perder historial |
| `autos` | `vehiculos` | También entran motos y utilitarios |
| `autos.patente` única | única **por taller**, normalizada | Dos talleres pueden atender el mismo auto; "ab 123 cd" y "AB-123-CD" son la misma |
| — | `vehiculos.version`, `combustible`, `vin`, `notas` | Datos que el mecánico necesita para cotizar el repuesto correcto |
| `repuestos_frecuentes` + `trabajos_frecuentes` | `catalogo_items` con `tipo` | Mismos campos; una sola búsqueda y una sola pantalla |
| `numero_presupuesto` ("#00124") | `numero` entero + formato en pantalla | Ordena bien, no admite texto inválido, la base lo asigna sin repetidos |
| `auto_id` | `vehiculo_id` | |
| `total` | `total` + subtotales, descuento, IVA, costo | Calculados por la base |
| — | `validez_dias`, `kilometraje`, `diagnostico`, `notas_internas` | Datos de cualquier presupuesto de taller |
| — | `creado_por`, `enviado_en`, `respondido_en`, `version` | Trazabilidad y concurrencia |
| `presupuesto_detalles` | `presupuesto_items` | |
| `es_concepto_libre` | se deduce de `catalogo_item_id IS NULL` | Un dato derivado no se guarda dos veces |
| `descripcion_item` | `descripcion` | |
| — | `posicion`, `unidad`, `proveedor` | Orden estable, litros/juegos/horas, dónde se cotizó |
| `subtotal` | columna generada | No puede quedar desincronizado |

Quedó afuera a propósito: **stock** (el taller no lo maneja así), **facturación** (el
documento lleva la leyenda "no válido como factura"), y precios en dólares.

---

## 5. Importes

Toda la aritmética de dinero es decimal exacta (`numeric` en la base, `BigInt` en el front;
nunca `float`).

```
subtotal ítem      = round(cantidad × precio_unitario, 2)
base               = Σ subtotales (repuestos + mano de obra)
descuento          = porcentaje: round(base × % / 100, 2)
                     monto:      min(monto, base)
IVA                = round((base − descuento) × alícuota / 100, 2)
total              = base − descuento + IVA
ganancia (interna) = base − descuento − Σ round(cantidad × costo, 2)
```

- Redondeo "mitad hacia arriba" igual que PostgreSQL. El front usa la misma fórmula para
  mostrar los totales mientras se escribe; al guardar, manda **solo** cantidades y precios y
  muestra lo que devuelve la base.
- Ejemplo verificado en los tests: 4,5 × 12.345,67 = 55.555,515 → **55.555,52**.
- Cómo se mantienen: un trigger *por sentencia* en `presupuesto_items` "toca" el
  presupuesto una vez y el trigger `BEFORE` de `presupuestos` recalcula todo. Si alguien
  escribe un total a mano en la base, se recalcula.

---

## 6. Numeración

`numeradores (taller_id, entidad, ultimo_valor)`. El trigger de alta hace
`INSERT … ON CONFLICT DO UPDATE SET ultimo_valor = ultimo_valor + 1 RETURNING`, que bloquea
la fila del taller hasta el `COMMIT`: dos altas simultáneas nunca reciben el mismo número
(probado con 6 altas en paralelo). Desde *Configuración* el administrador puede fijar el
**próximo número** para seguir la numeración de un talonario anterior (nunca por debajo de
uno ya usado).

---

## 7. Estados

```
            ┌──────────── enviar (WhatsApp lo hace solo) ───────────┐
            │                                                        ▼
       ┌─────────┐ ◀──────── volver a borrador ──────────── ┌─────────┐
       │ borrador│                                          │ enviado │
       └────┬────┘                                          └────┬────┘
            │ aprobado / rechazado                               │ aprobado / rechazado
            ▼                                                    ▼
       ┌──────────┐                         ┌──────────┐
       │ aprobado │  (final)                │ rechazado│ ── volver a borrador ──▶ borrador
       └──────────┘                         └──────────┘
```

- Se editan en **borrador** y **enviado** (al editar uno enviado, la pantalla recuerda
  reenviarlo). Aprobado y rechazado quedan fijos: para recotizar se **duplica**.
- Para pasar a enviado o aprobado tiene que tener al menos un ítem.
- Solo se eliminan borradores.
- **Vencido** no es un estado: es un enviado cuya fecha de validez ya pasó (se calcula al
  mostrar).
- Duplicar copia ítems y textos, toma la fecha de hoy y el dueño **actual** del vehículo.

---

## 8. Concurrencia

Cada presupuesto tiene `version`. `PUT /presupuestos/:id` exige la versión que se estaba
editando; la API bloquea la fila (`FOR UPDATE`), compara y, si otra persona guardó antes,
responde **409** con `code: "VERSION_CONFLICTO"` y el front avisa sin pisar nada.

Los ítems se guardan por diferencia (se actualizan solo los que cambiaron, se insertan los
nuevos y se borran los quitados) en una sola transacción.

---

## 9. Documento para el cliente

`GET /presupuestos/:id/documento` devuelve un DTO **separado**, armado para el cliente:
datos del taller (con logo), cliente, vehículo, kilometraje, motivo, diagnóstico, ítems
**sin** costo ni proveedor, totales, observaciones, condiciones con la validez y la fecha
de vencimiento ya reemplazadas, y la leyenda "Documento no válido como factura." Las notas
internas, el costo total y la ganancia no están en ese DTO: no hay forma de que la vista de
impresión o el mensaje de WhatsApp los muestren por error.

- **Imprimir:** página A4 propia (`@page`, numeración de páginas) y nombre de archivo
  sugerido "Presupuesto 00124 - AB123CD - Taller".
- **PDF real** (`GET /presupuestos/:id/pdf`): lo arma el servidor con pdfmake, con el mismo
  diseño y las mismas fuentes (IBM Plex) que la hoja de la pantalla, a partir del mismo DTO.
  pdfmake no puede leer archivos ni bajar nada de internet (las fuentes van en memoria y el
  logo solo se acepta como PNG/JPEG en data URL).
- **Enlace para el cliente** (`POST /presupuestos/:id/enlace` → `<front>/p/<token>`): el
  cliente lo abre sin usuario, ve la hoja y baja el PDF. Tabla `presupuesto_enlaces`
  (migración `EnlacePublico`), borrado en cascada con el presupuesto.
  - El token (54 caracteres) es el id del taller más 24 bytes aleatorios. La API abre la
    transacción dentro de ese taller y busca el enlace con RLS, como cualquier consulta:
    no hay ningún permiso para leer "de todos los talleres". Con otro id de taller adelante,
    el enlace no existe.
  - Registra la primera y la última vez que lo abrió el cliente y cuántas veces. No cuenta
    la descarga del PDF ni las visitas de usuarios del propio taller con la sesión abierta
    en ese navegador (se reconoce su cookie de acceso, que dura 15 minutos). Abierto desde
    un navegador sin sesión (por ejemplo, el celular del dueño), cuenta como una visita más.
  - Límite de 60 pedidos por minuto por IP; si el taller está desactivado, el enlace no
    funciona.
- **WhatsApp:** abre `wa.me/<teléfono E.164>` con el saludo, el total, la validez y el link.
  Si el link no se pudiera generar, manda el resumen con los ítems. Si estaba en borrador,
  lo pasa a enviado.
- **Compartir PDF (celular):** el navegador baja el PDF y abre el menú de compartir del
  teléfono (Web Share API) para mandarlo como archivo por WhatsApp, WhatsApp Business o
  mail. En la PC, "Descargar PDF".

---

## 10. Sesión y permisos

- JWT de acceso (15 min) en cookie HttpOnly, refresh token (7 días) rotado y guardado como
  hash. El JWT lleva `sid` (la sesión): en cada pedido se verifica que la sesión siga
  activa, así que logout, cambio de contraseña o desactivar al usuario cortan el acceso
  enseguida.
- `@Roles(ADMIN)`: usuarios, configuración del taller y ajuste masivo de precios.
- Un administrador no puede desactivarse ni quitarse el rol a sí mismo (evita talleres sin
  administrador).

---

## 11. Decisiones

| Decisión | Alternativa descartada | Motivo |
|----------|------------------------|--------|
| Totales en la base (triggers) | Calcular en la API | Una sola fuente de verdad, imposible de saltear desde otro cliente o un script |
| RLS + FKs compuestas | Solo `WHERE taller_id` en cada consulta | Un olvido en una consulta no expone datos de otro taller |
| Un usuario = un taller | Tabla de membresías (un usuario en varios talleres) | Más simple para el caso real; se puede agregar después sin romper datos |
| Precio "foto" en cada ítem | Referenciar siempre el catálogo | Los precios de repuestos cambian todo el tiempo |
| Catálogo único con `tipo` | Dos tablas | Mismos campos, una búsqueda |
| Importes como texto en la API | `number` de JavaScript | Evita errores de coma flotante |
| Solo migraciones | `synchronize` de TypeORM | No crea triggers, políticas ni columnas generadas, y puede borrar datos |
| Logo en la base (data URL) | Archivos en disco o S3 | Un archivo chico; cero infraestructura extra |
| Normalizar patente y teléfono al guardar | Guardar como se tipeó | Búsquedas exactas, WhatsApp sin errores |
| Baja lógica (`archivado_en`) de clientes y vehículos | Borrar | Los presupuestos los referencian; la patente queda reservada y se puede revertir |
| PDF en el servidor con pdfmake | Chromium sin pantalla (Puppeteer) | Mismo diseño sin cargar un navegador entero en un servidor de 512 MB |
| Taller dentro del token del enlace público | Función que saltee RLS para buscar el token | El enlace se resuelve con el mismo aislamiento que el resto de la API |

---

## 12. Para una versión siguiente

- Panel web del dueño de la plataforma para crear y suspender talleres.
- Facturación electrónica con ARCA (presupuesto aprobado → factura con CAE y QR).
- Que el cliente apruebe o rechace el presupuesto desde el link.
- Orden de trabajo a partir de un presupuesto aprobado (horas reales, repuestos usados).
- Envío por email con el PDF adjunto (hoy: link y PDF por WhatsApp).
- Fotos del vehículo o del daño adjuntas al presupuesto.
- Paquetes de ítems ("Service 10.000 km") que se agregan de una.
- Historial de precios por repuesto y por proveedor.
- Usuarios en más de un taller (membresías).
- Reportes: aprobados vs. rechazados, ganancia por período.
