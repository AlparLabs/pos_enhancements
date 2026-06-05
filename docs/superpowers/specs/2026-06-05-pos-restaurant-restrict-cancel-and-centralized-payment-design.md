# Diseño: Restricción de Cancelación y Pago Centralizado para POS Restaurant (Odoo 18)

**Fecha:** 2026-06-05  
**Branch:** 18.0  
**Autor:** Santiago Tojo  

---

## Resumen

Dos módulos independientes para mejorar la operación de restaurantes con múltiples terminales y una sola caja central:

1. **`pos_restrict_cancel_order`** — Oculta el botón "Cancel Order" a cajeros no-managers y exige PIN de supervisor para cancelar. Deja auditoría offline-first en `pos.order`.
2. **`pos_restaurant_centralized_payment`** — Oculta el botón "Pay" a cajeros no-managers y lo reemplaza por "Enviar a Caja", que imprime la pre-cuenta y vuelve al piso.

---

## Módulo 1: `pos_restrict_cancel_order`

### Problema

Cualquier cajero puede cancelar una orden en el POS, sin autorización ni trazabilidad. El cliente necesita que solo administradores/managers puedan cancelar órdenes.

### Dependencias

- `point_of_sale`
- `pos_hr` (para roles de empleado: `_role === 'manager'`)

### Comportamiento

- **Cajero no-manager:** el botón "Cancel Order" no aparece ni en el menú Actions (`control_buttons.xml`) ni en el ticket screen (`ticket_screen.xml`).
- **Manager:** el botón aparece y funciona sin fricción extra (ya está autenticado como manager).
- **Si el cajero necesita cancelar:** debe llamar a un manager para que inicie sesión o directamente el manager lo hace desde su terminal.

### Auditoría offline-first

Al cancelar una orden (por un manager):

1. Se setean dos campos en el objeto local de la orden **antes** de llamar `pos.onDeleteOrder()`:
   - `cancel_supervisor_id`: ID del empleado manager logueado
   - `cancel_datetime`: timestamp local (ISO string)
2. La orden se cancela normalmente (se elimina del POS).
3. Al sincronizar la sesión con el backend, el override server-side en `pos_order.py` detecta `cancel_supervisor_id` y agrega un mensaje al chatter de `pos.order`:
   > "Orden cancelada por [Nombre Supervisor] el [fecha/hora]"

**Sin llamadas RPC extra durante la cancelación.** Funciona completamente offline; la auditoría llega al backend cuando se restaura la conexión.

### Campos nuevos en `pos.order`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `cancel_supervisor_id` | Many2one → `hr.employee` | Empleado manager que autorizó la cancelación |
| `cancel_datetime` | Datetime | Momento de la cancelación |

### Archivos

```
pos_restrict_cancel_order/
├── __manifest__.py
├── __init__.py
├── models/
│   ├── __init__.py
│   └── pos_order.py                        # campos + override de _process_order para chatter
├── static/src/overrides/
│   ├── control_buttons/
│   │   ├── control_buttons.js              # patch: ocultar botón + set campos antes de onDeleteOrder
│   │   └── control_buttons.xml             # t-if="isManagerCashier" en Cancel Order
│   └── ticket_screen/
│       └── ticket_screen.js                # patch: shouldHideDeleteButton para no-managers
└── security/
    └── ir.model.access.csv
```

### Lógica JS clave

```js
// control_buttons.js (patch)
get isManagerCashier() {
    if (!this.pos.config.module_pos_hr) return true;
    return this.pos.get_cashier()?._role === 'manager';
}

async clickDeleteOrder() {
    const order = this.pos.get_order();
    if (!order) return;
    // Setear auditoría antes de eliminar
    const cashier = this.pos.get_cashier();
    order.cancel_supervisor_id = cashier?.id ?? false;
    order.cancel_datetime = new Date().toISOString();
    return this.pos.onDeleteOrder(order);
}
```

```js
// ticket_screen.js (patch)
shouldHideDeleteButton(order) {
    const base = super.shouldHideDeleteButton(order);
    if (base) return true;
    if (!this.pos.config.module_pos_hr) return false;
    return this.pos.get_cashier()?._role !== 'manager';
}
```

---

## Módulo 2: `pos_restaurant_centralized_payment`

### Problema

En restaurantes con varias terminales satélite y una sola caja central, los mozos no deben acceder al cobro. El flujo correcto es: mozo toma la orden → imprime pre-cuenta → vuelve al piso → cajero central cobra desde la mesa.

### Dependencias

- `pos_restaurant`
- `pos_hr`
- `pos_restaurant_pre_cuenta`

### Configuración

Campo `restrict_payment_to_manager` (Boolean) en `pos.config`:
- Se muestra en los ajustes del POS bajo el checkbox de "Log in with Employees" (`module_pos_hr`), invisible si `pos_hr` no está activo.
- Por defecto: `False` (sin restricción).

### Comportamiento

| Rol cashier | `restrict_payment_to_manager` | Botón Pay | Botón "Enviar a Caja" |
|-------------|-------------------------------|-----------|----------------------|
| Manager | True | Visible | Oculto |
| Manager | False | Visible | Oculto |
| No-manager | True | Oculto | Visible |
| No-manager | False | Visible | Oculto |

### Flujo "Enviar a Caja"

1. Cajero no-manager presiona "Enviar a Caja"
2. Se imprime la pre-cuenta (reutiliza `PreCuentaReceipt` y lógica de `PreCuentaButton` de `pos_restaurant_pre_cuenta`)
3. El POS navega de vuelta a `FloorScreen`
4. La orden queda abierta en la mesa (sin guardar en cola, sin cambios de estado)
5. El cajero central entra a esa mesa desde el piso y cobra normalmente

### Campos nuevos en `pos.config`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `restrict_payment_to_manager` | Boolean | Habilita el modo pago centralizado |

El campo se expone al frontend mediante override de `_load_pos_data_read` (mismo patrón del módulo 19.0 existente).

### Archivos

```
pos_restaurant_centralized_payment/
├── __manifest__.py
├── __init__.py
├── models/
│   ├── __init__.py
│   └── pos_config.py                       # restrict_payment_to_manager + _load_pos_data_read
├── static/src/overrides/product_screen/
│   ├── product_screen.js                   # patch: canPay getter + clickSendToRegister
│   └── product_screen.xml                  # ocultar Pay, mostrar "Enviar a Caja"
└── views/
    └── pos_config_views.xml
```

### Lógica JS clave

```js
// product_screen.js (patch)
get canPay() {
    if (!this.pos.config.restrict_payment_to_manager) return true;
    return this.pos.get_cashier()?._role === 'manager';
},

async clickSendToRegister() {
    const order = this.pos.get_order();
    if (!order || order.get_orderlines().length === 0) return;

    // Reutilizar lógica de impresión de PreCuentaButton
    const headerData = this.pos.getReceiptHeaderData(order);
    if (order.waiter_id) headerData.waiter_name = order.waiter_id.name;
    if (this.pos.company?.logo) {
        headerData.company = { ...headerData.company, logoDataUrl: `data:image/png;base64,${this.pos.company.logo}` };
    }
    const receiptData = { ...order.export_for_printing(this.pos.session._base_url, headerData), headerData };
    await this.printer.print(PreCuentaReceipt, { data: receiptData, formatCurrency: this.env.utils.formatCurrency }, { webPrintFallback: true });

    // Volver al piso
    this.pos.showScreen('FloorScreen');
},
```

### Template XML clave

```xml
<!-- Ocultar Pay para no-managers -->
<xpath expr="//ActionpadWidget" position="attributes">
    <attribute name="showActionButton">canPay and !currentOrder?.isEmpty()</attribute>
</xpath>

<!-- Botón "Enviar a Caja" para no-managers -->
<xpath expr="//ActionpadWidget" position="after">
    <div t-if="!canPay and !currentOrder?.isEmpty()" class="mw-100 container validation p-0">
        <div class="d-flex gap-2">
            <button class="btn btn-warning btn-lg py-3 d-flex align-items-center justify-content-center flex-fill"
                    t-on-click="() => this.clickSendToRegister()">
                <i class="fa fa-paper-plane me-2"/>
                Enviar a Caja
            </button>
        </div>
    </div>
</xpath>
```

---

## Restricciones y consideraciones

- Ambos módulos requieren `pos_hr` activo en la configuración del POS para que la lógica de roles funcione. Si `pos_hr` no está activo, los botones se muestran normalmente para todos (degraded mode).
- `pos_restrict_cancel_order` no depende de `pos_restaurant_centralized_payment` ni viceversa — se instalan de forma independiente.
- La auditoría de cancelación usa campos en `pos.order`; si la sesión nunca se cierra/sincroniza correctamente, los datos se pierden igual que cualquier otra orden no sincronizada.
- "Enviar a Caja" solo es funcional cuando `restrict_payment_to_manager = True`. Con la opción desactivada, el flujo es el estándar de Odoo.

---

## Fuera de alcance

- Notificaciones push al cajero central cuando se envía una orden
- Indicador visual en el piso de "órdenes listas para cobrar"
- Soporte para POS retail (no-restaurant) en `pos_restaurant_centralized_payment`
