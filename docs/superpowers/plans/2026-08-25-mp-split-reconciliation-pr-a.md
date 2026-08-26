# PR A — Remove reconciliation from `pos_mercado_pago_alpy` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the per-payment Mercado Pago HTTP calls off the POS session closing path by removing the reconciliation feature from `pos_mercado_pago_alpy`, so closing a session stops costing 15–30 seconds (and up to 16 minutes when the API is degraded).

**Architecture:** Pure removal. The closing-hook file is deleted outright, five fields and one method leave `pos.payment`, and the matching view columns go with them. A defensive migration script drops the leftover columns. Nothing is added; the payment flow is untouched.

**Tech Stack:** Odoo 19.0, `pos_mercado_pago_alpy`.

**Spec:** [docs/superpowers/specs/2026-08-25-mp-split-reconciliation-design.md](../specs/2026-08-25-mp-split-reconciliation-design.md) — this plan covers **PR A only**. PR B (the `pos_mercado_pago_reconciliation` add-on) gets its own plan.

---

## Background you need before starting

`pos_mercado_pago_alpy` does two unrelated jobs: it charges cards on Point Smart terminals, and it calls the Mercado Pago API to fetch each payment's net amount, fees and release date for bank reconciliation. This PR removes the second job. It will come back as a separate, sellable add-on — that is PR B, and nothing in this plan should anticipate it.

**Why this is urgent:** `pos.session.action_pos_session_closing_control()` is overridden to run `_mp_fetch_reconciliation_info()` *before* the closing entries are created. That method loops payment by payment, serially, issuing up to two HTTP calls each (`/v1/payments/{id}` and, as a fallback, `/v1/payments/search`). `MercadoPagoPosRequest` uses `REQUEST_TIMEOUT = 10`. A 50-payment session therefore adds 15–30 seconds to every close on a good day, and up to 1000 seconds when Mercado Pago is slow. The `try/except` around the call stops the close from *failing*, not from *hanging*.

**What must NOT be touched:** the payment flow (`static/src/app/utils/payment/payment_mercado_pago.js`), the webhook controller, the QR popup, `MercadoPagoPosRequest`, `mp_bearer_token`, `MP_TERMINAL_TYPES`, and the fields `mp_payment_id` / `mp_external_reference`. Those last two belong to charging, not reconciling — the JS writes them while the payment is being taken.

### Running things

There is **no runnable Odoo** in the authoring environment (PostgreSQL stopped, `psycopg2` absent), and this module has **no test suite**. Verification is therefore static plus a manual pass by the user.

Static checks you can run:
- `C:\Python314\python.exe -m py_compile <file.py>`
- `C:\Python314\python.exe -c "from lxml import etree; etree.parse(r'<file.xml>'); print('XML OK')"`
- `grep` for removed identifiers, to prove nothing still references them

The user runs, later:
- `odoo -c <conf> -d <db> -u pos_mercado_pago_alpy --stop-after-init`

---

## File Structure

```
pos_mercado_pago_alpy/
├── __manifest__.py                     # MODIFIED — version bump
├── README.md                           # MODIFIED — note where reconciliation went
├── migrations/19.0.4.0/post-migrate.py # NEW — defensive column drop
├── models/
│   ├── __init__.py                     # MODIFIED — drop the pos_session import
│   ├── pos_payment.py                  # MODIFIED — 5 fields + 1 method removed
│   └── pos_session.py                  # DELETED
└── views/pos_payment_views.xml         # MODIFIED — reconciliation columns removed
```

Untouched: `controllers/`, `data/`, `static/`, `models/mercado_pago_post_request.py`, `models/pos_payment_method.py`, `views/pos_payment_method_views.xml`.

---

### Task 1: Remove the session closing hook

This is the change that actually fixes the closing speed. It stands alone: the fields still exist and the views still render, only the trigger is gone, so the module is consistent after this task.

**Files:**
- Delete: `pos_mercado_pago_alpy/models/pos_session.py`
- Modify: `pos_mercado_pago_alpy/models/__init__.py`

- [ ] **Step 1: Delete the file**

```bash
git rm pos_mercado_pago_alpy/models/pos_session.py
```

The whole file exists only to override `action_pos_session_closing_control`. There is nothing in it worth keeping here — the equivalent logic returns in PR B as a cron.

- [ ] **Step 2: Drop the import**

`pos_mercado_pago_alpy/models/__init__.py` must become exactly:

```python
from . import mercado_pago_post_request
from . import pos_payment_method
from . import pos_payment
```

(The removed line was `from . import pos_session`.)

- [ ] **Step 3: Verify no dangling reference**

Run: `grep -rnE "import pos_session|models\.pos_session|action_pos_session_closing_control" pos_mercado_pago_alpy/`
Expected: **no matches.** If anything matches, stop and report it — something else referenced that module and this plan did not account for it.

Do **not** grep for the bare string `pos_session`: the webhook controller uses a local
variable named `pos_session_sudo` and the payment JS reads `this.pos.pos_session`,
neither of which has anything to do with the deleted module. A bare grep returns 13
false positives and tells you nothing.

Then: `C:\Python314\python.exe -m py_compile pos_mercado_pago_alpy/models/__init__.py`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add pos_mercado_pago_alpy/models
git commit -m "perf(pos_mercado_pago_alpy): stop fetching reconciliation info at session close"
```

---

### Task 2: Remove the reconciliation fields, the method and their view columns

These go together in one task on purpose. Removing the fields while the views still reference them leaves the module unable to load — `ir.ui.view` validation fails on a field that no longer exists. Splitting this task would create a broken intermediate commit.

**Files:**
- Modify: `pos_mercado_pago_alpy/models/pos_payment.py`
- Modify: `pos_mercado_pago_alpy/views/pos_payment_views.xml`

- [ ] **Step 1: Reduce the model**

Replace the **entire content** of `pos_mercado_pago_alpy/models/pos_payment.py` with:

```python
from odoo import fields, models


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    mp_payment_id = fields.Char(
        string='MP Payment ID',
        help='Mercado Pago payment identifier, captured when the payment is approved.',
    )
    mp_external_reference = fields.Char(
        string='MP External Reference',
        help='External reference sent to Mercado Pago when the payment was requested. '
             'Used to look the payment up when the payment id is not available.',
    )
```

This removes the five reconciliation fields (`mp_net_amount`, `mp_fee_amount`, `mp_release_date`, `mp_status_detail`, `mp_info_fetched`), the `_mp_fetch_reconciliation_info` method, and the five imports that become unused with it (`logging`, `timezone`, `dateutil_parser`, `MercadoPagoPosRequest`, `MP_TERMINAL_TYPES`). The file goes from ~120 lines to ~15.

Keep `mp_payment_id` and `mp_external_reference` exactly as they are — the payment JS writes to both.

- [ ] **Step 2: Reduce the views**

Replace the **entire content** of `pos_mercado_pago_alpy/views/pos_payment_views.xml` with:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="view_pos_payment_tree_inherit_mp" model="ir.ui.view">
        <field name="name">pos.payment.tree.inherit.mercado.pago</field>
        <field name="model">pos.payment</field>
        <field name="inherit_id" ref="point_of_sale.view_pos_payment_tree"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='payment_method_id']" position="after">
                <field name="mp_payment_id" optional="hide"/>
            </xpath>
        </field>
    </record>

    <record id="view_pos_payment_form_inherit_mp" model="ir.ui.view">
        <field name="name">pos.payment.form.inherit.mercado.pago</field>
        <field name="model">pos.payment</field>
        <field name="inherit_id" ref="point_of_sale.view_pos_payment_form"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='payment_method_id']" position="after">
                <field name="mp_payment_id"/>
                <field name="mp_external_reference"/>
            </xpath>
        </field>
    </record>
</odoo>
```

Both records and both xpath anchors are unchanged; only the reconciliation `<field>` lines are gone.

- [ ] **Step 3: Verify nothing still references the removed names**

Run this over the whole module:

```bash
grep -rn "mp_net_amount\|mp_fee_amount\|mp_release_date\|mp_status_detail\|mp_info_fetched\|_mp_fetch_reconciliation_info" pos_mercado_pago_alpy/
```

Expected: **no matches.** A match in `static/` would mean the frontend reads one of these — stop and report it, because this plan assumed it does not.

- [ ] **Step 4: Verify the files still parse**

Run: `C:\Python314\python.exe -m py_compile pos_mercado_pago_alpy/models/pos_payment.py`
Expected: no output, exit 0.

Run: `C:\Python314\python.exe -c "from lxml import etree; etree.parse(r'pos_mercado_pago_alpy/views/pos_payment_views.xml'); print('XML OK')"`
Expected: `XML OK`.

- [ ] **Step 5: Commit**

```bash
git add pos_mercado_pago_alpy/models/pos_payment.py pos_mercado_pago_alpy/views/pos_payment_views.xml
git commit -m "refactor(pos_mercado_pago_alpy): drop the reconciliation fields and their views"
```

---

### Task 3: Bump the version and add the defensive migration

**Files:**
- Modify: `pos_mercado_pago_alpy/__manifest__.py`
- Create: `pos_mercado_pago_alpy/migrations/19.0.4.0/post-migrate.py`

- [ ] **Step 1: Bump the version**

In `pos_mercado_pago_alpy/__manifest__.py`, change the version line from:

```python
    'version': '19.0.3.2',
```

to:

```python
    'version': '19.0.4.0',
```

Change nothing else in the manifest. The migration folder name must match this string exactly, or Odoo will not run the script.

- [ ] **Step 2: Write the migration**

Create `pos_mercado_pago_alpy/migrations/19.0.4.0/post-migrate.py`:

```python
"""Drop the reconciliation columns left behind by the settlement split.

Odoo normally does this by itself: once the fields are gone from the code
their ir.model.data xmlids are no longer loaded, ir.model.data._process_end()
unlinks the matching ir.model.fields records, and IrModelFields.unlink() calls
_drop_column(), which issues the ALTER TABLE.

This script is a safety net for the cases where that cleanup does not run --
an update with import_partial, or a database where the fields were flagged
noupdate or the module was force-removed. It is idempotent and will normally
find nothing to do.
"""

from odoo.tools import SQL, sql

TABLE = 'pos_payment'
COLUMNS = (
    'mp_net_amount',
    'mp_fee_amount',
    'mp_release_date',
    'mp_status_detail',
    'mp_info_fetched',
)


def migrate(cr, version):
    for column in COLUMNS:
        if sql.column_exists(cr, TABLE, column):
            cr.execute(SQL(
                'ALTER TABLE %s DROP COLUMN %s CASCADE',
                SQL.identifier(TABLE),
                SQL.identifier(column),
            ))
```

Notes for the implementer, all verified against the Odoo 19 source:
- `SQL` and `sql` both come from `odoo.tools` — that is how `odoo/addons/base/models/ir_model.py:18` imports them.
- `sql.column_exists(cr, tablename, columnname)` is defined at `odoo/tools/sql.py:315`.
- The `SQL(...)` / `SQL.identifier(...)` form mirrors core's own drop at `ir_model.py:867`.
- No `f`-string or `%` interpolation into SQL: identifiers go through `SQL.identifier`.
- The repo's migration convention comes from `payment_pay_way/migrations/17.0.2.0.0/post-migrate.py`: a folder named for the exact manifest version, a file named `post-migrate.py`, and a `migrate(cr, version)` function.

- [ ] **Step 3: Verify**

Run: `C:\Python314\python.exe -m py_compile pos_mercado_pago_alpy/migrations/19.0.4.0/post-migrate.py`
Expected: no output, exit 0.

Run: `ls pos_mercado_pago_alpy/migrations/19.0.4.0/`
Expected: `post-migrate.py`. Confirm the folder name matches the manifest version string character for character.

Note: Odoo does **not** require an `__init__.py` inside migration folders — it loads these files directly, and `payment_pay_way` has none. Do not add one.

- [ ] **Step 4: Commit**

```bash
git add pos_mercado_pago_alpy/__manifest__.py pos_mercado_pago_alpy/migrations
git commit -m "chore(pos_mercado_pago_alpy): bump to 19.0.4.0 and drop leftover columns"
```

---

### Task 4: Say where reconciliation went

Anyone who had the reconciliation columns will look for them. The README should answer that without them having to read a diff.

**Files:**
- Modify: `pos_mercado_pago_alpy/README.md`

- [ ] **Step 1: Add the note**

The README currently never mentions reconciliation, so nothing needs correcting — this is purely an addition. Append this section to the end of `pos_mercado_pago_alpy/README.md`:

```markdown
## Not included: bank reconciliation

This module charges payments. It does **not** fetch settlement data (net amount,
fees, release date) from the Mercado Pago API.

That used to live here and ran during POS session closing, where it added a
serial HTTP call per payment to the close. It now lives in the separate
`pos_mercado_pago_reconciliation` add-on, which fetches the same data from a
scheduled job instead, off the closing path.

Payments still record `mp_payment_id` and `mp_external_reference` — the add-on
needs both to look a payment up.
```

Leave the rest of the README alone, including the stale `v18.0.0.2` in its title: fixing that is unrelated to this PR.

- [ ] **Step 2: Commit**

```bash
git add pos_mercado_pago_alpy/README.md
git commit -m "docs(pos_mercado_pago_alpy): point to the reconciliation add-on"
```

---

## Verification the user must run

None of this can be checked in the authoring environment. Hand this list over with the PR:

- [ ] `odoo -c <conf> -d <db> -u pos_mercado_pago_alpy --stop-after-init` exits 0 with no `ParseError`
- [ ] The five columns are gone: `SELECT column_name FROM information_schema.columns WHERE table_name = 'pos_payment' AND column_name LIKE 'mp_%';` returns only `mp_payment_id` and `mp_external_reference`
- [ ] **Close a POS session holding Mercado Pago payments and confirm no HTTP call to `api.mercadopago.com` is made.** This is the whole point of the PR — verify it, do not assume it
- [ ] Time that close against the old behaviour and confirm the 15–30 seconds are gone
- [ ] Charge a payment on a Point Smart terminal: it still works, and `mp_payment_id` / `mp_external_reference` are still recorded
- [ ] Open the `pos.payment` list and form views: both render, showing the two remaining MP fields

---

## Out of scope — do not build these

- **The `pos_mercado_pago_reconciliation` add-on.** That is PR B, with its own plan.
- **A test suite for `pos_mercado_pago_alpy`.** The module has none today; adding one is real work unrelated to this removal.
- **Fixing the stale `v18.0.0.2` in the README title.**
- **Any change to the payment flow, the webhook controller or the QR popup.**
