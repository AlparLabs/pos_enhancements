# POS Cash Move Reason — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable concept buttons to the POS cash in/out popup so each cash move is posted directly against a preset counterpart account (and optional contact) instead of landing in the journal's suspense account.

**Architecture:** A new catalogue model `pos.cash.move.reason` (modelled on core's `pos.bill`) is loaded into the POS and rendered as a button grid in `CashMovePopup`. The selected concept travels to the server inside the existing free-form `extras` dict of `try_cash_in_out`. The server re-reads the concept from the database and injects `counterpart_account_id` into the statement line's create vals — a key core itself pops and honours — so the journal entry is born fully imputed and posted.

**Tech Stack:** Odoo 19.0, `point_of_sale`, OWL 3 patches, Python `TransactionCase` tests via `TestPoSCommon`.

**Spec:** [docs/superpowers/specs/2026-08-25-pos-cash-move-reason-design.md](../specs/2026-08-25-pos-cash-move-reason-design.md)

---

## Background you need before starting

You are writing an Odoo 19 addon. Three facts about the core drive every decision here. Verify nothing; they were already checked against the source at `addons/`:

1. **`account.bank.statement.line.create()` accepts a `counterpart_account_id` key in the vals** (`account/models/account_bank_statement_line.py:393`). It is *not* a stored field: core pops it out of the vals and passes it to `_prepare_move_line_default_vals()`, which uses it instead of `journal_id.suspense_account_id`. The move is then posted automatically at the end of `create()`.

2. **Core creates the statement lines first, and only then builds the journal-entry lines** (same file, lines 401-408). That ordering is what lets us store our own fields on the statement line and read them back from `self` inside `_prepare_move_line_default_vals()`.

3. **In POS, the statement line's `partner_id` is the cashier**, not a supplier: the popup sends `this.pos.user.partner_id.id` and `pos.session._prepare_account_bank_statement_line_vals()` writes it (`point_of_sale/models/pos_session.py:1840`). Core copies it to *both* journal-entry lines. We must therefore never overwrite it — the supplier goes on the counterpart line only.

`_prepare_move_line_default_vals()` returns a two-element list: `[liquidity_line_vals, counterpart_line_vals]`. Index `1` is the counterpart.

### Running things

Replace `<conf>` and `<db>` with your local Odoo config file and database.

- Install: `odoo -c <conf> -d <db> -i pos_cash_move_reason --stop-after-init`
- Upgrade: `odoo -c <conf> -d <db> -u pos_cash_move_reason --stop-after-init`
- Tests: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`

Tests are Odoo integration tests, not pytest. There is no way to run a single test method by name from the CLI in this setup; `--test-tags /pos_cash_move_reason` runs the module's whole suite. When a step says "expected: FAIL", it means the suite fails with that specific error.

---

## File Structure

```
pos_cash_move_reason/
├── __init__.py
├── __manifest__.py
├── README.md
├── models/
│   ├── __init__.py
│   ├── pos_cash_move_reason.py          # the catalogue model + POS loading
│   ├── pos_session.py                   # model registration + counterpart injection
│   └── account_bank_statement_line.py   # new fields + counterpart partner
├── security/
│   └── ir.model.access.csv
├── views/
│   └── pos_cash_move_reason_views.xml   # list, form, action, menu
├── static/src/app/cash_move_popup/
│   ├── cash_move_popup_patch.js         # button grid state, partner, payload
│   └── cash_move_popup_patch.xml        # grid markup
└── tests/
    ├── __init__.py
    └── test_cash_move_reason.py
```

Each Python file has one responsibility: the catalogue, the POS-side injection, the accounting-side write. Do not merge them.

---

### Task 1: Installable skeleton with the catalogue model

**Files:**
- Create: `pos_cash_move_reason/__init__.py`
- Create: `pos_cash_move_reason/__manifest__.py`
- Create: `pos_cash_move_reason/models/__init__.py`
- Create: `pos_cash_move_reason/models/pos_cash_move_reason.py`
- Create: `pos_cash_move_reason/security/ir.model.access.csv`

- [ ] **Step 1: Create the package files**

`pos_cash_move_reason/__init__.py`:

```python
from . import models
```

`pos_cash_move_reason/models/__init__.py`:

```python
from . import pos_cash_move_reason
```

- [ ] **Step 2: Create the manifest**

`pos_cash_move_reason/__manifest__.py`:

```python
{
    'name': 'POS Cash Move Reason',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Configurable concept buttons for POS cash in/out, with preset counterpart account.',
    'description': """
Adds configurable concept buttons to the POS cash in/out popup, in the spirit of
the reconciliation model buttons of the bank reconciliation widget.

Each concept carries a preset counterpart account and, optionally, a contact.
When the cashier picks one, the resulting journal entry is posted straight against
that account instead of the cash journal's suspense account — no manual
reconciliation afterwards, and no free-text typos in the movement reason.

Concepts without an account behave exactly like today (they land in the suspense
account) and only serve as label shortcuts, so the catalogue can be rolled out
before every account is decided.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

- [ ] **Step 3: Create the catalogue model**

`pos_cash_move_reason/models/pos_cash_move_reason.py`:

```python
from odoo import api, fields, models


class PosCashMoveReason(models.Model):
    _name = 'pos.cash.move.reason'
    _description = 'POS Cash Move Reason'
    _inherit = ['pos.load.mixin']
    _order = 'sequence, name'

    name = fields.Char(
        string='Concept',
        required=True,
        help='Label shown on the button in the cash in/out popup, e.g. "PROVEEDORES".',
    )
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(string='Active', default=True)
    move_type = fields.Selection(
        [('in', 'Cash In'), ('out', 'Cash Out'), ('both', 'Both')],
        string='Applies To',
        required=True,
        default='out',
    )
    account_id = fields.Many2one(
        'account.account',
        string='Counterpart Account',
        check_company=True,
        ondelete='restrict',
        domain="[('deprecated', '=', False)]",
        help='Account the cash move is posted against. Leave empty to fall back to the '
             "cash journal's suspense account, which is the standard Odoo behaviour.",
    )
    partner_mode = fields.Selection(
        [('none', 'No contact'), ('fixed', 'Fixed contact'), ('ask', 'Ask the cashier')],
        string='Contact Mode',
        required=True,
        default='none',
    )
    partner_id = fields.Many2one(
        'res.partner',
        string='Fixed Contact',
        ondelete='restrict',
        help='Used only when Contact Mode is "Fixed contact".',
    )
    config_ids = fields.Many2many(
        'pos.config',
        string='Points of Sale',
        help='Terminals that show this concept. Leave empty to show it on every terminal.',
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company,
    )

    @api.model
    def _load_pos_data_domain(self, data, config):
        # Same shape as core's pos.bill: an empty config_ids means "every terminal".
        return [
            ('company_id', '=', config.company_id.id),
            '|', ('config_ids', '=', config.id), ('config_ids', '=', False),
        ]

    @api.model
    def _load_pos_data_fields(self, config):
        # account_id is deliberately NOT sent to the browser: the client has no business
        # knowing the chart of accounts, and the server re-reads it anyway.
        # partner_id is left out too — POS only loads a subset of res.partner, so a fixed
        # contact outside that subset would arrive as a dangling relation. The server
        # resolves the fixed contact itself.
        return ['id', 'name', 'sequence', 'move_type', 'partner_mode']
```

- [ ] **Step 4: Create the access rules**

`pos_cash_move_reason/security/ir.model.access.csv`:

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_pos_cash_move_reason_user,pos.cash.move.reason user,model_pos_cash_move_reason,point_of_sale.group_pos_user,1,0,0,0
access_pos_cash_move_reason_manager,pos.cash.move.reason manager,model_pos_cash_move_reason,point_of_sale.group_pos_manager,1,1,1,1
```

The cashier group needs read access or the POS cannot load the catalogue to draw the buttons.

- [ ] **Step 5: Install and verify**

Run: `odoo -c <conf> -d <db> -i pos_cash_move_reason --stop-after-init`
Expected: exits 0, no traceback. The log line `Loading module pos_cash_move_reason` appears and no `ParseError` / `KeyError` follows.

- [ ] **Step 6: Commit**

```bash
git add pos_cash_move_reason
git commit -m "feat(pos_cash_move_reason): add cash move reason catalogue model"
```

---

### Task 2: Constraint — a fixed contact mode requires a contact

**Files:**
- Create: `pos_cash_move_reason/tests/__init__.py`
- Create: `pos_cash_move_reason/tests/test_cash_move_reason.py`
- Modify: `pos_cash_move_reason/models/pos_cash_move_reason.py`

- [ ] **Step 1: Write the failing test**

`pos_cash_move_reason/tests/__init__.py`:

```python
from . import test_cash_move_reason
```

`pos_cash_move_reason/tests/test_cash_move_reason.py`:

```python
from odoo.addons.point_of_sale.tests.common import TestPoSCommon
from odoo.exceptions import ValidationError
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestCashMoveReason(TestPoSCommon):
    """Counterpart account and contact on POS cash in/out moves."""

    def setUp(self):
        super().setUp()
        self.config = self.basic_config
        self.expense_account = self.company_data['default_account_expense']
        self.supplier = self.env['res.partner'].create({'name': 'Distribuidora Lopez'})

    def _make_reason(self, **kwargs):
        """Create a concept. Defaults to a plain cash-out concept with no account."""
        vals = {'name': 'PROVEEDORES', 'move_type': 'out'}
        vals.update(kwargs)
        return self.env['pos.cash.move.reason'].create(vals)

    def test_fixed_contact_mode_requires_a_contact(self):
        with self.assertRaises(ValidationError):
            self._make_reason(partner_mode='fixed')
```

Do **not** import `tests` from the module's `__init__.py`. Odoo discovers the `tests/`
package on its own when `--test-enable` is passed; importing it in the manifest chain
would load test code in production.

- [ ] **Step 2: Run the test to verify it fails**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: FAIL — `AssertionError: ValidationError not raised`.

- [ ] **Step 3: Add the constraint**

In `pos_cash_move_reason/models/pos_cash_move_reason.py`, change the import line at the top to include the exception:

```python
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
```

Then add this method immediately after the `company_id` field definition and before `_load_pos_data_domain`:

```python
    @api.constrains('partner_mode', 'partner_id')
    def _check_partner_id_required(self):
        for reason in self:
            if reason.partner_mode == 'fixed' and not reason.partner_id:
                raise ValidationError(_(
                    'The concept "%s" is set to use a fixed contact, so a contact must be selected.',
                    reason.name,
                ))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: PASS — `1 test` reported, `0 failed, 0 error(s)`.

- [ ] **Step 5: Commit**

```bash
git add pos_cash_move_reason/models/pos_cash_move_reason.py pos_cash_move_reason/tests
git commit -m "feat(pos_cash_move_reason): require a contact when partner_mode is fixed"
```

---

### Task 3: Configuration views and menu

**Files:**
- Create: `pos_cash_move_reason/views/pos_cash_move_reason_views.xml`
- Modify: `pos_cash_move_reason/__manifest__.py`

- [ ] **Step 1: Create the views**

`pos_cash_move_reason/views/pos_cash_move_reason_views.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <record id="pos_cash_move_reason_view_list" model="ir.ui.view">
        <field name="name">pos.cash.move.reason.list</field>
        <field name="model">pos.cash.move.reason</field>
        <field name="arch" type="xml">
            <list string="Cash Move Concepts" editable="bottom">
                <field name="sequence" widget="handle"/>
                <field name="name"/>
                <field name="move_type"/>
                <field name="account_id" options="{'no_create': True}"/>
                <field name="partner_mode"/>
                <field name="partner_id"
                       options="{'no_create': True}"
                       readonly="partner_mode != 'fixed'"/>
                <field name="config_ids" widget="many2many_tags" optional="show"/>
                <field name="company_id" groups="base.group_multi_company" optional="hide"/>
                <field name="active" column_invisible="True"/>
            </list>
        </field>
    </record>

    <record id="pos_cash_move_reason_view_form" model="ir.ui.view">
        <field name="name">pos.cash.move.reason.form</field>
        <field name="model">pos.cash.move.reason</field>
        <field name="arch" type="xml">
            <form string="Cash Move Concept">
                <sheet>
                    <widget name="web_ribbon" title="Archived" bg_color="text-bg-danger"
                            invisible="active"/>
                    <div class="oe_title">
                        <label for="name"/>
                        <h1><field name="name" placeholder="e.g. PROVEEDORES"/></h1>
                    </div>
                    <group>
                        <group>
                            <field name="move_type"/>
                            <field name="account_id" options="{'no_create': True}"/>
                            <field name="sequence"/>
                            <field name="active" invisible="1"/>
                        </group>
                        <group>
                            <field name="partner_mode"/>
                            <field name="partner_id"
                                   options="{'no_create': True}"
                                   invisible="partner_mode != 'fixed'"
                                   required="partner_mode == 'fixed'"/>
                            <field name="company_id" groups="base.group_multi_company"/>
                        </group>
                    </group>
                    <group string="Points of Sale">
                        <field name="config_ids" widget="many2many_tags" nolabel="1"
                               placeholder="Leave empty to show on every terminal"/>
                    </group>
                </sheet>
            </form>
        </field>
    </record>

    <record id="pos_cash_move_reason_action" model="ir.actions.act_window">
        <field name="name">Cash Move Concepts</field>
        <field name="res_model">pos.cash.move.reason</field>
        <field name="view_mode">list,form</field>
        <field name="help" type="html">
            <p class="o_view_nocontent_smiling_face">Create your first cash move concept</p>
            <p>
                Concepts appear as buttons in the cash in/out popup of the Point of Sale.
                Each one can carry a counterpart account, so the journal entry is posted
                already imputed instead of waiting in the suspense account.
            </p>
        </field>
    </record>

    <!-- Same parent and groups as core's Coins/Bills menu (point_of_sale/views/pos_bill_view.xml). -->
    <menuitem id="pos_cash_move_reason_menu"
              name="Cash Move Concepts"
              parent="point_of_sale.menu_point_config_product"
              action="pos_cash_move_reason_action"
              sequence="25"
              groups="point_of_sale.group_pos_manager"/>

</odoo>
```

- [ ] **Step 2: Register the views in the manifest**

In `pos_cash_move_reason/__manifest__.py`, replace the `data` key with:

```python
    'data': [
        'security/ir.model.access.csv',
        'views/pos_cash_move_reason_views.xml',
    ],
```

- [ ] **Step 3: Upgrade and verify the views parse**

Run: `odoo -c <conf> -d <db> -u pos_cash_move_reason --stop-after-init`
Expected: exits 0, no `ParseError`. The parent xmlid `point_of_sale.menu_point_config_product` is the same one core's Coins/Bills menu uses, so it resolves.

- [ ] **Step 4: Verify by hand in the backend**

Open Odoo, go to **Point of Sale → Configuration → Cash Move Concepts**. Create one named `VARIOS`, leave the account empty, save. Set Contact Mode to "Fixed contact" and confirm the Fixed Contact field appears and is required.

- [ ] **Step 5: Commit**

```bash
git add pos_cash_move_reason/views pos_cash_move_reason/__manifest__.py
git commit -m "feat(pos_cash_move_reason): add configuration views and menu"
```

---

### Task 4: Load the catalogue into the POS

**Files:**
- Create: `pos_cash_move_reason/models/pos_session.py`
- Modify: `pos_cash_move_reason/models/__init__.py`
- Modify: `pos_cash_move_reason/tests/test_cash_move_reason.py`

- [ ] **Step 1: Write the failing test**

Append to the `TestCashMoveReason` class in `pos_cash_move_reason/tests/test_cash_move_reason.py`:

```python
    def test_concepts_are_scoped_by_point_of_sale(self):
        shared = self._make_reason(name='VARIOS')
        scoped = self._make_reason(
            name='DELIVERY',
            config_ids=[(6, 0, [self.other_currency_config.id])],
        )

        domain = self.env['pos.cash.move.reason']._load_pos_data_domain({}, self.config)
        loaded = self.env['pos.cash.move.reason'].search(domain)

        self.assertIn(shared, loaded, 'an empty config_ids must load on every terminal')
        self.assertNotIn(scoped, loaded, 'a concept scoped to another terminal must not load')

    def test_the_model_is_registered_for_pos_loading(self):
        models = self.env['pos.session']._load_pos_data_models(self.config)
        self.assertIn('pos.cash.move.reason', models)
```

- [ ] **Step 2: Run the tests to verify the second one fails**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: FAIL — `test_the_model_is_registered_for_pos_loading` reports `'pos.cash.move.reason' not found in [...]`. `test_concepts_are_scoped_by_point_of_sale` already passes, because the domain was written in Task 1.

- [ ] **Step 3: Register the model for POS loading**

`pos_cash_move_reason/models/pos_session.py`:

```python
from odoo import api, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config):
        return super()._load_pos_data_models(config) + ['pos.cash.move.reason']
```

Modify `pos_cash_move_reason/models/__init__.py` to:

```python
from . import pos_cash_move_reason
from . import pos_session
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: PASS — `3 tests`, `0 failed, 0 error(s)`.

- [ ] **Step 5: Commit**

```bash
git add pos_cash_move_reason/models
git commit -m "feat(pos_cash_move_reason): load the concept catalogue into the POS"
```

---

### Task 5: Store the concept and the counterpart contact on the statement line

**Files:**
- Create: `pos_cash_move_reason/models/account_bank_statement_line.py`
- Modify: `pos_cash_move_reason/models/__init__.py`

- [ ] **Step 1: Create the model extension**

`pos_cash_move_reason/models/account_bank_statement_line.py`:

```python
from odoo import fields, models


class AccountBankStatementLine(models.Model):
    _inherit = 'account.bank.statement.line'

    pos_cash_move_reason_id = fields.Many2one(
        'pos.cash.move.reason',
        string='POS Cash Move Concept',
        index=True,
        ondelete='restrict',
        readonly=True,
        help='Concept button the cashier used in the POS cash in/out popup. Kept even when '
             'two concepts share the same account, so movements stay distinguishable.',
    )
    pos_counterpart_partner_id = fields.Many2one(
        'res.partner',
        string='POS Counterpart Contact',
        ondelete='restrict',
        readonly=True,
        help="Contact written on the counterpart journal item. Distinct from the statement "
             "line's partner, which POS uses for the cashier.",
    )
```

`ondelete='restrict'` is deliberate: it protects history. Concepts are archived, never deleted.

- [ ] **Step 2: Register the file**

Modify `pos_cash_move_reason/models/__init__.py` to:

```python
from . import pos_cash_move_reason
from . import pos_session
from . import account_bank_statement_line
```

- [ ] **Step 3: Upgrade and verify the fields exist**

Run: `odoo -c <conf> -d <db> -u pos_cash_move_reason --stop-after-init`
Expected: exits 0. The columns `pos_cash_move_reason_id` and `pos_counterpart_partner_id` are added to `account_bank_statement_line`.

- [ ] **Step 4: Commit**

```bash
git add pos_cash_move_reason/models/account_bank_statement_line.py pos_cash_move_reason/models/__init__.py
git commit -m "feat(pos_cash_move_reason): track concept and counterpart contact on statement lines"
```

---

### Task 6: Post the cash move against the concept's account

**Files:**
- Modify: `pos_cash_move_reason/models/pos_session.py`
- Modify: `pos_cash_move_reason/tests/test_cash_move_reason.py`

- [ ] **Step 1: Write the failing tests**

Add this helper to `TestCashMoveReason`, immediately after `_make_reason`:

```python
    def _cash_out(self, amount=100.0, label='motivo libre', extras=None):
        """Register a cash out the way the POS popup does, and return its statement line."""
        session = self.pos_session
        session.try_cash_in_out(
            'out',
            amount,
            label,
            self.env.user.partner_id.id,
            {'formattedAmount': '$100.00', 'translatedType': 'out', **(extras or {})},
        )
        return self.env['account.bank.statement.line'].search(
            [('pos_session_id', '=', session.id)], order='id desc', limit=1,
        )
```

Then append these three tests to the class:

```python
    def test_concept_with_account_posts_against_that_account(self):
        self.open_new_session()
        reason = self._make_reason(account_id=self.expense_account.id)

        st_line = self._cash_out(extras={'cash_move_reason_id': reason.id})

        _liquidity, suspense, other = st_line._seek_for_lines()
        self.assertFalse(suspense, 'the move must not touch the suspense account')
        self.assertEqual(other.account_id, self.expense_account)
        self.assertEqual(st_line.move_id.state, 'posted')
        self.assertEqual(st_line.pos_cash_move_reason_id, reason)

    def test_concept_without_account_falls_back_to_suspense(self):
        self.open_new_session()
        reason = self._make_reason(name='IMPUESTOS')

        st_line = self._cash_out(extras={'cash_move_reason_id': reason.id})

        _liquidity, suspense, _other = st_line._seek_for_lines()
        self.assertEqual(
            suspense.account_id,
            self.pos_session.cash_journal_id.suspense_account_id,
        )
        self.assertEqual(st_line.pos_cash_move_reason_id, reason)

    def test_cash_move_without_a_concept_is_unchanged(self):
        """Regression guard: the free-text flow must behave exactly as before."""
        self.open_new_session()

        st_line = self._cash_out()

        _liquidity, suspense, _other = st_line._seek_for_lines()
        self.assertEqual(
            suspense.account_id,
            self.pos_session.cash_journal_id.suspense_account_id,
        )
        self.assertFalse(st_line.pos_cash_move_reason_id)
        self.assertFalse(st_line.pos_counterpart_partner_id)
```

- [ ] **Step 2: Run the tests to verify the first two fail**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: FAIL — `test_concept_with_account_posts_against_that_account` reports a non-empty `suspense`, and `test_concept_without_account_falls_back_to_suspense` fails on `pos_cash_move_reason_id` being empty. `test_cash_move_without_a_concept_is_unchanged` already passes.

- [ ] **Step 3: Inject the counterpart account**

Replace the whole content of `pos_cash_move_reason/models/pos_session.py` with:

```python
from odoo import api, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config):
        return super()._load_pos_data_models(config) + ['pos.cash.move.reason']

    def _get_cash_move_reason(self, session, reason_id):
        """Re-read the concept from the database.

        `extras` is built in the browser, so nothing inside it is trusted: the
        account and the contact mode always come from the record, never from the
        payload. `config_ids` is deliberately NOT checked here — it is a UI filter,
        not a security boundary. The POS caches its data when the session opens, so
        unlinking a concept from a terminal mid-shift would otherwise block the
        cashier on a button that is still drawn on screen.
        """
        empty = self.env['pos.cash.move.reason']
        if not reason_id:
            return empty
        reason = empty.sudo().browse(int(reason_id)).exists()
        if not reason or not reason.active or reason.company_id != session.company_id:
            return empty
        return reason

    def _prepare_account_bank_statement_line_vals(self, session, sign, amount, reason, partner_id, extras):
        vals = super()._prepare_account_bank_statement_line_vals(
            session, sign, amount, reason, partner_id, extras,
        )
        extras = extras or {}
        cash_reason = self._get_cash_move_reason(session, extras.get('cash_move_reason_id'))
        if not cash_reason:
            return vals

        vals['pos_cash_move_reason_id'] = cash_reason.id
        if cash_reason.account_id:
            # Not a stored field: account.bank.statement.line.create() pops this key and
            # uses it in place of the journal's suspense account.
            vals['counterpart_account_id'] = cash_reason.account_id.id
        return vals
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: PASS — `6 tests`, `0 failed, 0 error(s)`.

- [ ] **Step 5: Commit**

```bash
git add pos_cash_move_reason/models/pos_session.py pos_cash_move_reason/tests/test_cash_move_reason.py
git commit -m "feat(pos_cash_move_reason): post cash moves against the concept account"
```

---

### Task 7: Write the contact on the counterpart journal item

**Files:**
- Modify: `pos_cash_move_reason/models/pos_session.py`
- Modify: `pos_cash_move_reason/models/account_bank_statement_line.py`
- Modify: `pos_cash_move_reason/tests/test_cash_move_reason.py`

- [ ] **Step 1: Write the failing tests**

Append these three tests to `TestCashMoveReason`:

```python
    def test_fixed_contact_lands_only_on_the_counterpart_line(self):
        self.open_new_session()
        reason = self._make_reason(
            account_id=self.expense_account.id,
            partner_mode='fixed',
            partner_id=self.supplier.id,
        )

        st_line = self._cash_out(extras={'cash_move_reason_id': reason.id})

        liquidity, _suspense, other = st_line._seek_for_lines()
        self.assertEqual(other.partner_id, self.supplier)
        self.assertEqual(liquidity.partner_id, self.env.user.partner_id,
                         'the cashier must stay on the cash line')
        self.assertEqual(st_line.partner_id, self.env.user.partner_id,
                         'the cashier must stay on the statement line')

    def test_ask_mode_takes_the_contact_from_the_payload(self):
        self.open_new_session()
        reason = self._make_reason(
            account_id=self.expense_account.id,
            partner_mode='ask',
        )

        st_line = self._cash_out(extras={
            'cash_move_reason_id': reason.id,
            'counterpart_partner_id': self.supplier.id,
        })

        _liquidity, _suspense, other = st_line._seek_for_lines()
        self.assertEqual(other.partner_id, self.supplier)

    def test_none_mode_ignores_an_injected_contact(self):
        """The payload comes from the browser; only 'ask' mode may supply a contact."""
        self.open_new_session()
        reason = self._make_reason(
            account_id=self.expense_account.id,
            partner_mode='none',
        )

        st_line = self._cash_out(extras={
            'cash_move_reason_id': reason.id,
            'counterpart_partner_id': self.supplier.id,
        })

        self.assertFalse(st_line.pos_counterpart_partner_id)
        _liquidity, _suspense, other = st_line._seek_for_lines()
        self.assertEqual(other.partner_id, self.env.user.partner_id)
```

- [ ] **Step 2: Run the tests to verify the first two fail**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: FAIL — `test_fixed_contact_lands_only_on_the_counterpart_line` and `test_ask_mode_takes_the_contact_from_the_payload` both report the cashier's partner where the supplier was expected. `test_none_mode_ignores_an_injected_contact` already passes.

- [ ] **Step 3: Resolve the contact server-side**

In `pos_cash_move_reason/models/pos_session.py`, replace the `return vals` at the end of `_prepare_account_bank_statement_line_vals` with:

```python
        counterpart_partner_id = False
        if cash_reason.partner_mode == 'fixed':
            counterpart_partner_id = cash_reason.partner_id.id
        elif cash_reason.partner_mode == 'ask':
            counterpart_partner_id = extras.get('counterpart_partner_id')
        if counterpart_partner_id:
            partner = self.env['res.partner'].sudo().browse(int(counterpart_partner_id)).exists()
            if partner:
                vals['pos_counterpart_partner_id'] = partner.id
        return vals
```

The method now ends with that block. `partner_mode == 'none'` never sets the key, so an injected contact is silently dropped.

- [ ] **Step 4: Write the contact onto the counterpart line**

In `pos_cash_move_reason/models/account_bank_statement_line.py`, add this method to the class, after the field definitions:

```python
    def _prepare_move_line_default_vals(self, counterpart_account_id=None):
        vals_list = super()._prepare_move_line_default_vals(counterpart_account_id)
        # vals_list[0] is the liquidity (cash) line, vals_list[1] the counterpart.
        # Core copies the statement line's partner to both, and in POS that partner is
        # the cashier. Overwriting only the counterpart keeps both traces: who took the
        # money out, and who it was paid to.
        if self.pos_counterpart_partner_id and len(vals_list) > 1:
            vals_list[1]['partner_id'] = self.pos_counterpart_partner_id.id
        return vals_list
```

This works because core creates the statement line before calling this method, so `self.pos_counterpart_partner_id` is already stored.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: PASS — `9 tests`, `0 failed, 0 error(s)`.

- [ ] **Step 6: Commit**

```bash
git add pos_cash_move_reason/models pos_cash_move_reason/tests
git commit -m "feat(pos_cash_move_reason): write the concept contact on the counterpart line"
```

---

### Task 8: Concept button grid in the cash move popup

**Files:**
- Create: `pos_cash_move_reason/static/src/app/cash_move_popup/cash_move_popup_patch.js`
- Create: `pos_cash_move_reason/static/src/app/cash_move_popup/cash_move_popup_patch.xml`
- Modify: `pos_cash_move_reason/__manifest__.py`

There is no automated test for this task — per the spec, no JS tour is written and the popup is verified by hand. The server-side behaviour it feeds is already covered by Tasks 6 and 7.

- [ ] **Step 1: Create the JS patch**

`pos_cash_move_reason/static/src/app/cash_move_popup/cash_move_popup_patch.js`:

```javascript
/** @odoo-module **/

import { CashMovePopup } from "@point_of_sale/app/components/popups/cash_move_popup/cash_move_popup";
import { patch } from "@web/core/utils/patch";

patch(CashMovePopup.prototype, {
    setup() {
        super.setup(...arguments);
        this.state.reasonId = null;
        this.state.counterpartPartnerId = null;
    },

    /**
     * Concepts available for the currently selected direction, ordered as configured.
     * @returns {Object[]}
     */
    get cashMoveReasons() {
        const type = this.state.type;
        return this.pos.models["pos.cash.move.reason"]
            .getAll()
            .filter((reason) => reason.move_type === type || reason.move_type === "both")
            .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
    },

    isReasonSelected(reason) {
        return this.state.reasonId === reason.id;
    },

    /**
     * Select a concept, or deselect it when it is tapped a second time.
     * Selecting prefills the reason textarea, which stays editable on purpose:
     * the concept fixes the accounting, the text is local detail.
     */
    selectCashMoveReason(reason) {
        if (this.state.reasonId === reason.id) {
            this.state.reasonId = null;
            this.state.counterpartPartnerId = null;
            return;
        }
        this.state.reasonId = reason.id;
        this.state.counterpartPartnerId = null;
        this.state.reason = reason.name;
    },

    /**
     * Switching between Cash In and Cash Out drops a concept that no longer applies.
     */
    onClickButton(type) {
        super.onClickButton(type);
        const selected =
            this.state.reasonId &&
            this.pos.models["pos.cash.move.reason"].get(this.state.reasonId);
        if (selected && selected.move_type !== "both" && selected.move_type !== type) {
            this.state.reasonId = null;
            this.state.counterpartPartnerId = null;
        }
    },
});
```

- [ ] **Step 2: Create the template patch**

`pos_cash_move_reason/static/src/app/cash_move_popup/cash_move_popup_patch.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">

    <!--
        Inserts the concept button grid just above the free-text reason field.
        The anchor is the native <div class="form-floating"> that wraps the textarea;
        the xpath must match that class verbatim or OWL fails to render the popup.
    -->
    <t t-inherit="point_of_sale.CashMovePopup" t-inherit-mode="extension" owl="1">
        <xpath expr="//div[@class='form-floating']" position="before">
            <div t-if="cashMoveReasons.length"
                 class="cash-move-reasons d-flex flex-wrap gap-1 mb-2 overflow-auto"
                 style="max-height: 8rem;">
                <button t-foreach="cashMoveReasons" t-as="reason" t-key="reason.id"
                        type="button"
                        t-on-click="() => this.selectCashMoveReason(reason)"
                        t-attf-class="btn btn-sm #{isReasonSelected(reason) ? 'btn-primary' : 'btn-outline-secondary'}">
                    <t t-esc="reason.name"/>
                </button>
            </div>
        </xpath>
    </t>

</templates>
```

- [ ] **Step 3: Register the assets**

In `pos_cash_move_reason/__manifest__.py`, add an `assets` key immediately after the `data` key:

```python
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_cash_move_reason/static/src/app/**/*',
        ],
    },
```

- [ ] **Step 4: Upgrade and verify by hand**

Run: `odoo -c <conf> -d <db> -u pos_cash_move_reason --stop-after-init`

Then, in the backend, create three concepts: `PROVEEDORES` (Cash Out, account = any expense account), `VENTAS_EN_EFECTIVO` (Cash In, no account), `CAJA` (Both, no account). Open the POS, open the cash in/out popup from the hamburger menu and confirm:

1. With **Cash Out** selected, `PROVEEDORES` and `CAJA` are shown, `VENTAS_EN_EFECTIVO` is not.
2. Clicking **Cash In** swaps the grid to `VENTAS_EN_EFECTIVO` and `CAJA`.
3. Tapping `PROVEEDORES` highlights it and fills the reason textarea with `PROVEEDORES`.
4. Typing extra text after it does not clear the highlight.
5. Tapping it again clears the highlight.
6. Selecting `PROVEEDORES` and then switching to Cash In clears the highlight.
7. The browser console shows no errors.

- [ ] **Step 5: Commit**

```bash
git add pos_cash_move_reason/static pos_cash_move_reason/__manifest__.py
git commit -m "feat(pos_cash_move_reason): add the concept button grid to the cash move popup"
```

---

### Task 9: Ask for a contact and send the concept to the server

**Files:**
- Modify: `pos_cash_move_reason/static/src/app/cash_move_popup/cash_move_popup_patch.js`

- [ ] **Step 1: Add the imports**

In `pos_cash_move_reason/static/src/app/cash_move_popup/cash_move_popup_patch.js`, replace the import block at the top with:

```javascript
/** @odoo-module **/

import { CashMovePopup } from "@point_of_sale/app/components/popups/cash_move_popup/cash_move_popup";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";
```

- [ ] **Step 2: Make the selection ask for a contact**

Replace the whole `selectCashMoveReason` method with this async version:

```javascript
    /**
     * Select a concept, or deselect it when it is tapped a second time.
     * Selecting prefills the reason textarea, which stays editable on purpose:
     * the concept fixes the accounting, the text is local detail.
     * In "ask" mode the cashier picks the contact right away; cancelling the
     * picker keeps the concept but leaves the contact empty.
     */
    async selectCashMoveReason(reason) {
        if (this.state.reasonId === reason.id) {
            this.state.reasonId = null;
            this.state.counterpartPartnerId = null;
            return;
        }
        this.state.reasonId = reason.id;
        this.state.counterpartPartnerId = null;
        this.state.reason = reason.name;

        if (reason.partner_mode === "ask") {
            const partner = await makeAwaitable(this.dialog, PartnerList);
            if (partner) {
                this.state.counterpartPartnerId = partner.id;
                this.state.reason = `${reason.name} — ${partner.name}`;
            }
        }
    },
```

- [ ] **Step 3: Send the concept in the payload**

Add this method to the same patch, after `onClickButton`:

```javascript
    /**
     * `extras` is the sixth positional argument of try_cash_in_out and is a free-form
     * dict, so the concept rides along without changing the core signature. The fifth
     * argument stays the cashier's partner, untouched.
     */
    _prepareTryCashInOutPayload(type, amount, reason, partnerId, extras) {
        const payload = super._prepareTryCashInOutPayload(
            type,
            amount,
            reason,
            partnerId,
            extras
        );
        Object.assign(payload[5], {
            cash_move_reason_id: this.state.reasonId,
            counterpart_partner_id: this.state.counterpartPartnerId,
        });
        return payload;
    },
```

- [ ] **Step 4: Upgrade and verify the whole flow by hand**

Run: `odoo -c <conf> -d <db> -u pos_cash_move_reason --stop-after-init`

In the backend, set `PROVEEDORES` to Contact Mode = "Ask the cashier". Create a fourth concept `SUELDO` (Cash Out, an expense account, Contact Mode = "Fixed contact", pick any contact). Then in the POS:

1. Open the cash in/out popup, tap `PROVEEDORES` → the customer list opens. Pick a contact → the reason reads `PROVEEDORES — <contact>`.
2. Enter `150` and confirm. The receipt prints with that reason.
3. In the backend, open **Accounting → Journal Entries** and find the entry for that movement. Confirm: the cash line carries the cashier's contact, the counterpart line carries the chosen contact and the configured account, the entry is **Posted**, and no line sits in the suspense account.
4. Repeat with `SUELDO` → no picker opens, and the counterpart line carries the configured contact.
5. Repeat with a concept that has no account → the counterpart line sits in the suspense account, exactly as before this module existed.
6. Do one movement with no concept at all, typing the reason by hand → identical to step 5.

- [ ] **Step 5: Run the full suite one more time**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_cash_move_reason --stop-after-init -u pos_cash_move_reason`
Expected: PASS — `9 tests`, `0 failed, 0 error(s)`.

- [ ] **Step 6: Commit**

```bash
git add pos_cash_move_reason/static
git commit -m "feat(pos_cash_move_reason): pick the contact and send the concept to the server"
```

---

### Task 10: README and repository index

**Files:**
- Create: `pos_cash_move_reason/README.md`
- Modify: `README.md`

- [ ] **Step 1: Write the module README**

`pos_cash_move_reason/README.md`:

```markdown
# POS Cash Move Reason

Configurable concept buttons for the POS cash in/out popup, in the spirit of the
reconciliation model buttons of the bank reconciliation widget.

## Why

By default a POS cash in/out records a free-text reason and posts its counterpart to
the cash journal's **suspense account**, waiting for someone to reconcile it later in
the backend. That costs manual work and produces ten spellings of the same concept.

With this module the cashier taps a button — `PROVEEDORES`, `RETIRO_CHACRAS`,
`SUELDO` — and the journal entry is posted straight against the configured account,
already imputed.

## Configuration

**Point of Sale → Configuration → Cash Move Concepts**

| Field | Meaning |
|---|---|
| Concept | Button label |
| Applies To | Cash In, Cash Out, or Both |
| Counterpart Account | Account to post against. **Leave empty** to keep the standard suspense-account behaviour |
| Contact Mode | No contact / Fixed contact / Ask the cashier |
| Points of Sale | Terminals that show the button. **Leave empty for all terminals** |

## Behaviour

- The free-text reason field keeps working exactly as before. Concepts are shortcuts,
  never mandatory.
- Selecting a concept prefills the reason and leaves it editable, so the cashier can
  add detail: `PROVEEDORES — Distribuidora López, factura 0001-00034`.
- The statement line's contact stays the **cashier**; the concept's contact is written
  on the **counterpart journal item**, where the aged-payable reports read it.
- A concept without an account only supplies the label, and the movement lands in the
  suspense account as usual — useful to roll out the catalogue before every account
  has been decided.

## Notes

Concepts are archived, never deleted: statement lines reference them with
`ondelete='restrict'` to protect history.

The Points of Sale scoping is a **UI filter, not a security boundary**. The POS caches
its data when the session opens, so a concept unlinked from a terminal mid-shift still
works until the session is reopened — by design, so a configuration change never blocks
a cashier.
```

- [ ] **Step 2: Add the module to the repository index**

In the root `README.md`, add this line to the **💳 Payment & Finance** list, after the `POS Payment Card Details` entry:

```markdown
- **[POS Cash Move Reason](./pos_cash_move_reason/README.md)**: Configurable concept buttons for cash in/out, posting each movement against a preset counterpart account.
```

- [ ] **Step 3: Commit**

```bash
git add pos_cash_move_reason/README.md README.md
git commit -m "docs(pos_cash_move_reason): add module README and index entry"
```

---

## Out of scope — do not build these

Recorded so they are not mistaken for oversights. All were decided during design:

- **Concept buttons in the closing popup.** Same model, later stage.
- **A "concept mandatory" flag.** The free-text flow stays unrestricted.
- **Default amounts on concepts.** The cashier always types the amount.
- **Analytic distribution.** Per-branch cases are handled with one account and one
  concept per branch, scoped through `config_ids`.
- **Supervisor PIN per concept.**
- **Grouping cash moves by concept in the closing report.** It lives in
  `pos_retail_cash_closure_reports` and would add a dependency that module lacks today.
- **Preloaded concept data.** Account codes belong to the customer's chart of accounts.
