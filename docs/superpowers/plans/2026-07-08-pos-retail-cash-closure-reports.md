# POS Retail Cash Closure Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Odoo 19 module, `pos_retail_cash_closure_reports`, that provides two PDF reports for a retail POS client — a cash closure report (opening/expected/counted balance plus cash in/out detail) and a daily sales report grouped by counter salesperson — downloadable both from the POS closing popup and from the "Print" menu of the `pos.session` backend form.

**Architecture:** Two `AbstractModel` report models compute their data in Python (reusing `report.point_of_sale.report_saledetails.get_sale_details()` for the cash balance summary, and a direct `pos.order`/`payment_ids` query grouped by salesperson for the second report), rendered by two QWeb templates, exposed via two `ir.actions.report` records bound to `pos.session`, and triggered from two new buttons patched into the closing popup — following the exact same structure as the existing `pos_session_control_report` module.

**Tech Stack:** Odoo 19.0, Python (Odoo ORM, QWeb reports), OWL/JS frontend patch.

**Context:** No automated test runner exists anywhere in this repo (no `tests/` directories, no CI config — confirmed via `find . -path "*/tests/*" -iname "*.py"` returning nothing). Verification in this plan uses static syntax checks (Python compile, XML well-formedness) during implementation, plus a manual QA checklist to run once the branch is deployed to a live Odoo 19 test instance with sample POS session data — PDF rendering, the actual balance numbers, and the backend Print-menu binding can only be confirmed there.

**Reference spec:** `docs/superpowers/specs/2026-07-08-pos-retail-cash-closure-reports-design.md`

---

### Task 1: Scaffold the module

**Files:**
- Create: `pos_retail_cash_closure_reports/__init__.py`
- Create: `pos_retail_cash_closure_reports/__manifest__.py`
- Create: `pos_retail_cash_closure_reports/models/__init__.py`

- [ ] **Step 1: Create the top-level `__init__.py`**

Create `pos_retail_cash_closure_reports/__init__.py` with this exact content:

```python
from . import models
```

- [ ] **Step 2: Create the manifest**

Create `pos_retail_cash_closure_reports/__manifest__.py` with this exact content:

```python
{
    'name': 'POS Retail Cash Closure Reports',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Cash closure and per-salesperson sales PDF reports for retail POS.',
    'description': """
        Two PDF reports for the POS closing workflow, tailored for a retail
        setup with counter salespeople sending orders to a centralized
        cashier:

        1. **Rendicion de Caja** - opening/expected/counted cash balance per
           cash payment method, plus a detailed list of cash in/out
           movements (retiros e ingresos) with date/time, type and reason.

        2. **Ventas x Vendedor** - the day's sales grouped by counter
           salesperson (counter_salesperson_id), each group totaled by
           payment method.

        Both reports are downloadable from the closing popup and from the
        "Print" menu of the POS Session backend form.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_centralized_payment'],
    'data': [],
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

Note: `data` starts empty and `assets` is absent — both get filled in as later
tasks add their files. This avoids referencing files that don't exist yet.

- [ ] **Step 3: Create the empty models package**

Create `pos_retail_cash_closure_reports/models/__init__.py` with this exact content:

```python
```

(An empty file — model imports get added to it in Tasks 2 and 4.)

- [ ] **Step 4: Verify the Python files compile**

Run:
```bash
python -m py_compile pos_retail_cash_closure_reports/__init__.py pos_retail_cash_closure_reports/__manifest__.py pos_retail_cash_closure_reports/models/__init__.py
```
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add pos_retail_cash_closure_reports/__init__.py pos_retail_cash_closure_reports/__manifest__.py pos_retail_cash_closure_reports/models/__init__.py
git commit -m "feat: scaffold pos_retail_cash_closure_reports module"
```

---

### Task 2: Cash closure report — Python model

**Files:**
- Create: `pos_retail_cash_closure_reports/models/report_cash_closure.py`
- Modify: `pos_retail_cash_closure_reports/models/__init__.py`

This model reuses `report.point_of_sale.report_saledetails.get_sale_details()`
for the balance summary (same helper `pos_session_control_report` already
uses — see `pos_session_control_report/models/report_session_control.py`),
and queries `account.bank.statement.line` directly for the cash in/out
detail, since `get_sale_details()` only exposes `name`/`amount` per move, not
a timestamp.

- [ ] **Step 1: Create the report model**

Create `pos_retail_cash_closure_reports/models/report_cash_closure.py` with this exact content:

```python
from odoo import models
from odoo.tools.misc import format_datetime as _format_datetime
from odoo.tools.misc import formatLang as _format_lang


class ReportCashClosure(models.AbstractModel):
    _name = 'report.pos_retail_cash_closure_reports.report_cash_closure'
    _description = 'POS Retail Cash Closure Report'

    def _get_report_values(self, docids: list, data: dict | None = None) -> dict:
        env = self.env
        sessions = env['pos.session'].browse(docids)
        sale_details = env['report.point_of_sale.report_saledetails'].get_sale_details(
            session_ids=list(docids)
        )
        currency_id = sessions[0].currency_id if sessions else env.company.currency_id

        # Only payment methods with cash control enabled (get_sale_details()
        # sets 'count' truthy for those) belong in the balance summary.
        cash_payments = [
            payment for payment in sale_details.get('payments', [])
            if payment.get('count')
        ]

        moves = env['account.bank.statement.line'].search([
            ('pos_session_id', 'in', sessions.ids),
        ], order='date asc, id asc')

        cash_moves = [
            {
                'date': _format_datetime(env, move.create_date),
                'type': 'Ingreso' if move.amount > 0 else 'Retiro',
                'reason': move.payment_ref,
                'amount': abs(move.amount),
            }
            for move in moves
        ]
        total_cash_in = sum(move.amount for move in moves if move.amount > 0)
        total_cash_out = sum(-move.amount for move in moves if move.amount < 0)

        return {
            'docs': sessions,
            'currency_id': currency_id,
            # formatLang must be passed explicitly — it is NOT auto-injected in custom reports.
            'formatLang': lambda amount, **kwargs: _format_lang(env, amount, **kwargs),
            'cash_payments': cash_payments,
            'cash_moves': cash_moves,
            'total_cash_in': total_cash_in,
            'total_cash_out': total_cash_out,
            **sale_details,
        }
```

- [ ] **Step 2: Register the model**

Replace the full content of `pos_retail_cash_closure_reports/models/__init__.py` with:

```python
from . import report_cash_closure
```

- [ ] **Step 3: Verify the Python files compile**

Run:
```bash
python -m py_compile pos_retail_cash_closure_reports/models/report_cash_closure.py pos_retail_cash_closure_reports/models/__init__.py
```
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add pos_retail_cash_closure_reports/models/report_cash_closure.py pos_retail_cash_closure_reports/models/__init__.py
git commit -m "feat: add cash closure report model"
```

---

### Task 3: Cash closure report — action and template

**Files:**
- Create: `pos_retail_cash_closure_reports/report/report_cash_closure.xml`
- Create: `pos_retail_cash_closure_reports/views/report_cash_closure_template.xml`
- Modify: `pos_retail_cash_closure_reports/__manifest__.py`

The template follows the same structure as
`pos_session_control_report/report/report_session_control.xml` and
`pos_session_control_report/views/report_session_control_template.xml`.

- [ ] **Step 1: Create the report action**

Create `pos_retail_cash_closure_reports/report/report_cash_closure.xml` with this exact content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <record id="action_report_cash_closure" model="ir.actions.report">
        <field name="name">Rendición de Caja</field>
        <field name="model">pos.session</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">pos_retail_cash_closure_reports.report_cash_closure</field>
        <field name="report_file">pos_retail_cash_closure_reports.report_cash_closure</field>
        <field name="binding_model_id" ref="point_of_sale.model_pos_session"/>
    </record>
</odoo>
```

- [ ] **Step 2: Create the report template**

Create `pos_retail_cash_closure_reports/views/report_cash_closure_template.xml` with this exact content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <template id="report_cash_closure">
        <t t-call="web.html_container">
            <t t-foreach="docs" t-as="session">
                <t t-call="web.external_layout">
                    <t t-set="o" t-value="session"/>
                    <div class="page">

                        <!-- ── Title ─────────────────────────────────────── -->
                        <div class="row mb-4">
                            <div class="col-12 text-center">
                                <h2>Rendición de Caja</h2>
                                <h4 t-esc="session_name or session.name"/>
                                <t t-if="date_start">
                                    <p class="text-muted mb-0">
                                        Inicio: <t t-esc="date_start"/>
                                    </p>
                                </t>
                                <t t-if="date_stop">
                                    <p class="text-muted mb-0">
                                        Cierre: <t t-esc="date_stop"/>
                                    </p>
                                </t>
                            </div>
                        </div>

                        <!-- ── Resumen de caja ─────────────────────────────── -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h5 class="border-bottom pb-1">Resumen de Caja</h5>
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Método</th>
                                            <th class="text-end">Saldo inicial</th>
                                            <th class="text-end">Esperado</th>
                                            <th class="text-end">Contado</th>
                                            <th class="text-end">Diferencia</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <t t-if="not cash_payments">
                                            <tr>
                                                <td colspan="5">Sin métodos de pago con control de efectivo</td>
                                            </tr>
                                        </t>
                                        <t t-foreach="cash_payments" t-as="payment">
                                            <tr t-att-class="payment.get('money_difference') and payment.get('money_difference') != 0 and 'table-warning' or ''">
                                                <td><t t-esc="payment['name']"/></td>
                                                <td class="text-end">
                                                    <t t-esc="formatLang(session.cash_register_balance_start, currency_obj=currency_id)"/>
                                                </td>
                                                <td class="text-end">
                                                    <t t-esc="formatLang(payment.get('final_count', 0), currency_obj=currency_id)"/>
                                                </td>
                                                <td class="text-end">
                                                    <t t-esc="formatLang(payment.get('money_counted', 0), currency_obj=currency_id)"/>
                                                </td>
                                                <td class="text-end"
                                                    t-att-style="payment.get('money_difference') and payment.get('money_difference') != 0 and 'color: red; font-weight: bold;' or ''">
                                                    <t t-esc="formatLang(payment.get('money_difference', 0), currency_obj=currency_id)"/>
                                                </td>
                                            </tr>
                                        </t>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- ── Detalle de movimientos ──────────────────────── -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h5 class="border-bottom pb-1">Detalle de Movimientos</h5>
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Fecha/Hora</th>
                                            <th>Tipo</th>
                                            <th>Motivo</th>
                                            <th class="text-end">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <t t-if="not cash_moves">
                                            <tr>
                                                <td colspan="4">Sin movimientos registrados</td>
                                            </tr>
                                        </t>
                                        <t t-foreach="cash_moves" t-as="move">
                                            <tr>
                                                <td><t t-esc="move['date']"/></td>
                                                <td><t t-esc="move['type']"/></td>
                                                <td><t t-esc="move['reason']"/></td>
                                                <td class="text-end">
                                                    <t t-esc="formatLang(move['amount'], currency_obj=currency_id)"/>
                                                </td>
                                            </tr>
                                        </t>
                                    </tbody>
                                    <tfoot>
                                        <tr class="fw-bold">
                                            <td colspan="3">Total Ingresos</td>
                                            <td class="text-end">
                                                <t t-esc="formatLang(total_cash_in, currency_obj=currency_id)"/>
                                            </td>
                                        </tr>
                                        <tr class="fw-bold">
                                            <td colspan="3">Total Retiros</td>
                                            <td class="text-end">
                                                <t t-esc="formatLang(total_cash_out, currency_obj=currency_id)"/>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                    </div><!-- /.page -->
                </t><!-- /web.external_layout -->
            </t>
        </t>
    </template>
</odoo>
```

- [ ] **Step 3: Register both files in the manifest**

In `pos_retail_cash_closure_reports/__manifest__.py`, replace:

```python
    'data': [],
```

With:

```python
    'data': [
        'report/report_cash_closure.xml',
        'views/report_cash_closure_template.xml',
    ],
```

Do not change anything else in the manifest.

- [ ] **Step 4: Verify the XML is well-formed and the manifest still compiles**

Run:
```bash
python -c "import xml.dom.minidom as m; m.parse('pos_retail_cash_closure_reports/report/report_cash_closure.xml'); print('OK')"
python -c "import xml.dom.minidom as m; m.parse('pos_retail_cash_closure_reports/views/report_cash_closure_template.xml'); print('OK')"
python -m py_compile pos_retail_cash_closure_reports/__manifest__.py
```
Expected: `OK` printed twice, then no output from the third command (exit code 0).

- [ ] **Step 5: Commit**

```bash
git add pos_retail_cash_closure_reports/report/report_cash_closure.xml pos_retail_cash_closure_reports/views/report_cash_closure_template.xml pos_retail_cash_closure_reports/__manifest__.py
git commit -m "feat: add cash closure report action and template"
```

---

### Task 4: Sales-by-salesperson report — Python model

**Files:**
- Create: `pos_retail_cash_closure_reports/models/report_sales_by_salesperson.py`
- Modify: `pos_retail_cash_closure_reports/models/__init__.py`

Grouping key is the first non-empty field among `counter_salesperson_id`,
`employee_id`, `user_id` (in that priority order, per the design spec). The
key is a `(model_name, id)` tuple to avoid collisions between an employee
and a user that happen to share a numeric id, and `None` when none of the
three fields is set.

- [ ] **Step 1: Create the report model**

Create `pos_retail_cash_closure_reports/models/report_sales_by_salesperson.py` with this exact content:

```python
from odoo import models
from odoo.tools.misc import formatLang as _format_lang


class ReportSalesBySalesperson(models.AbstractModel):
    _name = 'report.pos_retail_cash_closure_reports.report_sales_by_salesperson'
    _description = 'POS Retail Sales by Salesperson Report'

    def _get_report_values(self, docids: list, data: dict | None = None) -> dict:
        env = self.env
        sessions = env['pos.session'].browse(docids)
        orders = env['pos.order'].search([
            ('session_id', 'in', sessions.ids),
            ('state', 'not in', ('draft', 'cancel')),
        ])

        groups = {}
        for order in orders:
            salesperson = (
                order.counter_salesperson_id
                or order.employee_id
                or order.user_id
            )
            key = (salesperson._name, salesperson.id) if salesperson else None
            name = salesperson.name if salesperson else 'Sin vendedor asignado'
            group = groups.setdefault(key, {
                'salesperson_name': name,
                'payment_totals': {},
                'total': 0.0,
            })
            for payment in order.payment_ids:
                method_name = payment.payment_method_id.name
                group['payment_totals'][method_name] = (
                    group['payment_totals'].get(method_name, 0.0) + payment.amount
                )
                group['total'] += payment.amount

        group_list = sorted(
            (
                {
                    'salesperson_name': group['salesperson_name'],
                    'payment_totals': [
                        {'name': name, 'amount': amount}
                        for name, amount in group['payment_totals'].items()
                    ],
                    'total': group['total'],
                }
                for group in groups.values()
            ),
            key=lambda group: group['salesperson_name'],
        )
        grand_total = sum(group['total'] for group in group_list)
        currency_id = sessions[0].currency_id if sessions else env.company.currency_id

        return {
            'docs': sessions,
            'currency_id': currency_id,
            # formatLang must be passed explicitly — it is NOT auto-injected in custom reports.
            'formatLang': lambda amount, **kwargs: _format_lang(env, amount, **kwargs),
            'groups': group_list,
            'grand_total': grand_total,
        }
```

- [ ] **Step 2: Register the model**

Replace the full content of `pos_retail_cash_closure_reports/models/__init__.py` with:

```python
from . import report_cash_closure
from . import report_sales_by_salesperson
```

- [ ] **Step 3: Verify the Python files compile**

Run:
```bash
python -m py_compile pos_retail_cash_closure_reports/models/report_sales_by_salesperson.py pos_retail_cash_closure_reports/models/__init__.py
```
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add pos_retail_cash_closure_reports/models/report_sales_by_salesperson.py pos_retail_cash_closure_reports/models/__init__.py
git commit -m "feat: add sales-by-salesperson report model"
```

---

### Task 5: Sales-by-salesperson report — action and template

**Files:**
- Create: `pos_retail_cash_closure_reports/report/report_sales_by_salesperson.xml`
- Create: `pos_retail_cash_closure_reports/views/report_sales_by_salesperson_template.xml`
- Modify: `pos_retail_cash_closure_reports/__manifest__.py`

- [ ] **Step 1: Create the report action**

Create `pos_retail_cash_closure_reports/report/report_sales_by_salesperson.xml` with this exact content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <record id="action_report_sales_by_salesperson" model="ir.actions.report">
        <field name="name">Ventas x Vendedor</field>
        <field name="model">pos.session</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">pos_retail_cash_closure_reports.report_sales_by_salesperson</field>
        <field name="report_file">pos_retail_cash_closure_reports.report_sales_by_salesperson</field>
        <field name="binding_model_id" ref="point_of_sale.model_pos_session"/>
    </record>
</odoo>
```

- [ ] **Step 2: Create the report template**

Create `pos_retail_cash_closure_reports/views/report_sales_by_salesperson_template.xml` with this exact content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <template id="report_sales_by_salesperson">
        <t t-call="web.html_container">
            <t t-foreach="docs" t-as="session">
                <t t-call="web.external_layout">
                    <t t-set="o" t-value="session"/>
                    <div class="page">

                        <!-- ── Title ─────────────────────────────────────── -->
                        <div class="row mb-4">
                            <div class="col-12 text-center">
                                <h2>Ventas x Vendedor</h2>
                                <h4 t-esc="session.name"/>
                                <p class="text-muted mb-0">
                                    <t t-esc="session.config_id.name"/>
                                </p>
                            </div>
                        </div>

                        <!-- ── Grupos por vendedor ──────────────────────────── -->
                        <t t-if="not groups">
                            <div class="row mb-4">
                                <div class="col-12">
                                    <p>Sin ventas registradas.</p>
                                </div>
                            </div>
                        </t>

                        <t t-foreach="groups" t-as="group">
                            <div class="row mb-4">
                                <div class="col-12">
                                    <h5 class="border-bottom pb-1">
                                        <t t-esc="group['salesperson_name']"/>
                                    </h5>
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Medio de pago</th>
                                                <th class="text-end">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <t t-foreach="group['payment_totals']" t-as="payment_total">
                                                <tr>
                                                    <td><t t-esc="payment_total['name']"/></td>
                                                    <td class="text-end">
                                                        <t t-esc="formatLang(payment_total['amount'], currency_obj=currency_id)"/>
                                                    </td>
                                                </tr>
                                            </t>
                                        </tbody>
                                        <tfoot>
                                            <tr class="fw-bold">
                                                <td>Subtotal</td>
                                                <td class="text-end">
                                                    <t t-esc="formatLang(group['total'], currency_obj=currency_id)"/>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </t>

                        <!-- ── Total general ────────────────────────────────── -->
                        <div class="row">
                            <div class="col-12 text-end">
                                <h5>
                                    Total General:
                                    <t t-esc="formatLang(grand_total, currency_obj=currency_id)"/>
                                </h5>
                            </div>
                        </div>

                    </div><!-- /.page -->
                </t><!-- /web.external_layout -->
            </t>
        </t>
    </template>
</odoo>
```

- [ ] **Step 3: Register both files in the manifest**

In `pos_retail_cash_closure_reports/__manifest__.py`, replace:

```python
    'data': [
        'report/report_cash_closure.xml',
        'views/report_cash_closure_template.xml',
    ],
```

With:

```python
    'data': [
        'report/report_cash_closure.xml',
        'report/report_sales_by_salesperson.xml',
        'views/report_cash_closure_template.xml',
        'views/report_sales_by_salesperson_template.xml',
    ],
```

Do not change anything else in the manifest.

- [ ] **Step 4: Verify the XML is well-formed and the manifest still compiles**

Run:
```bash
python -c "import xml.dom.minidom as m; m.parse('pos_retail_cash_closure_reports/report/report_sales_by_salesperson.xml'); print('OK')"
python -c "import xml.dom.minidom as m; m.parse('pos_retail_cash_closure_reports/views/report_sales_by_salesperson_template.xml'); print('OK')"
python -m py_compile pos_retail_cash_closure_reports/__manifest__.py
```
Expected: `OK` printed twice, then no output from the third command (exit code 0).

- [ ] **Step 5: Commit**

```bash
git add pos_retail_cash_closure_reports/report/report_sales_by_salesperson.xml pos_retail_cash_closure_reports/views/report_sales_by_salesperson_template.xml pos_retail_cash_closure_reports/__manifest__.py
git commit -m "feat: add sales-by-salesperson report action and template"
```

---

### Task 6: Closing popup integration

**Files:**
- Create: `pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.js`
- Create: `pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.xml`
- Modify: `pos_retail_cash_closure_reports/__manifest__.py`

Same patch pattern as
`pos_session_control_report/static/src/app/closing_popup/closing_popup_patch.js`.
The XML xpath targets the native `downloadSalesReport` button (the "Daily
Sale" button that ships with `point_of_sale`) so the two new buttons appear
regardless of whether `pos_session_control_report` is also installed.

- [ ] **Step 1: Create the JS patch**

Create `pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.js` with this exact content:

```js
/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

patch(ClosePosPopup.prototype, {
    /**
     * Download the cash closure PDF (opening/expected/counted balance plus
     * the cash in/out movement detail for the session).
     * @returns {Promise<void>}
     */
    async downloadCashClosureReport() {
        return this.report.doAction(
            "pos_retail_cash_closure_reports.action_report_cash_closure",
            [this.pos.session.id]
        );
    },

    /**
     * Download the daily sales PDF, grouped by counter salesperson and
     * totaled per payment method.
     * @returns {Promise<void>}
     */
    async downloadSalesBySalespersonReport() {
        return this.report.doAction(
            "pos_retail_cash_closure_reports.action_report_sales_by_salesperson",
            [this.pos.session.id]
        );
    },
});
```

- [ ] **Step 2: Create the XML patch**

Create `pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.xml` with this exact content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">

    <!--
        Adds "Rendición de Caja" and "Ventas x Vendedor" PDF buttons to the
        closing popup footer, placed immediately after the native
        "Daily Sale" button.
    -->
    <t t-inherit="point_of_sale.ClosePosPopup" t-inherit-mode="extension" owl="1">
        <xpath expr="//button[@t-on-click='this.downloadSalesReport']" position="after">
            <button
                class="button icon btn btn-secondary"
                t-on-click="this.downloadCashClosureReport"
                t-att-class="this.ui.isSmall ? 'w-100' : 'btn-lg'"
                title="Descargar rendición de caja (retiros e ingresos)">
                Rendición de Caja
                <i t-if="!this.ui.isSmall" class="fa fa-download" role="img"/>
            </button>
            <button
                class="button icon btn btn-secondary"
                t-on-click="this.downloadSalesBySalespersonReport"
                t-att-class="this.ui.isSmall ? 'w-100' : 'btn-lg'"
                title="Descargar ventas del día agrupadas por vendedor">
                Ventas x Vendedor
                <i t-if="!this.ui.isSmall" class="fa fa-download" role="img"/>
            </button>
        </xpath>
    </t>

</templates>
```

- [ ] **Step 3: Register the assets in the manifest**

In `pos_retail_cash_closure_reports/__manifest__.py`, replace:

```python
    'data': [
        'report/report_cash_closure.xml',
        'report/report_sales_by_salesperson.xml',
        'views/report_cash_closure_template.xml',
        'views/report_sales_by_salesperson_template.xml',
    ],
    'installable': True,
```

With:

```python
    'data': [
        'report/report_cash_closure.xml',
        'report/report_sales_by_salesperson.xml',
        'views/report_cash_closure_template.xml',
        'views/report_sales_by_salesperson_template.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.js',
            'pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.xml',
        ],
    },
    'installable': True,
```

- [ ] **Step 4: Verify the XML is well-formed and the manifest still compiles**

Run:
```bash
python -c "import xml.dom.minidom as m; m.parse('pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.xml'); print('OK')"
python -m py_compile pos_retail_cash_closure_reports/__manifest__.py
```
Expected: `OK` printed, then no output from the second command (exit code 0).

Also re-read the JS file and confirm braces are balanced (the `patch(...)`
call opens with `patch(ClosePosPopup.prototype, {` and closes with `});`,
with exactly two methods inside).

- [ ] **Step 5: Commit**

```bash
git add pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.js pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.xml pos_retail_cash_closure_reports/__manifest__.py
git commit -m "feat: add closing popup buttons for the two retail cash closure reports"
```

---

### Task 7: Manual QA on a live Odoo test instance

This module has no automated test runner, so this step is a manual checklist
to run once the branch is deployed to a live Odoo 19 test instance with
`pos_retail_cash_closure_reports` installed (it depends on
`pos_centralized_payment`, so that module and its dependencies —
`pos_hr`, `pos_retail_pre_ticket` — must be installed too).

**Files:** none (verification only).

- [ ] **Step 1: Install the module**

In the test instance, go to Apps, remove the "Apps" filter, search "POS
Retail Cash Closure Reports", and click Install (or run
`-i pos_retail_cash_closure_reports` if you have shell access).

- [ ] **Step 2: Set up a session with cash movements and multiple salespeople**

Open a POS session with a cash payment method that has cash control
enabled. As at least two different employees (or via `counter_salesperson_id`
being set on some orders and left empty on others — see
`pos_centralized_payment`'s "Enviar a caja" flow), sell a handful of orders
using at least two different payment methods (e.g. cash and card). Do at
least one cash-in and one cash-out movement during the session (the "Cash
In/Out" button in the POS UI).

- [ ] **Step 3: Download "Rendición de Caja" from the closing popup**

Start closing the session (the popup with "Daily Sale" / "Control Sesión" —
if installed — should now also show "Rendición de Caja" and "Ventas x
Vendedor"). Click "Rendición de Caja" and confirm the PDF downloads and
shows:
- A "Resumen de Caja" row for the cash payment method with a non-empty
  "Saldo inicial" and correct "Esperado"/"Contado"/"Diferencia" values
  matching what's shown in Odoo's own closing control screen.
- A "Detalle de Movimientos" table listing every cash-in as "Ingreso" and
  every cash-out as "Retiro", each with a real date/time and the reason
  text you entered.
- "Total Ingresos" and "Total Retiros" matching the sum of the movements
  shown.

- [ ] **Step 4: Download "Ventas x Vendedor" from the closing popup**

Still in the closing popup (before finishing the close), click "Ventas x
Vendedor" and confirm the PDF downloads and shows:
- One section per distinct salesperson (or cashier, if `counter_salesperson_id`
  was empty on some orders), each listing the payment methods used with the
  correct summed totals, and a subtotal matching the sum of those payment
  totals.
- A "Total General" at the end equal to the sum of every group's subtotal,
  which should match the session's total sales.
- Any order paid without `counter_salesperson_id` set is correctly folded
  into the cashier's (`employee_id`/`user_id`) group rather than showing
  under "Sin vendedor asignado", unless neither field is set either.

- [ ] **Step 5: Finish closing the session**

Complete the cash closing as normal (confirm counted amounts, close the
session). Confirm this module's buttons didn't interfere with the native
closing flow.

- [ ] **Step 6: Confirm the backend Print-menu binding**

In Backend → Point of Sale → Orders → Sessions, open the session you just
closed. Click the "Print" (gear/cog or print icon) menu on the form view
and confirm both "Rendición de Caja" and "Ventas x Vendedor" appear as
options, alongside "Control Sesión" if that module is installed. Click each
and confirm the same PDFs download correctly from the backend.

- [ ] **Step 7: Confirm an empty-movements session still renders cleanly**

Open (or close) a different session that had no cash in/out movements at
all during it, and download "Rendición de Caja" for it. Confirm the
"Detalle de Movimientos" table shows "Sin movimientos registrados" instead
of erroring or rendering an empty table with no message.

- [ ] **Step 8: Push the branch**

Once all checks pass, push the branch and open a PR (or push directly to
the appropriate test branch), per this repo's usual workflow.
