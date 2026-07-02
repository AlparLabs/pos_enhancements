# Diseño: registrar el vendedor de mostrador en `pos_centralized_payment`

**Fecha:** 2026-07-01
**Módulo:** `pos_centralized_payment`
**Versión Odoo:** 19.0

## Problema

En el flujo de caja centralizada, un vendedor arma el pedido en su propia
terminal y, como no tiene permiso para cobrar, aprieta "Enviar a caja"
(`clickQueueOrder()` en
`static/src/overrides/components/product_screen/product_screen.js`), que
imprime un pre-ticket y estaciona la orden (`clickSaveOrder()`). Más tarde el
cajero (rol Manager) abre esa orden estacionada y la cobra.

Hoy no queda registro de quién armó originalmente el pedido: cuando el cajero
cobra, el campo "responsable" de la orden termina reflejando al cajero, no al
vendedor de mostrador que cargó los productos. Se pierde ese dato para
reportes.

## Decisiones de alcance

- **Se graba solo en el momento de "Enviar a caja"**: exactamente cuando el
  vendedor entrega la orden al cajero. Las ventas que un mismo cajero carga y
  cobra sin pasar por la cola no necesitan este campo (ya están correctamente
  atribuidas por `employee_id`/`user_id`).
- **Visible solo en la orden** (formulario y lista de Órdenes de Punto de
  Venta), no en reportes agregados por ahora.
- **Campo separado de `employee_id`**: investigué el mecanismo de `pos_hr` y
  confirmé que `employee_id` es mutable después de estacionar la orden
  (`setCashier()` lo pisa si la orden queda vacía; `addLineToCurrentOrder()`
  lo pisa en cada línea nueva). Un campo nuevo, distinto, no cae en ninguno de
  esos dos casos y sobrevive intacto a que el cajero reabra y cobre la orden.

## Arquitectura

### 1. Nuevo campo en `pos.order`

`pos_centralized_payment/models/pos_order.py` (nuevo archivo; este módulo hoy
no tiene carpeta `models/`):

```python
# -*- coding: utf-8 -*-
from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    counter_salesperson_id = fields.Many2one(
        'hr.employee',
        string='Counter Salesperson',
        help=(
            "Employee who originally built the order at their own terminal "
            "before sending it to the centralized cashier for payment. Kept "
            "separate from the employee who validates the payment."
        ),
    )
```

`pos.order` ya viaja al frontend con **todos** sus campos (su
`_load_pos_data_fields` devuelve `[]`), a diferencia de `pos.config`. No hace
falta ningún override de carga para que este campo llegue al POS.

`pos_centralized_payment/models/__init__.py` (nuevo): `from . import pos_order`.

`pos_centralized_payment/__init__.py`: agregar `from . import models` (hoy el
módulo no importa ningún paquete Python, solo tiene vistas y JS).

### 2. Se graba al enviar a caja (frontend)

Se extiende `clickQueueOrder()` en
`static/src/overrides/components/product_screen/product_screen.js`:

```js
async clickQueueOrder() {
    const order = this.pos.getOrder();
    if (!order || order.getOrderlines().length === 0) {
        return;
    }
    order.counter_salesperson_id = this.pos.getCashier();
    await this.printer.print(PreTicketReceipt, { order }, { webPrintFallback: true });
    this.pos.clickSaveOrder();
}
```

`this.pos.getCashier()` devuelve el `hr.employee` logueado en esa terminal en
ese momento — el vendedor de mostrador, antes de que la orden pase a manos del
cajero.

### 3. Visible en la orden (backend)

`pos_centralized_payment/views/pos_order_views.xml` (nuevo): hereda
`point_of_sale.view_pos_pos_form`, agrega el campo al lado de "User":

```xml
<record id="view_pos_pos_form_centralized_payment" model="ir.ui.view">
    <field name="name">pos.order.form.inherit.pos_centralized_payment</field>
    <field name="model">pos.order</field>
    <field name="inherit_id" ref="point_of_sale.view_pos_pos_form"/>
    <field name="arch" type="xml">
        <field name="user_id" position="after">
            <field name="counter_salesperson_id"/>
        </field>
    </field>
</record>
```

`pos_centralized_payment/__manifest__.py`: agregar
`'views/pos_order_views.xml'` a `data` (hoy solo lista
`'views/pos_config_views.xml'`).

## Riesgo a confirmar en la implementación

`counter_salesperson_id` es un campo `Many2one` nuevo, no relacionado, seteado
únicamente del lado del frontend (no tiene default en Python ni se calcula).
Hay que confirmar que el mecanismo genérico de sincronización de `pos.order`
efectivamente persiste este valor al crear/pagar la orden (no solo lo lee).
Si no lo hiciera, el plan de implementación debe incluir un paso de
verificación manual puntual para detectarlo temprano, con un pequeño override
de creación en Python (`_order_fields` o similar) como red de seguridad.

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| Orden cobrada directamente por el mismo cajero, sin pasar por cola | `counter_salesperson_id` queda vacío; `employee_id`/`user_id` ya reflejan correctamente a esa persona |
| Orden encolada y luego cobrada por un cajero distinto | `counter_salesperson_id` conserva al vendedor original; `employee_id` puede terminar reflejando al cajero, pero el dato del vendedor no se pierde |
| `restrict_payment_to_manager` desactivado (todos pueden cobrar) | El botón "Enviar a caja" no se usa en este flujo; `counter_salesperson_id` queda vacío, comportamiento sin cambios |
| Reimpresión o reapertura de una orden ya pagada | El campo ya quedó grabado en la orden desde el momento del envío a caja; no se vuelve a tocar |

## Fuera de alcance

- Mostrar el vendedor en el ticket impreso.
- Agregarlo a reportes agregados (pivot de ventas de POS).
- Grabar el vendedor en órdenes que no pasan por el flujo de cola.

## Archivos afectados

- `pos_centralized_payment/models/pos_order.py` (nuevo): campo `counter_salesperson_id`.
- `pos_centralized_payment/models/__init__.py` (nuevo).
- `pos_centralized_payment/__init__.py`: agregar import de `models` (existente, se edita).
- `pos_centralized_payment/views/pos_order_views.xml` (nuevo): campo en el formulario de la orden.
- `pos_centralized_payment/__manifest__.py`: registrar la nueva vista en `data` (existente, se edita).
- `pos_centralized_payment/static/src/overrides/components/product_screen/product_screen.js`: setear el campo en `clickQueueOrder()` (existente, se edita).
