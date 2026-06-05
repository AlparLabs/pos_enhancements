# POS Restrict Cancel Order & Restaurant Centralized Payment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two independent Odoo 18 POS modules: one that restricts order cancellation to manager-role cashiers with backend audit logging, and one that hides the Pay button on waiter terminals and replaces it with "Enviar a Caja" (print pre-cuenta + return to floor).

**Architecture:** Both modules follow the existing `pos_discount_supervisor` / `pos_centralized_payment` (19.0) pattern: Python models extend `pos.config` or `pos.order`, JS patches OWL components via `@web/core/utils/patch`, XML inherits Odoo templates via xpath. No new database models — only extensions of existing ones.

**Tech Stack:** Odoo 18, OWL 2.x, Python 3, `@web/core/utils/patch`, `pos_hr` (employee roles), `pos_restaurant_pre_cuenta` (receipt printing).

---

## File Map

### Module 1: `pos_restrict_cancel_order`

| File | Responsibility |
|------|---------------|
| `pos_restrict_cancel_order/__manifest__.py` | Module metadata, depends on `point_of_sale`, `pos_hr` |
| `pos_restrict_cancel_order/__init__.py` | Python package entry |
| `pos_restrict_cancel_order/models/__init__.py` | Models package entry |
| `pos_restrict_cancel_order/models/pos_order.py` | `log_cancel_supervisor()` RPC method + chatter message |
| `pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.js` | Patch: `canCancelOrder` getter + `clickCancelOrder()` with audit RPC |
| `pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.xml` | Replace Cancel Order button with conditional `t-if="canCancelOrder"` |
| `pos_restrict_cancel_order/static/src/overrides/ticket_screen/ticket_screen.js` | Patch `shouldHideDeleteButton` to block non-managers |

### Module 2: `pos_restaurant_centralized_payment`

| File | Responsibility |
|------|---------------|
| `pos_restaurant_centralized_payment/__manifest__.py` | Module metadata, depends on `pos_restaurant`, `pos_hr`, `pos_restaurant_pre_cuenta` |
| `pos_restaurant_centralized_payment/__init__.py` | Python package entry |
| `pos_restaurant_centralized_payment/models/__init__.py` | Models package entry |
| `pos_restaurant_centralized_payment/models/pos_config.py` | `restrict_payment_to_manager` Boolean field + `_load_pos_data_read` override |
| `pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.js` | Patch: `canPay` getter + `clickSendToRegister()` |
| `pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.xml` | Hide Pay, show "Enviar a Caja" button |
| `pos_restaurant_centralized_payment/views/pos_config_views.xml` | Checkbox "Pago Centralizado" in POS settings |

---

## Task 1: `pos_restrict_cancel_order` — Scaffold + Backend

**Files:**
- Create: `pos_restrict_cancel_order/__manifest__.py`
- Create: `pos_restrict_cancel_order/__init__.py`
- Create: `pos_restrict_cancel_order/models/__init__.py`
- Create: `pos_restrict_cancel_order/models/pos_order.py`

- [ ] **Step 1: Create `__manifest__.py`**

```python
{
    'name': 'POS Restrict Cancel Order',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Restricts order cancellation to Manager-role cashiers in POS.',
    'description': """
Hides the Cancel Order button from non-manager cashiers.
When a manager cancels a synced order, a timestamped note is posted to the
order chatter in the Odoo backend. Requires pos_hr enabled in POS config.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_hr'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.js',
            'pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.xml',
            'pos_restrict_cancel_order/static/src/overrides/ticket_screen/ticket_screen.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

- [ ] **Step 2: Create `__init__.py`**

```python
from . import models
```

- [ ] **Step 3: Create `models/__init__.py`**

```python
from . import pos_order
```

- [ ] **Step 4: Create `models/pos_order.py`**

`pos.order` inherits `mail.thread` in Odoo 18, so `message_post` is available.
This method is called via `orm.call` from the POS frontend after a synced order is deleted.

```python
from odoo import api, models, _


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model
    def log_cancel_supervisor(self, order_ids, employee_id):
        """Post a chatter note on each cancelled order identifying the manager."""
        employee = self.env['hr.employee'].browse(employee_id)
        for order in self.browse(order_ids):
            order.sudo().message_post(
                body=_("Orden cancelada por %(name)s", name=employee.name),
                message_type='comment',
                subtype_xmlid='mail.mt_note',
            )
```

- [ ] **Step 5: Verify Python imports resolve correctly**

From the repo root run:
```bash
python -c "import ast; ast.parse(open('pos_restrict_cancel_order/models/pos_order.py').read()); print('OK')"
```
Expected output: `OK`

- [ ] **Step 6: Commit**

```bash
git add pos_restrict_cancel_order/__manifest__.py pos_restrict_cancel_order/__init__.py pos_restrict_cancel_order/models/__init__.py pos_restrict_cancel_order/models/pos_order.py
git commit -m "feat(pos_restrict_cancel_order): add module scaffold and log_cancel_supervisor backend method"
```

---

## Task 2: `pos_restrict_cancel_order` — Frontend: ControlButtons

**Files:**
- Create: `pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.js`
- Create: `pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.xml`

**Context:** The "Cancel Order" button in `point_of_sale.ControlButtons` is:
```xml
<!-- point_of_sale/static/src/app/screens/product_screen/control_buttons/control_buttons.xml line 42 -->
<button class="btn btn-secondary btn-lg py-5"
        t-on-click="() => this.pos.onDeleteOrder(this.pos.get_order())">
    <i class="fa fa-trash me-1" role="img" /> Cancel Order 
</button>
```
It lives inside `<t t-if="props.showRemainingButtons">` (the "Actions" modal).

The `_role` field on employees is `'manager'` when the employee is listed as advanced/manager in POS HR config. When `module_pos_hr` is false (employee login not enabled), all users can cancel freely.

- [ ] **Step 1: Create `control_buttons.js`**

```js
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";

function isManagerCashier(pos) {
    if (!pos.config.module_pos_hr) {
        return true;
    }
    return pos.get_cashier()?._role === "manager";
}

patch(ControlButtons.prototype, {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
    },

    get canCancelOrder() {
        return isManagerCashier(this.pos);
    },

    async clickCancelOrder() {
        const order = this.pos.get_order();
        if (!order) {
            return;
        }
        // Capture server ID before deletion — the order object is removed from
        // POS state during onDeleteOrder but the JS object stays in memory.
        const orderId = typeof order.id === "number" ? order.id : null;
        const employeeId = this.pos.get_cashier()?.id ?? null;

        const deleted = await this.pos.onDeleteOrder(order);

        // Fire-and-forget audit log. Only runs for orders already synced to the
        // backend (orderId is a number). Silently skipped if offline.
        if (deleted && orderId && employeeId) {
            this.orm
                .call("pos.order", "log_cancel_supervisor", [[orderId], employeeId])
                .catch(() => {});
        }
    },
});
```

- [ ] **Step 2: Create `control_buttons.xml`**

We replace the existing Cancel Order button with a guarded version.
The xpath targets the single button calling `onDeleteOrder` inside this template.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">

    <t t-name="pos_restrict_cancel_order.ControlButtons"
       t-inherit="point_of_sale.ControlButtons"
       t-inherit-mode="extension">

        <xpath expr="//button[contains(@t-on-click, 'onDeleteOrder')]" position="replace">
            <button t-if="canCancelOrder"
                    class="btn btn-secondary btn-lg py-5"
                    t-on-click="() => this.clickCancelOrder()">
                <i class="fa fa-trash me-1" role="img" /> Cancel Order
            </button>
        </xpath>

    </t>

</templates>
```

- [ ] **Step 3: Verify XML is well-formed**

```bash
python -c "import xml.etree.ElementTree as ET; ET.parse('pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.xml'); print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add pos_restrict_cancel_order/static/src/overrides/control_buttons/
git commit -m "feat(pos_restrict_cancel_order): hide Cancel Order for non-managers, log supervisor on cancel"
```

---

## Task 3: `pos_restrict_cancel_order` — Frontend: TicketScreen

**Files:**
- Create: `pos_restrict_cancel_order/static/src/overrides/ticket_screen/ticket_screen.js`

**Context:** The ticket screen shows a delete icon per order row, controlled by `shouldHideDeleteButton(order)`. The base implementation returns `true` (hide) for empty/finalized/electronic-payment orders. We extend it to also return `true` for non-manager cashiers.

```js
// Base implementation (pos_store.js ~line 429):
shouldHideDeleteButton(order) {
    const orders = this.pos.models["pos.order"].filter((o) => !o.finalized);
    return (
        (orders.length === 1 && orders[0].lines.length === 0) ||
        (this.ui.isSmall && order != this.getSelectedOrder()) ||
        this.isDefaultOrderEmpty(order) ||
        order.finalized ||
        order.payment_ids.some(
            (payment) => payment.is_electronic() && payment.get_payment_status() === "done"
        ) ||
        order.finalized
    );
}
```

- [ ] **Step 1: Create `ticket_screen.js`**

```js
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";

patch(TicketScreen.prototype, {
    shouldHideDeleteButton(order) {
        if (super.shouldHideDeleteButton(order)) {
            return true;
        }
        if (!this.pos.config.module_pos_hr) {
            return false;
        }
        return this.pos.get_cashier()?._role !== "manager";
    },
});
```

- [ ] **Step 2: Verify JS parses correctly**

```bash
node --input-type=module < pos_restrict_cancel_order/static/src/overrides/ticket_screen/ticket_screen.js 2>&1 | head -5
```
Expected: no output (or only a module import error which is fine in Node — the syntax is valid).

- [ ] **Step 3: Commit**

```bash
git add pos_restrict_cancel_order/static/src/overrides/ticket_screen/ticket_screen.js
git commit -m "feat(pos_restrict_cancel_order): hide delete button in ticket screen for non-managers"
```

---

## Task 4: `pos_restaurant_centralized_payment` — Scaffold + Backend

**Files:**
- Create: `pos_restaurant_centralized_payment/__manifest__.py`
- Create: `pos_restaurant_centralized_payment/__init__.py`
- Create: `pos_restaurant_centralized_payment/models/__init__.py`
- Create: `pos_restaurant_centralized_payment/models/pos_config.py`

- [ ] **Step 1: Create `__manifest__.py`**

```python
{
    'name': 'POS Restaurant Centralized Payment',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Restricts Pay button to Manager cashiers; waiter terminals use "Enviar a Caja".',
    'description': """
Designed for restaurants with multiple waiter terminals and a single cash register.
When "Pago Centralizado" is enabled in POS settings:
  - Non-manager cashiers see "Enviar a Caja" instead of the Pay button.
  - "Enviar a Caja" prints the pre-cuenta and returns to the floor plan.
  - Manager cashiers see Pay normally and process payment from the floor.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['pos_restaurant', 'pos_hr', 'pos_restaurant_pre_cuenta'],
    'data': [
        'views/pos_config_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.js',
            'pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

- [ ] **Step 2: Create `__init__.py`**

```python
from . import models
```

- [ ] **Step 3: Create `models/__init__.py`**

```python
from . import pos_config
```

- [ ] **Step 4: Create `models/pos_config.py`**

`pos.config` fields are loaded differently from other models in Odoo 18 POS.
`_load_pos_data_fields` returns `[]` for `pos.config` — Odoo core adds fields directly in its own `_load_pos_data_read` override. We follow the same pattern to inject our field without breaking core fields.

```python
from __future__ import annotations

from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    restrict_payment_to_manager: bool = fields.Boolean(
        string='Pago Centralizado',
        default=False,
        help=(
            'Cuando está activo, el botón Cobrar solo es visible para cajeros con rol Manager. '
            'Diseñado para restaurantes con múltiples terminales y una única caja central.'
        ),
    )

    @api.model
    def _load_pos_data_read(self, records, config) -> list[dict]:
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['restrict_payment_to_manager'] = config.restrict_payment_to_manager
        return read_records
```

- [ ] **Step 5: Verify Python syntax**

```bash
python -c "import ast; ast.parse(open('pos_restaurant_centralized_payment/models/pos_config.py').read()); print('OK')"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add pos_restaurant_centralized_payment/__manifest__.py pos_restaurant_centralized_payment/__init__.py pos_restaurant_centralized_payment/models/__init__.py pos_restaurant_centralized_payment/models/pos_config.py
git commit -m "feat(pos_restaurant_centralized_payment): add module scaffold and restrict_payment_to_manager config field"
```

---

## Task 5: `pos_restaurant_centralized_payment` — Frontend

**Files:**
- Create: `pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.js`
- Create: `pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.xml`

**Context:**

In Odoo 18 `product_screen.xml`:
- Desktop Pay: `<ActionpadWidget showActionButton="!currentOrder?.is_empty()" .../>` — we override `showActionButton` to gate on `canPay`.
- Mobile Pay: `<button t-if="!pos.scanning" class="btn-switchpane pay-button ..." .../>` — we add `and canPay` to `t-if`.

`PreCuentaReceipt` and the printing logic are imported from `pos_restaurant_pre_cuenta`.
After printing, `this.pos.showScreen('FloorScreen')` returns to the floor plan.
`get_orderlines()` is the Odoo 18 snake_case method (not `getOrderlines()`).

- [ ] **Step 1: Create `product_screen.js`**

```js
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PreCuentaReceipt } from "@pos_restaurant_pre_cuenta/app/receipt/pre_cuenta_receipt";

patch(ProductScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.printer = useService("printer");
    },

    get canPay() {
        if (!this.pos.config.restrict_payment_to_manager) {
            return true;
        }
        return this.pos.get_cashier()?._role === "manager";
    },

    async clickSendToRegister() {
        const order = this.pos.get_order();
        if (!order || order.get_orderlines().length === 0) {
            return;
        }

        const headerData = this.pos.getReceiptHeaderData(order);
        if (order.waiter_id) {
            headerData.waiter_name = order.waiter_id.name;
        }
        if (this.pos.company?.logo) {
            headerData.company = {
                ...headerData.company,
                logoDataUrl: `data:image/png;base64,${this.pos.company.logo}`,
            };
        }

        const receiptData = {
            ...order.export_for_printing(this.pos.session._base_url, headerData),
            headerData,
        };

        await this.printer.print(
            PreCuentaReceipt,
            { data: receiptData, formatCurrency: this.env.utils.formatCurrency },
            { webPrintFallback: true }
        );

        this.pos.showScreen("FloorScreen");
    },
});
```

- [ ] **Step 2: Create `product_screen.xml`**

Note: in Odoo 18, `is_empty()` is the order method (snake_case, not `isEmpty()`).
The mobile `pay-button` already has `t-if="!pos.scanning"` — we extend it to also check `canPay`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">

    <t t-name="pos_restaurant_centralized_payment.ProductScreen"
       t-inherit="point_of_sale.ProductScreen"
       t-inherit-mode="extension">

        <!-- Desktop: gate ActionpadWidget Pay button on canPay -->
        <xpath expr="//ActionpadWidget" position="attributes">
            <attribute name="showActionButton">canPay and !currentOrder?.is_empty()</attribute>
        </xpath>

        <!-- Desktop: show "Enviar a Caja" for non-managers when order has lines -->
        <xpath expr="//ActionpadWidget" position="after">
            <div t-if="!canPay and !currentOrder?.is_empty()"
                 class="mw-100 container validation p-0">
                <div class="d-flex gap-2">
                    <button class="btn btn-warning btn-lg py-3 d-flex align-items-center justify-content-center flex-fill"
                            t-on-click="() => this.clickSendToRegister()">
                        <i class="fa fa-paper-plane me-2"/>
                        Enviar a Caja
                    </button>
                </div>
            </div>
        </xpath>

        <!-- Mobile (switchpane): hide Pay button for non-managers -->
        <xpath expr="//button[hasclass('pay-button')]" position="attributes">
            <attribute name="t-if">!pos.scanning and canPay</attribute>
        </xpath>

        <!-- Mobile (switchpane): show "Enviar a Caja" for non-managers -->
        <xpath expr="//button[hasclass('pay-button')]" position="after">
            <button t-if="!pos.scanning and !canPay and !currentOrder.is_empty()"
                    class="btn-switchpane btn btn-warning btn-lg flex-grow-1"
                    t-on-click="() => this.clickSendToRegister()">
                <span class="d-block">Enviar a Caja</span>
                <span t-esc="total"/>
            </button>
        </xpath>

    </t>

</templates>
```

- [ ] **Step 3: Verify XML**

```bash
python -c "import xml.etree.ElementTree as ET; ET.parse('pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.xml'); print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add pos_restaurant_centralized_payment/static/src/overrides/product_screen/
git commit -m "feat(pos_restaurant_centralized_payment): add canPay getter and Enviar a Caja button"
```

---

## Task 6: `pos_restaurant_centralized_payment` — Config View

**Files:**
- Create: `pos_restaurant_centralized_payment/views/pos_config_views.xml`

**Context:** The POS settings form is at `point_of_sale.pos_config_view_form`. The xpath target `//setting[field[@name='module_pos_hr']]` finds the "Log in with Employees" setting block. We insert our checkbox after it, and only show it when `module_pos_hr` is active (otherwise the `restrict_payment_to_manager` field is meaningless).

- [ ] **Step 1: Create `views/pos_config_views.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="pos_config_view_form_inherit_restaurant_centralized_payment" model="ir.ui.view">
        <field name="name">pos.config.view.form.inherit.restaurant.centralized.payment</field>
        <field name="model">pos.config</field>
        <field name="inherit_id" ref="point_of_sale.pos_config_view_form"/>
        <field name="arch" type="xml">
            <xpath expr="//setting[field[@name='module_pos_hr']]" position="after">
                <setting
                    string="Pago Centralizado"
                    title="Oculta el botón Cobrar para cajeros no-manager y lo reemplaza por Enviar a Caja. Uso recomendado: restaurantes con múltiples terminales y una única caja."
                    invisible="not module_pos_hr">
                    <field name="restrict_payment_to_manager"/>
                </setting>
            </xpath>
        </field>
    </record>
</odoo>
```

- [ ] **Step 2: Verify XML**

```bash
python -c "import xml.etree.ElementTree as ET; ET.parse('pos_restaurant_centralized_payment/views/pos_config_views.xml'); print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add pos_restaurant_centralized_payment/views/pos_config_views.xml
git commit -m "feat(pos_restaurant_centralized_payment): add Pago Centralizado setting to POS config form"
```

---

## Task 7: Manual smoke test

**What to verify for `pos_restrict_cancel_order`:**

- [ ] Install module in Odoo 18 dev instance. Enable `pos_hr` in the POS config and set at least one manager employee.
- [ ] Open POS as a non-manager employee → go to Actions menu → confirm "Cancel Order" button is NOT visible.
- [ ] Open ticket screen as non-manager → confirm the trash icon per order row is NOT visible.
- [ ] Switch to a manager employee → go to Actions → confirm "Cancel Order" IS visible → click it on an order with lines → confirm the Odoo confirmation dialog appears → confirm deletion.
- [ ] In the Odoo backend, open the cancelled order (`pos.order` with state=cancel) → check the chatter shows "Orden cancelada por [Manager Name]".
- [ ] Verify: if `pos_hr` is disabled in POS config, all cashiers see the Cancel Order button (degraded mode).

**What to verify for `pos_restaurant_centralized_payment`:**

- [ ] Install module. Enable `pos_hr` in POS config. Enable "Pago Centralizado" checkbox (only visible after enabling pos_hr).
- [ ] Open POS as non-manager at a table with items → confirm Pay button is NOT visible → confirm "Enviar a Caja" button IS visible (yellow/warning color).
- [ ] Click "Enviar a Caja" → pre-cuenta should print (or fallback web print dialog) → POS should navigate to the floor plan.
- [ ] Open POS as manager at the same table → confirm Pay button IS visible, "Enviar a Caja" is NOT visible → complete a payment.
- [ ] With "Pago Centralizado" unchecked → all cashiers see Pay button normally.
- [ ] Mobile view: confirm Pay button hidden / Enviar a Caja visible for non-managers in switchpane.

---

## Self-Review Notes

- **Spec coverage:** All spec requirements are covered:  
  ✓ Cancel Order hidden from non-managers (Task 2 + 3)  
  ✓ Audit log posted to order chatter (Task 1 + 2)  
  ✓ Offline tolerance: audit log is fire-and-forget, deletion still works without connectivity  
  ✓ restrict_payment_to_manager field on pos.config (Task 4)  
  ✓ Pay hidden / Enviar a Caja shown for non-managers (Task 5)  
  ✓ Print pre-cuenta + return to FloorScreen (Task 5)  
  ✓ Setting in POS config, invisible when pos_hr not active (Task 6)  
  ✓ Degraded mode (pos_hr off = no restrictions) in both modules  

- **Method name consistency:**  
  - `get_cashier()` used throughout (18.0 snake_case)  
  - `get_orderlines()` in JS (18.0 snake_case)  
  - `is_empty()` in XML templates (18.0 snake_case)  
  - `canCancelOrder` getter in ControlButtons, `canPay` getter in ProductScreen  
  - `clickCancelOrder()` in ControlButtons, `clickSendToRegister()` in ProductScreen  

- **No placeholders:** All steps have complete code.
