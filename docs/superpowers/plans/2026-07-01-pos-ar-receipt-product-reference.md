# AR Receipt Product Reference Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-point-of-sale toggle to `pos_l10n_ar_receipt` that, when enabled, prints the product's internal reference (`default_code`) in bold before its name — but only on the printed/invoiced receipt, never on the live product-screen cart.

**Architecture:** Reuse the existing `pos.config` boolean + `res.config.settings` related-field + settings-view pattern already established in this module for `l10n_ar_receipt_print_duplicate`. On the frontend, extend the shared `point_of_sale.Orderline` OWL template (used both on-screen and on receipts) with an `t-inherit-mode="extension"` xpath, gated on `props.mode === 'receipt'` so it only ever renders when `OrderReceipt` is printing.

**Tech Stack:** Odoo 19.0, Python (Odoo ORM), OWL templates (XML), no JS changes required.

**Context:** No automated test runner exists anywhere in this repo (no `tests/` directories, no CI config). Verification in this plan uses static syntax checks (Python compile, XML well-formedness) during implementation, plus a manual QA checklist to run once the branch is deployed to the Odoo.sh test instance (`18.0-payment`) — that manual pass cannot be scripted from this sandbox.

---

### Task 1: Add the `pos.config` boolean field

**Files:**
- Modify: `pos_l10n_ar_receipt/models/pos_config.py`

Current content of this file:

```python
# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    l10n_ar_receipt_print_duplicate = fields.Boolean(
        string='Print Original and Duplicate (AR)',
        default=False,
        help=(
            "When enabled, invoiced sales print two receipt copies: one labelled "
            "ORIGINAL and one labelled DUPLICADO, for internal control."
        ),
    )

    @api.model
    def _load_pos_data_read(self, records, config):
        # pos.config fields are NOT loaded via _load_pos_data_fields (the base mixin
        # returns [] and core adds fields directly in its _load_pos_data_read override).
        # We follow the same pattern used in pos_centralized_payment to avoid
        # restricting the DB read and breaking core fields.
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['l10n_ar_receipt_print_duplicate'] = config.l10n_ar_receipt_print_duplicate
        return read_records
```

- [ ] **Step 1: Add the new field and expose it in `_load_pos_data_read`**

Replace the full file content with:

```python
# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    l10n_ar_receipt_print_duplicate = fields.Boolean(
        string='Print Original and Duplicate (AR)',
        default=False,
        help=(
            "When enabled, invoiced sales print two receipt copies: one labelled "
            "ORIGINAL and one labelled DUPLICADO, for internal control."
        ),
    )
    l10n_ar_show_product_reference = fields.Boolean(
        string='Show Internal Reference on Receipt',
        default=False,
        help=(
            "When enabled, the product's internal reference (default code) is "
            "printed in bold before its name on the invoiced receipt."
        ),
    )

    @api.model
    def _load_pos_data_read(self, records, config):
        # pos.config fields are NOT loaded via _load_pos_data_fields (the base mixin
        # returns [] and core adds fields directly in its _load_pos_data_read override).
        # We follow the same pattern used in pos_centralized_payment to avoid
        # restricting the DB read and breaking core fields.
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['l10n_ar_receipt_print_duplicate'] = config.l10n_ar_receipt_print_duplicate
            read_records[0]['l10n_ar_show_product_reference'] = config.l10n_ar_show_product_reference
        return read_records
```

- [ ] **Step 2: Verify the file compiles**

Run:
```bash
python -m py_compile pos_l10n_ar_receipt/models/pos_config.py
```
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add pos_l10n_ar_receipt/models/pos_config.py
git commit -m "feat: add l10n_ar_show_product_reference field to pos.config"
```

---

### Task 2: Add the `res.config.settings` related field

**Files:**
- Modify: `pos_l10n_ar_receipt/models/res_config_settings.py`

Current content of this file:

```python
# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_l10n_ar_receipt_print_duplicate = fields.Boolean(
        string='Print Original and Duplicate (AR)',
        related='pos_config_id.l10n_ar_receipt_print_duplicate',
        readonly=False,
    )
```

- [ ] **Step 1: Add the related field**

Replace the full file content with:

```python
# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_l10n_ar_receipt_print_duplicate = fields.Boolean(
        string='Print Original and Duplicate (AR)',
        related='pos_config_id.l10n_ar_receipt_print_duplicate',
        readonly=False,
    )
    pos_l10n_ar_show_product_reference = fields.Boolean(
        string='Show Internal Reference on Receipt',
        related='pos_config_id.l10n_ar_show_product_reference',
        readonly=False,
    )
```

- [ ] **Step 2: Verify the file compiles**

Run:
```bash
python -m py_compile pos_l10n_ar_receipt/models/res_config_settings.py
```
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add pos_l10n_ar_receipt/models/res_config_settings.py
git commit -m "feat: add pos_l10n_ar_show_product_reference related field"
```

---

### Task 3: Add the settings-page toggle

**Files:**
- Modify: `pos_l10n_ar_receipt/views/res_config_settings_views.xml`

Current content of this file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <record id="res_config_settings_view_form_l10n_ar_receipt" model="ir.ui.view">
        <field name="name">res.config.settings.view.form.inherit.pos_l10n_ar_receipt</field>
        <field name="model">res.config.settings</field>
        <field name="inherit_id" ref="point_of_sale.res_config_settings_view_form"/>
        <field name="arch" type="xml">
            <setting id="auto_printing" position="after">
                <setting
                    id="l10n_ar_receipt_print_duplicate"
                    string="Original &amp; Duplicate (AR)"
                    help="Print invoiced sales twice: one ORIGINAL and one DUPLICADO copy for internal control.">
                    <field name="pos_l10n_ar_receipt_print_duplicate" widget="boolean_toggle"/>
                </setting>
            </setting>
        </field>
    </record>
</odoo>
```

- [ ] **Step 1: Add the new setting as a sibling of the existing one**

Replace the full file content with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <record id="res_config_settings_view_form_l10n_ar_receipt" model="ir.ui.view">
        <field name="name">res.config.settings.view.form.inherit.pos_l10n_ar_receipt</field>
        <field name="model">res.config.settings</field>
        <field name="inherit_id" ref="point_of_sale.res_config_settings_view_form"/>
        <field name="arch" type="xml">
            <setting id="auto_printing" position="after">
                <setting
                    id="l10n_ar_receipt_print_duplicate"
                    string="Original &amp; Duplicate (AR)"
                    help="Print invoiced sales twice: one ORIGINAL and one DUPLICADO copy for internal control.">
                    <field name="pos_l10n_ar_receipt_print_duplicate" widget="boolean_toggle"/>
                </setting>
                <setting
                    id="l10n_ar_show_product_reference"
                    string="Product Reference (AR)"
                    help="Print the product's internal reference (default code) before its name on the invoiced receipt.">
                    <field name="pos_l10n_ar_show_product_reference" widget="boolean_toggle"/>
                </setting>
            </setting>
        </field>
    </record>
</odoo>
```

- [ ] **Step 2: Verify the XML is well-formed**

Run:
```bash
python -c "import xml.dom.minidom as m; m.parse('pos_l10n_ar_receipt/views/res_config_settings_views.xml'); print('OK')"
```
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add pos_l10n_ar_receipt/views/res_config_settings_views.xml
git commit -m "feat: add Product Reference (AR) toggle to POS settings"
```

---

### Task 4: Show the reference on the printed receipt only

**Files:**
- Modify: `pos_l10n_ar_receipt/static/src/app/order_receipt.xml`

This file currently ends with the closing `</t>` of `pos_l10n_ar_receipt.OrderReceipt` at line 81, followed by the closing `</templates>` tag. The relevant tail of the current file:

```xml
        <!-- Optional: Breakdown of taxes if it's Factura A -->
        <xpath expr="//div[hasclass('pos-receipt-amount')]" position="after">
            <div t-if="order.l10n_ar_letter === 'A' and order.l10n_ar_tax_details and order.l10n_ar_tax_details.length" class="pos-receipt-taxes" style="font-size: 0.8em; margin-top: 5px;">
                <t t-foreach="order.l10n_ar_tax_details" t-as="tax" t-key="tax_index">
                    <div class="d-flex justify-content-between">
                        <span><t t-esc="tax.name"/></span>
                        <span><t t-esc="formatCurrency(tax.amount)"/></span>
                    </div>
                </t>
            </div>
        </xpath>

    </t>

</templates>
```

- [ ] **Step 1: Add a new `point_of_sale.Orderline` extension template before the closing `</templates>` tag**

Replace:

```xml
    </t>

</templates>
```

With:

```xml
    </t>

    <!--
        Prepend the product's internal reference (default_code) in bold before
        its name, but only when this Orderline instance is being rendered for
        the receipt (mode="receipt", set explicitly by OrderReceipt) and the
        per-POS toggle is enabled. The on-screen cart (mode="display") is
        untouched.
    -->
    <t t-name="pos_l10n_ar_receipt.Orderline" t-inherit="point_of_sale.Orderline" t-inherit-mode="extension">
        <xpath expr="//span[hasclass('text-wrap')]/t[@t-esc='vals.name']" position="before">
            <span t-if="props.mode === 'receipt' and line.config.l10n_ar_show_product_reference and line.product_id.default_code"
                  class="fw-bolder pe-1"
                  t-esc="line.product_id.default_code"/>
        </xpath>
    </t>

</templates>
```

- [ ] **Step 2: Verify the XML is well-formed**

Run:
```bash
python -c "import xml.dom.minidom as m; m.parse('pos_l10n_ar_receipt/static/src/app/order_receipt.xml'); print('OK')"
```
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add pos_l10n_ar_receipt/static/src/app/order_receipt.xml
git commit -m "feat: show product reference before name on AR receipt"
```

---

### Task 5: Manual QA on the Odoo.sh test branch

This module has no automated test runner, so this step is a manual checklist to
run after the branch is deployed to the `18.0-payment` Odoo.sh test instance
(per this repo's usual workflow) with `pos_l10n_ar_receipt` updated.

**Files:** none (verification only).

- [ ] **Step 1: Update the module**

In the test instance, go to Apps, search "POS Argentina Receipt Enhancement",
click Upgrade (or run `-u pos_l10n_ar_receipt` if you have shell access).

- [ ] **Step 2: Confirm the toggle appears and defaults to off**

Go to Settings → Point of Sale → (select the test POS) → find "Product
Reference (AR)" next to "Original & Duplicate (AR)" in the Bills & Receipts
section. Confirm it is OFF by default.

- [ ] **Step 3: Confirm no change with the toggle off**

Open the POS session, add a product with an internal reference (Sales →
Products, set "Internal Reference" on a test product if none has one), sell it
and print the invoiced receipt. Confirm the product name prints exactly as
before (no reference prefix).

- [ ] **Step 4: Enable the toggle and confirm it prints on the receipt**

In Settings, enable "Product Reference (AR)" for the POS, save, and start a
new POS session (config changes require a fresh session in the POS app).
Sell the same product and print the invoiced receipt. Confirm the internal
reference now prints in bold immediately before the product name.

- [ ] **Step 5: Confirm the on-screen cart is unaffected**

With the toggle still on, add the product to a new order and look at the cart
on the product screen (not yet paid/printed). Confirm the product name shows
with no reference prefix — the change must only appear on the printed
receipt.

- [ ] **Step 6: Confirm a product without an internal reference is unaffected**

Sell a product that has no "Internal Reference" set, with the toggle on.
Confirm the receipt prints only the product name, with no stray blank
prefix/space.

- [ ] **Step 7: Push the branch**

Once all checks pass, push the branch to `18.0-payment` per this repo's usual
workflow (see project memory on branch strategy).
