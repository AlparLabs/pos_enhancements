# Counter Salesperson Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record which employee originally built a POS order at their own terminal before sending it to the centralized cashier for payment, so that information isn't lost once a different cashier validates the payment.

**Architecture:** Add a new `counter_salesperson_id` (`hr.employee`) field on `pos.order` in `pos_centralized_payment`, set it on the frontend order object at the exact moment the vendor clicks "Enviar a caja" (`clickQueueOrder()`), and surface it on the backend order form next to the existing "User" field. No changes to `employee_id`/`user_id` — this is a separate, additive field.

**Tech Stack:** Odoo 19.0, Python (Odoo ORM), OWL/JS frontend override.

**Context:** No automated test runner exists anywhere in this repo (no `tests/` directories, no CI config). Verification in this plan uses static syntax checks (Python compile, XML well-formedness) during implementation, plus a manual QA checklist to run once the branch is deployed to a live Odoo test instance — that manual pass cannot be scripted from this sandbox. It is also the only way to confirm the risk called out in the design spec: that a new, non-related `Many2one` field set only on the frontend actually persists through order creation/payment sync (see Task 5, Step 4).

---

### Task 1: Add the `counter_salesperson_id` field to `pos.order`

**Files:**
- Create: `pos_centralized_payment/models/pos_order.py`
- Modify: `pos_centralized_payment/models/__init__.py`

The existing sibling file `pos_centralized_payment/models/pos_config.py` uses
`from __future__ import annotations` and Python type hints. Follow that same
style for consistency.

Current content of `pos_centralized_payment/models/__init__.py`:

```python
from . import pos_config
```

- [ ] **Step 1: Create the new model file**

Create `pos_centralized_payment/models/pos_order.py` with this exact content:

```python
from __future__ import annotations

from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    counter_salesperson_id = fields.Many2one(
        'hr.employee',
        string='Counter Salesperson',
        help=(
            'Employee who originally built the order at their own terminal '
            'before sending it to the centralized cashier for payment. Kept '
            'separate from the employee who validates the payment.'
        ),
    )
```

- [ ] **Step 2: Register the new model in `models/__init__.py`**

Replace the full content of `pos_centralized_payment/models/__init__.py` with:

```python
from . import pos_config
from . import pos_order
```

- [ ] **Step 3: Verify both files compile**

Run:
```bash
python -m py_compile pos_centralized_payment/models/pos_order.py pos_centralized_payment/models/__init__.py
```
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add pos_centralized_payment/models/pos_order.py pos_centralized_payment/models/__init__.py
git commit -m "feat: add counter_salesperson_id field to pos.order"
```

---

### Task 2: Surface the field on the backend order form

**Files:**
- Create: `pos_centralized_payment/views/pos_order_views.xml`
- Modify: `pos_centralized_payment/__manifest__.py`

Current content of `pos_centralized_payment/__manifest__.py`:

```python
{
    'name': 'POS Centralized Payment',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Restricts the Pay button to Manager-role cashiers for centralized cash register setups.',
    'description': """
Designed for retail with multiple sales terminals and a single centralized cash register.
When enabled, the Pay button is hidden from regular cashiers and only visible to employees
with the Manager role configured in POS HR.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_hr', 'pos_retail_pre_ticket'],
    'data': [
        'views/pos_config_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_centralized_payment/static/src/overrides/components/product_screen/product_screen.js',
            'pos_centralized_payment/static/src/overrides/components/product_screen/product_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

The sibling view file `pos_centralized_payment/views/pos_config_views.xml`
inherits `point_of_sale.pos_config_view_form` with record id
`pos_config_view_form_inherit_centralized_payment` and name
`pos.config.view.form.inherit.centralized.payment`. Follow that same naming
convention for the new view.

The core `pos.order` form view (`point_of_sale.view_pos_pos_form`, defined in
Odoo core at `point_of_sale/views/pos_order_view.xml`) has this field in its
`order_fields` group:

```xml
<field string="User" name="user_id" readonly="account_move or state == 'done'"/>
```

- [ ] **Step 1: Create the new view file**

Create `pos_centralized_payment/views/pos_order_views.xml` with this exact content:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="pos_order_view_form_inherit_centralized_payment" model="ir.ui.view">
        <field name="name">pos.order.view.form.inherit.centralized.payment</field>
        <field name="model">pos.order</field>
        <field name="inherit_id" ref="point_of_sale.view_pos_pos_form"/>
        <field name="arch" type="xml">
            <field name="user_id" position="after">
                <field name="counter_salesperson_id"/>
            </field>
        </field>
    </record>
</odoo>
```

- [ ] **Step 2: Register the view in the manifest**

In `pos_centralized_payment/__manifest__.py`, replace:

```python
    'data': [
        'views/pos_config_views.xml',
    ],
```

With:

```python
    'data': [
        'views/pos_config_views.xml',
        'views/pos_order_views.xml',
    ],
```

Do not change anything else in the manifest.

- [ ] **Step 3: Verify the XML is well-formed and the manifest still compiles**

Run:
```bash
python -c "import xml.dom.minidom as m; m.parse('pos_centralized_payment/views/pos_order_views.xml'); print('OK')"
python -m py_compile pos_centralized_payment/__manifest__.py
```
Expected: `OK` printed, then no output from the second command (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add pos_centralized_payment/views/pos_order_views.xml pos_centralized_payment/__manifest__.py
git commit -m "feat: show counter_salesperson_id on the POS order form"
```

---

### Task 3: Record the salesperson when the order is sent to the cashier

**Files:**
- Modify: `pos_centralized_payment/static/src/overrides/components/product_screen/product_screen.js`

Current full content of this file:

```js
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PreTicketReceipt } from "@pos_retail_pre_ticket/app/receipt/pre_ticket_receipt";

/**
 * Returns true if the current cashier is allowed to access the payment screen.
 *
 * When `restrict_payment_to_manager` is disabled, all cashiers can pay (default Odoo behaviour).
 * When enabled, only employees with `_role === 'manager'` (set server-side by pos_hr based on
 * the advanced_employee_ids list) can see the Pay button.
 *
 * If no cashier is logged in, access is blocked as a safety measure.
 *
 * @param {Object} pos - POS service
 * @returns {boolean}
 */
function isCashierAllowedToPay(pos) {
    if (!pos.config.restrict_payment_to_manager) {
        return true;
    }
    const cashier = pos.getCashier();
    return cashier?._role === "manager";
}

patch(ProductScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.printer = useService("printer");
    },

    /**
     * Whether the current cashier can access the payment flow.
     * Used in the template to conditionally show/hide the Pay and Queue buttons.
     *
     * @returns {boolean}
     */
    get canPay() {
        return isCashierAllowedToPay(this.pos);
    },

    /**
     * Print a pre-ticket and park the order in the saved-orders queue.
     * Called by non-manager cashiers instead of the Pay button.
     *
     * @returns {Promise<void>}
     */
    async clickQueueOrder() {
        const order = this.pos.getOrder();
        if (!order || order.getOrderlines().length === 0) {
            return;
        }
        await this.printer.print(PreTicketReceipt, { order }, { webPrintFallback: true });
        this.pos.clickSaveOrder();
    },
});
```

- [ ] **Step 1: Record the counter salesperson before queuing the order**

Replace the `clickQueueOrder` method:

```js
    async clickQueueOrder() {
        const order = this.pos.getOrder();
        if (!order || order.getOrderlines().length === 0) {
            return;
        }
        await this.printer.print(PreTicketReceipt, { order }, { webPrintFallback: true });
        this.pos.clickSaveOrder();
    },
```

With:

```js
    /**
     * Print a pre-ticket and park the order in the saved-orders queue.
     * Called by non-manager cashiers instead of the Pay button.
     *
     * Records the employee currently logged in at this terminal as the
     * order's counter_salesperson_id before parking it, so that information
     * survives a different (manager/cashier) employee later reopening and
     * paying the order — see pos_centralized_payment/models/pos_order.py.
     *
     * @returns {Promise<void>}
     */
    async clickQueueOrder() {
        const order = this.pos.getOrder();
        if (!order || order.getOrderlines().length === 0) {
            return;
        }
        order.counter_salesperson_id = this.pos.getCashier();
        await this.printer.print(PreTicketReceipt, { order }, { webPrintFallback: true });
        this.pos.clickSaveOrder();
    },
```

Note this removes the old, now-duplicate JSDoc comment that was directly above
`clickQueueOrder` and replaces it with the updated one shown above (the method
body is otherwise unchanged except for the one new line). Nothing else in the
file changes — `isCashierAllowedToPay`, `setup()`, and `canPay` stay exactly
as they are.

- [ ] **Step 2: Sanity-check the file for obvious syntax errors**

This repo has no JS linter/test runner wired up for quick syntax checking from
the command line. Re-read the full file after editing and confirm:
- Exactly one `clickQueueOrder` method exists (no duplicate left behind).
- Braces are balanced (the method starts with `async clickQueueOrder() {` and
  ends with a matching `},` before the closing `});` of the `patch(...)` call).

- [ ] **Step 3: Commit**

```bash
git add pos_centralized_payment/static/src/overrides/components/product_screen/product_screen.js
git commit -m "feat: record counter salesperson when order is sent to cashier"
```

---

### Task 4: Manual QA on a live Odoo test instance

This module has no automated test runner, so this step is a manual checklist
to run once the branch is deployed to a live Odoo 19 test instance with
`pos_centralized_payment` updated. This is also the step that resolves the
open risk from the design spec: whether a frontend-only `Many2one` field
actually persists to the backend.

**Files:** none (verification only).

- [ ] **Step 1: Update the module**

In the test instance, go to Apps, search "POS Centralized Payment", click
Upgrade (or run `-u pos_centralized_payment` if you have shell access).

- [ ] **Step 2: Confirm the field appears on the order form**

Go to Point of Sale → Orders, open any existing order, and confirm a
"Counter Salesperson" field now appears next to "User" (it will be empty on
old orders — that's expected, this is a new field).

- [ ] **Step 3: Set up two employees for the test**

Make sure `restrict_payment_to_manager` is enabled on the test POS config
(Settings → Point of Sale → Centralized Payment), and that you have at least
two `hr.employee` PIN/badge logins available: one regular (non-manager) role
and one Manager role, per `pos_hr`.

- [ ] **Step 4: Confirm the field is set when an order is queued — this is the key risk check**

Log in to the POS session as the non-manager employee, add a product to a new
order, and click "Enviar a caja" (queue order). Then, **as a manager**, open
Backend → Point of Sale → Orders, find the parked order (state should still
be `draft` at this point, before payment), and confirm "Counter Salesperson"
is already set to the non-manager employee who queued it.

If it is **not** set at this point, the frontend-to-backend sync for a
standalone `Many2one` field set only on the client isn't working as expected,
and this plan needs a follow-up Python-side fix (e.g. overriding order
creation on the backend to accept and store the value explicitly). Stop and
report this back rather than proceeding to Step 5.

- [ ] **Step 5: Confirm the value survives being paid by a different employee**

Still logged in as the manager on the POS terminal, open the saved/parked
order from the ticket screen and pay it (this is the normal centralized-
payment flow). Once paid, go back to Backend → Point of Sale → Orders, open
that same order, and confirm:
- "Counter Salesperson" still shows the original non-manager employee.
- "User" (or the `pos_hr` cashier field) shows the manager who validated the
  payment.

- [ ] **Step 6: Confirm direct (non-queued) sales are unaffected**

With `restrict_payment_to_manager` disabled (or logged in as a manager who
pays directly without queueing), sell a product and pay it directly without
using "Enviar a caja". Confirm the resulting order has "Counter Salesperson"
empty — this field should only ever be set via the queue flow.

- [ ] **Step 7: Push the branch**

Once all checks pass, push the branch and open a PR (or push directly to the
appropriate test branch), per this repo's usual workflow.
