# POS Lot Spool Picker — Design

**Módulo:** `pos_lot_spool_picker`
**Target:** Odoo 19 · AlparData POS Enhancement Suite
**Fecha:** 2026-07-14
**Estado:** Diseño aprobado (pendiente review del spec)

## Problema

Cliente que vende cable por metro desde bobinas grandes. Cada bobina es un lote
(`stock.lot`) con un remanente en metros. El popup nativo de lotes del POS de Odoo
es una entrada de texto/escaneo: el cajero tiene que conocer el código de la bobina,
no ve los metros restantes ni la ubicación, no puede repartir cómodo una venta entre
bobinas, y no valida cantidad contra el stock real.

Huecos a resolver (prioridad):
- **A) Visibilidad** — ver bobinas disponibles con metros restantes y ubicación.
- **B) Split / control de cantidad** — repartir una venta entre bobinas con control.
- **C) Sugerencia comercial** — surge sola dándole al vendedor la info de A+B.

## Alcance

- Aplica a **todos los productos trackeados por lote/serie** (reemplaza el popup nativo).
- No se toca el flujo de facturación ni el ticket de cara al cliente.
- No se toca el backend de inventario salvo **un único override** acotado
  (armado de `stock.move.line`).

## Enfoque elegido

Popup OWL propio que se "disfraza" de la entrada nativa de lotes: hace toda la UX
(lista, sugerencia, split, validación) y persiste el resultado en `pack_lot_ids`,
extendido con cantidad por lote. Descartados: extender el popup nativo (pelea con el
split y la sugerencia) y wizard de servidor (rompe la velocidad del mostrador).

## Decisión de fondo: una línea de cara al cliente, split solo por dentro

El cliente debe ver **1 solo producto con la cantidad que pidió** (ej. `Cable X — 1000m`),
no una línea por bobina. Por eso:

- El pedido/ticket mantiene **1 línea** de POS.
- Extendemos `pos.pack.operation.lot` con un campo **`qty`** (metros por lote). Los N lotes
  cuelgan de la misma línea: `A=300, B=300, C=400`.
- Esto mapea nativo al modelo de stock de Odoo: la línea genera **1 `stock.move`**
  (1000m) con **N `stock.move.line`** adentro (uno por lote/ubicación). Un move con
  varias move lines es comportamiento estándar de Odoo.

### Visibilidad por documento

| Documento | Qué muestra |
|-----------|-------------|
| Ticket al cliente | 1 línea, `Cable X — 1000m`. Sin bobinas. |
| Factura | 1 línea de factura, 1000m. Los lotes no van en la factura. |
| Pre-ticket (`pos_retail_pre_ticket`) | 1 línea, 1000m. |
| Picking / depósito | Detalle por bobina: `A=300, B=300, C=400` + ubicación. |

Fuera de v1 (mejora posterior): copia interna del pre-ticket con el desglose de bobinas
para el que corta el cable.

## Arquitectura

**Dependencias:** `point_of_sale`, `stock`.

**Punto de integración:** patch del método del `PosStore` que dispara el popup nativo de
lotes al agregar un producto trackeado; en su lugar abre `SpoolPickerPopup`. El nombre
exacto del método/componente nativo se fija contra el código V19 durante la implementación.

**Datos cargados en el POS al abrir sesión** (modelos nuevos en la lista de carga del POS;
**no se toca `pos.order`** — ver memoria `pos-order-load-fields-all`):
- `stock.lot` — lotes de los productos del POS.
- `stock.quant` — dominio `location_id.usage = 'internal'` y `quantity > 0`, para traer
  metros restantes + ubicación por lote, acotado a lo que hay realmente en stock.

## Componente: `SpoolPickerPopup` (OWL)

Para el producto agregado muestra:
- Encabezado: **metros pedidos** + contador vivo **"Asignado: X / N"** (verde al cerrar).
- Lista de bobinas, cada fila: **código de lote · metros restantes · ubicación**,
  ordenada ascendente por remanente.
- **Pre-selección automática** según el algoritmo de sugerencia.
- Tildar/destildar bobinas y **editar metros por bobina** (override manual); el contador
  se recalcula.
- Botón **Actualizar** (RPC liviano): re-consulta `stock.quant` de ese producto y refresca.
- Botón **Confirmar**, habilitado según el modo de validación.

### Algoritmo de sugerencia (determinístico)

1. Candidatas = bobinas con `remaining > 0`, ordenadas ascendente por remanente.
2. Si existe alguna con `remaining ≥ pedido` → sugerir **la más chica de esas**
   (una sola bobina, anti-retazo).
3. Si no → sumar desde la más chica hacia arriba hasta cubrir el pedido (parciales primero).
4. El vendedor siempre puede reasignar a mano.

## Validación y configuración

**`pos.config.spool_picker_enforce_stock`** (booleano, default `False` = modo aviso).
Visible en Ajustes del POS (Inventario).

- **Modo aviso (default):** si lo asignado supera el remanente de alguna bobina, fila en
  rojo con detalle, pero **deja confirmar** (el metraje físico del cable nunca es exacto).
- **Modo bloqueo (`True`):** Confirmar deshabilitado hasta que ninguna bobina se pase de
  su remanente.
- **Asignado < pedido:** permitido en ambos modos (el vendedor cierra con lo que hay);
  aviso suave no bloqueante para evitar errores por descuido.

## Frescura del stock entre cajas

Los metros se cargan al abrir la sesión. Manejo en v1:
- **Mismo pedido:** se descuenta en vivo lo que el propio ticket ya asignó.
- **Entre cajas / backend:** el número puede quedar viejo. Como el default es modo aviso,
  a lo sumo dispara una alerta imprecisa; **la verdad la valida el picking en el servidor**
  al cerrar. El inventario no se rompe.
- **Botón Actualizar** refresca por RPC antes de confirmar.

Limitación conocida (documentada en README): en modo bloqueo el dato puede quedar
levemente viejo entre cajas; Actualizar es la vía para refrescar.

## Testing

**Backend (`TransactionCase`):**
- Override de move lines: línea con pack-lots `A=300, B=300, C=400` → 1 move con 3 move
  lines con esos metros y lotes exactos.
- Una sola bobina → 1 move, 1 move line (equivale a lo nativo).
- `qty` en `pos.pack.operation.lot` se persiste y sincroniza.

**Frontend (unit, algoritmo de sugerencia):**
- Existe bobina ≥ pedido → sugiere la más chica que alcanza.
- Ninguna alcanza sola → suma parciales de menor a mayor hasta cubrir.
- Contador asignado/pedido y estados verde/rojo.
- Modo aviso vs bloqueo: habilitación del botón Confirmar.

**Tour de integración (stretch v1):** agregar cable trackeado → abre `SpoolPickerPopup`
→ confirmar split → verificar 1 línea en el ticket y `pack_lot_ids` con qty.

## Fuera de alcance (v1)

- Copia interna del pre-ticket con desglose de bobinas.
- Reserva de stock en tiempo real / sincronización entre cajas más allá del botón Actualizar.
- Criterios de sugerencia alternativos (FEFO, etc.) — el actual es fijo, no configurable.
