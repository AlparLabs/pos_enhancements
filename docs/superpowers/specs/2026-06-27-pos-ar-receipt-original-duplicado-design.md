# Diseño: copias ORIGINAL / DUPLICADO en el recibo POS Argentina

**Fecha:** 2026-06-27
**Módulo:** `pos_l10n_ar_receipt`
**Versión Odoo:** 19.0

## Problema

Un cliente necesita que, por un tema de control interno, el punto de venta
imprima dos copias del comprobante de una venta facturada: una marcada
**ORIGINAL** y otra marcada **DUPLICADO**. Hoy el recibo imprime una sola copia
y la etiqueta `- ORIGINAL -` está fija en el encabezado
(`static/src/app/order_receipt.xml`, herencia de `point_of_sale.ReceiptHeader`).

## Decisiones de alcance

- **Configurable por punto de venta**: cada caja decide si imprime 1 copia o
  ORIGINAL + DUPLICADO (no es global, no es siempre).
- **Dos copias** con etiquetas **ORIGINAL** y **DUPLICADO** (no TRIPLICADO, no
  cantidad variable).
- **Solo ventas facturadas** (con datos ARCA: tipo de documento / CAE). Los
  tickets comunes no fiscales siguen saliendo una sola vez. Es exactamente donde
  hoy aparece la etiqueta ORIGINAL.
- Sin marca extra tipo "COPIA – NO VÁLIDO COMO FACTURA": la única diferencia
  visible entre copias es la palabra ORIGINAL vs DUPLICADO en la línea del
  encabezado.

## Arquitectura

Toda la impresión del recibo (auto al cobrar y botón manual "Imprimir recibo")
pasa por un único método: `pos.printReceipt({ order, basic, printBillActionTriggered })`
en `point_of_sale/app/services/pos_store.js`, que internamente llama a
`this.printer.print(OrderReceipt, { order, basic_receipt }, this.printOptions)`.

Ese chokepoint único es donde se engancha la impresión de la segunda copia.

### 1. Configuración (servidor)

- Nuevo campo `Boolean l10n_ar_receipt_print_duplicate` en `pos.config`
  (default `False`, string "Imprimir Original y Duplicado (AR)").
- Exponer el campo al frontend POS. **Nota técnica:** a diferencia de la mayoría
  de modelos, `pos.config` NO carga sus campos vía la lista de
  `_load_pos_data_fields` (el core agrega los campos a mano en su override de
  `_load_pos_data_read`). Para exponer el nuevo campo hay que sumarlo en el
  override de `_load_pos_data_read` de `pos.config`, siguiendo el patrón ya usado
  en `pos_centralized_payment/models/pos_config.py` de este repo.
- UI: surface del checkbox en *Ajustes → Punto de Venta*, sección
  **Facturas y Recibos**, vía `res.config.settings` con el campo
  `pos_l10n_ar_receipt_print_duplicate` mapeado a `pos.config` (lugar canónico de
  las opciones de recibo). Si resultara más simple, alternativa: agregarlo
  directo al form view de `pos.config`.

### 2. Etiqueta dinámica (template)

- En `static/src/app/order_receipt.xml`, herencia de `point_of_sale.ReceiptHeader`,
  reemplazar el texto fijo `- ORIGINAL -` (línea ~12) por una etiqueta que sale
  de un estado transitorio de la orden, con fallback a `'ORIGINAL'`. Ejemplo
  conceptual: `- <t t-esc="order.uiState.l10nArReceiptCopy or 'ORIGINAL'"/> -`.
- Con una sola copia el texto sigue siendo exactamente `ORIGINAL`, idéntico a hoy.

### 3. Impresión de la copia (frontend)

- Patch de `pos.printReceipt` (en `services/`), con `patch(PosStore.prototype, ...)`:
  1. Setear etiqueta = ORIGINAL e invocar `super.printReceipt(...)` (comportamiento
     actual, incluye conteo de `nb_print`).
  2. Si se cumplen TODAS las condiciones, imprimir la copia DUPLICADO:
     - `this.config.l10n_ar_receipt_print_duplicate` está activo,
     - la orden es factura (tiene `order.l10n_ar_document_type_name`),
     - `!basic` (no es recibo básico),
     - `!printBillActionTriggered` (no es pre-cuenta / imprimir cuenta).
  3. Para la copia: setear etiqueta = DUPLICADO y llamar **directamente** a
     `this.printer.print(OrderReceipt, { order, basic_receipt: basic }, this.printOptions)`
     (evita re-ejecutar la lógica de `nb_print`: la copia de control no cuenta
     como reimpresión).
  4. `finally`: restaurar la etiqueta a ORIGINAL / limpiar el estado transitorio.

### Por qué estado transitorio en la orden

La etiqueta se guarda en `order.uiState` (estado transitorio de UI, no persistido
en DB). El template del `ReceiptHeader` recibe `order` y puede leerlo sin
necesidad de patchear props de componentes ni sobrescribir el template de
`OrderReceipt` para pasar una prop. Cada `printer.print` hace un render fresco,
así que lee el valor vigente al momento de imprimir.

> A confirmar en la implementación: que `order.uiState` exista y sea el lugar
> idiomático para estado transitorio en el modelo de orden del POS 19. Si no,
> usar una propiedad transitoria equivalente en la orden.

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| Opción desactivada | Idéntico a hoy: una sola copia ORIGINAL |
| Orden no facturada (ticket común) | Una sola copia, sin etiqueta de copia |
| Recibo básico (`basic`) | Sin duplicado |
| Pre-cuenta / imprimir cuenta (`printBillActionTriggered`) | Sin duplicado |
| Reimpresión manual de una factura | Respeta la config: si está activa, vuelve a salir Original + Duplicado |

## Fuera de alcance

- TRIPLICADO o cantidad configurable de copias.
- Etiqueta de copia en tickets no fiscales.
- Texto legal adicional ("COPIA – NO VÁLIDO COMO FACTURA").

## Archivos afectados (estimado)

- `pos_l10n_ar_receipt/models/pos_config.py` (nuevo): campo + exposición a POS.
- `pos_l10n_ar_receipt/models/res_config_settings.py` (nuevo): campo settings.
- `pos_l10n_ar_receipt/views/res_config_settings_views.xml` (nuevo): checkbox UI.
- `pos_l10n_ar_receipt/static/src/app/order_receipt.xml`: etiqueta dinámica.
- `pos_l10n_ar_receipt/static/src/app/pos_store_patch.js` (nuevo): patch de
  `printReceipt`.
- `pos_l10n_ar_receipt/__manifest__.py`: registrar JS y data del view.
- `pos_l10n_ar_receipt/models/__init__.py`: importar nuevos modelos.
