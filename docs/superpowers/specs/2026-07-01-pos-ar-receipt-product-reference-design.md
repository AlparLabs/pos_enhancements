# Diseño: referencia interna del producto antes del nombre en el ticket AR

**Fecha:** 2026-07-01
**Módulo:** `pos_l10n_ar_receipt`
**Versión Odoo:** 19.0

## Problema

En `pos_retail_pre_ticket` el pre-ticket ya muestra la referencia interna
(`default_code`) del producto en negrita antes de su nombre. Se quiere el mismo
comportamiento en el ticket/factura que imprime `pos_l10n_ar_receipt`, pero no
todas las empresas lo quieren activo: tiene que ser opcional, configurable por
punto de venta, y sentar la base para que en el futuro puedan sumarse más
booleanos de configuración específicos de este módulo sin rediseñar nada.

## Decisiones de alcance

- **Configurable por punto de venta** (`pos.config`), igual que el toggle de
  Original/Duplicado ya existente en este mismo módulo. No es a nivel compañía.
- **Default desactivado**: no cambia el comportamiento de instalaciones
  existentes; cada punto de venta lo activa si lo necesita.
- **Solo afecta el ticket impreso** (modo `receipt` del componente
  `Orderline`), nunca el carrito en pantalla mientras el cajero carga
  productos. Mismo criterio de acotamiento que usó `pos_retail_pre_ticket` al
  aislar su cambio del `Orderline` estándar.
- **Formato**: referencia en negrita + espacio, luego el nombre del producto
  (idéntico al patrón visual de `pos_retail_pre_ticket`). No se agregan
  corchetes ni separadores.
- El toggle se agrega **al lado** del ajuste `l10n_ar_receipt_print_duplicate`
  ya existente en la sección "Bills & Receipts" de Ajustes → Punto de Venta,
  para que ambos (y los que se sumen después) queden agrupados como opciones de
  este módulo.

## Arquitectura

### 1. Configuración (servidor)

`pos_l10n_ar_receipt/models/pos_config.py` ya existe y ya expone
`l10n_ar_receipt_print_duplicate` con la nota técnica de que **`pos.config` no
carga sus campos vía `_load_pos_data_fields`** (el core los agrega a mano en su
propio override de `_load_pos_data_read`). Se sigue exactamente ese patrón ya
establecido en el archivo:

- Nuevo campo `l10n_ar_show_product_reference` (`Boolean`, default `False`,
  string "Show Internal Reference on Receipt").
- Se agrega su lectura dentro del `_load_pos_data_read` que ya existe en la
  clase, junto a la línea de `l10n_ar_receipt_print_duplicate`.

`pos_l10n_ar_receipt/models/res_config_settings.py` ya existe con el patrón
`related` estándar. Se agrega el campo espejo:

```python
pos_l10n_ar_show_product_reference = fields.Boolean(
    string='Show Internal Reference on Receipt',
    related='pos_config_id.l10n_ar_show_product_reference',
    readonly=False,
)
```

`pos_l10n_ar_receipt/views/res_config_settings_views.xml` ya existe e inserta
`l10n_ar_receipt_print_duplicate` después de `auto_printing`. Se agrega el
nuevo `<setting>` como hermano, dentro del mismo `position="after"`:

```xml
<setting
    id="l10n_ar_show_product_reference"
    string="Product Reference (AR)"
    help="Print the product's internal reference (default code) before its name on the invoiced receipt.">
    <field name="pos_l10n_ar_show_product_reference" widget="boolean_toggle"/>
</setting>
```

No hace falta tocar `__manifest__.py`: no hay archivos nuevos, y la vista ya
está registrada en `data`.

### 2. Plantilla del ticket (frontend)

En Odoo 19, `point_of_sale.Orderline` es el **mismo** componente usado tanto en
pantalla (`mode="display"`) como en el ticket (`mode="receipt"`, seteado
explícitamente por `OrderReceipt`). El nombre del producto se imprime así:

```xml
<span class="text-wrap d-inline">
    <t t-esc="vals.name" /><br/>
    ...
</span>
```

Se agrega un nuevo template en `order_receipt.xml` (mismo archivo donde ya
viven las herencias de `OrderReceipt` y `ReceiptHeader` de este módulo),
heredando `point_of_sale.Orderline` en **modo extensión** (no modo primario:
acá sí queremos modificar el componente compartido, pero acotado por la
condición `mode === 'receipt'`):

```xml
<t t-name="pos_l10n_ar_receipt.Orderline" t-inherit="point_of_sale.Orderline" t-inherit-mode="extension">
    <xpath expr="//span[hasclass('text-wrap')]/t[@t-esc='vals.name']" position="before">
        <span t-if="props.mode === 'receipt' and line.config.l10n_ar_show_product_reference and line.product_id.default_code"
              class="fw-bolder pe-1"
              t-esc="line.product_id.default_code"/>
    </xpath>
</t>
```

- `props.mode === 'receipt'` limita el cambio al ticket impreso.
- `line.config` es el getter estándar de `pos.order.line` que resuelve el
  `pos.config` de la orden (mismo mecanismo que usan otros módulos de este
  repo, p.ej. los checks de `iface_tax_included`).
- `line.product_id.default_code` ya viaja al frontend sin cambios: es un campo
  estándar de `product.product`, igual que en `pos_retail_pre_ticket`.
- No hace falta ningún archivo `.js` nuevo ni una clase de componente nueva
  (a diferencia de `pos_retail_pre_ticket`, que sí creó `PreTicketOrderline`
  porque ahí el objetivo era *aislar* el pre-ticket del resto; acá el objetivo
  es lo opuesto, modificar el ticket estándar pero solo cuando se imprime).
- El archivo ya está cubierto por el glob `static/src/app/**/*.xml` del
  manifest, así que no requiere tocar `__manifest__.py`.

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| Toggle desactivado (default) | Idéntico a hoy: solo el nombre del producto |
| Toggle activo, producto sin `default_code` | Solo el nombre, sin espacio/prefijo vacío (por la condición `and line.product_id.default_code`) |
| Toggle activo, carrito en pantalla (`mode="display"`) | Sin cambios: no se muestra la referencia |
| Toggle activo, línea de combo (sub-producto) | Se muestra la referencia del sub-producto igual que su nombre, mismo criterio que el resto del ticket |
| Reimpresión manual del ticket | Respeta el valor vigente del toggle en `pos.config` |

## Fuera de alcance

- Configuración a nivel compañía/contabilidad (se deja para si en el futuro
  hace falta compartir el valor entre varios puntos de venta).
- Mostrar la referencia en el carrito en pantalla.
- Cualquier otro booleano de configuración del módulo más allá de este.

## Archivos afectados

- `pos_l10n_ar_receipt/models/pos_config.py`: nuevo campo + su exposición en
  `_load_pos_data_read` (existente, se edita).
- `pos_l10n_ar_receipt/models/res_config_settings.py`: nuevo campo `related`
  (existente, se edita).
- `pos_l10n_ar_receipt/views/res_config_settings_views.xml`: nuevo
  `<setting>` (existente, se edita).
- `pos_l10n_ar_receipt/static/src/app/order_receipt.xml`: nueva herencia de
  `point_of_sale.Orderline` (existente, se edita).
