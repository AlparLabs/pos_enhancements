# PR B — `pos_mercado_pago_reconciliation` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Mercado Pago settlement fetch (net amount, fees, release date) as a separate, sellable add-on that runs from a scheduled job instead of the POS session close, on a provider-neutral schema.

**Architecture:** One module, two model files. `models/pos_payment.py` holds the neutral fields and the generic orchestration and knows nothing about Mercado Pago; `models/pos_payment_mercado_pago.py` holds the API calls and knows nothing about crons. That split is the seam for a future multi-provider base module.

**Tech Stack:** Odoo 19.0, `pos_mercado_pago_alpy` (dependency), `unittest.mock` for the HTTP boundary.

**Spec:** [docs/superpowers/specs/2026-08-25-mp-split-reconciliation-design.md](../specs/2026-08-25-mp-split-reconciliation-design.md) — this plan covers **PR B only**. PR A (removing the feature from `pos_mercado_pago_alpy`) has its own plan and is already open as a separate PR.

---

## Background you need before starting

This module restores a feature that PR A removes from `pos_mercado_pago_alpy`. The old implementation ran inside `pos.session.action_pos_session_closing_control()`, issuing one to two serial HTTP calls per payment before the closing entries were created — 15–30 seconds on a 50-payment close, and up to 1000 seconds when the API was slow. Here it runs from an `ir.cron`, off the closing path.

**Two defects of the old code are fixed here, deliberately:**

1. **The freeze.** The old `mp_info_fetched` boolean was set to `True` as soon as a payment *resolved*, without checking the data was complete. A payment approved but not yet accredited was stored with a zero net amount and no release date, marked done, and never retried. Here, `settlement_state` only becomes `settled` when a release date came back; otherwise it stays `pending` and the cron returns for it.
2. **No retry path.** The old docstring claimed the method was idempotent "so it can be re-run manually or by a cron" — but no cron existed. Now one does.

**Where PR B branches from.** This branch is cut from `19.0`, which still contains the old `mp_*` fields because PR A has not merged. That is fine and intentional: the new fields are named `settlement_*` and cannot collide. But **do not** reference, reuse or migrate the old `mp_*` reconciliation fields — they are PR A's to delete, and historical data is being discarded on purpose.

### Facts already verified against the Odoo 19 source

Do not re-derive these; they were checked in `C:\Users\Santiago\OneDrive\Desktop\Enterprise\odoo-19.0\`:

- `pos.payment.payment_date` is a required `Datetime` (`addons/point_of_sale/models/pos_payment.py:24`). The cron's date window filters on it.
- `pos.payment.method.use_payment_terminal` is a `Selection` (`addons/point_of_sale/models/pos_payment_method.py:55`).
- **`ir.cron` has no `numbercall` field in Odoo 19.** The model declares `active`, `interval_number`, `interval_type`, `nextcall`, `priority`, `failure_count` (`odoo/addons/base/models/ir_cron.py:111-122`). Declaring `numbercall` raises `ParseError` on install. A cron without it repeats indefinitely, which is what we want.
- `interval_type` accepts `minutes` / `hours` / `days` / `weeks` / `months`.
- The `ir.cron` XML shape to copy is `addons/account/data/service_cron.xml`: `name`, `model_id` (ref), `state` = `code`, `code`, `interval_number`, `interval_type`.

### Facts verified in `pos_mercado_pago_alpy`

- `MP_TERMINAL_TYPES = ('mercado_pago_alpy', 'mercado_pago_qr_local', 'mercado_pago_qr_screen', 'mercado_pago_qr_hybrid')`, defined in `models/pos_payment_method.py`.
- `mp_bearer_token` carries `groups="point_of_sale.group_pos_manager"`, so it **must** be read through `sudo()`.
- `MercadoPagoPosRequest.call_mercado_pago(method, endpoint, payload, idempotency_key=None)` returns parsed JSON, and on any network or decode failure returns `{'errorMessage': ...}` instead of raising.
- The payment method model has **no** `@api.constrains` or `@api.onchange`, so tests can set `use_payment_terminal` and `mp_bearer_token` with a plain `write()`.

### Running things

There is **no runnable Odoo** in the authoring environment (PostgreSQL stopped, `psycopg2` absent). Write the tests in TDD order anyway; the "run it" steps are **DEFERRED** to the user.

Static checks available:
- `C:\Python314\python.exe -m py_compile <file.py>`
- `C:\Python314\python.exe -c "from lxml import etree; etree.parse(r'<file.xml>'); print('XML OK')"`

The user runs, later:
- `odoo -c <conf> -d <db> -i pos_mercado_pago_reconciliation --test-enable --test-tags /pos_mercado_pago_reconciliation --stop-after-init`

Delete any `__pycache__` produced by `py_compile`.

---

## File Structure

```
pos_mercado_pago_reconciliation/
├── __init__.py
├── __manifest__.py
├── README.md
├── data/ir_cron.xml
├── models/
│   ├── __init__.py
│   ├── pos_payment.py                # neutral fields + generic orchestration
│   └── pos_payment_mercado_pago.py   # the Mercado Pago fetcher
├── views/pos_payment_views.xml
└── tests/
    ├── __init__.py
    └── test_settlement.py
```

The two model files both `_inherit = 'pos.payment'`. Keeping them apart is the whole point: `pos_payment.py` must never import anything from `pos_mercado_pago_alpy`, and `pos_payment_mercado_pago.py` must never mention the cron. When a second processor arrives, the first file moves down into a base module untouched.

---

### Task 1: Installable skeleton with the neutral schema

**Files:**
- Create: `pos_mercado_pago_reconciliation/__init__.py`
- Create: `pos_mercado_pago_reconciliation/__manifest__.py`
- Create: `pos_mercado_pago_reconciliation/models/__init__.py`
- Create: `pos_mercado_pago_reconciliation/models/pos_payment.py`

- [ ] **Step 1: Package files**

`pos_mercado_pago_reconciliation/__init__.py`:

```python
from . import models
```

`pos_mercado_pago_reconciliation/models/__init__.py`:

```python
from . import pos_payment
```

- [ ] **Step 2: Manifest**

`pos_mercado_pago_reconciliation/__manifest__.py`:

```python
{
    'name': 'POS Mercado Pago Reconciliation',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Fetch net amount, fees and release date for Mercado Pago POS payments.',
    'description': """
Adds bank-reconciliation data to Mercado Pago payments taken in the Point of Sale.

For every payment it retrieves, from the Mercado Pago API, the net amount actually
credited, the fees charged, and the date the money is released. A scheduled job does
the fetching, so nothing is added to the POS session closing path.

Payments whose settlement is not final yet stay pending and are picked up again on a
later run, instead of being frozen with incomplete figures.

The stored schema is processor-neutral, so support for another payment processor can be
added later without touching the data or the existing records.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['pos_mercado_pago_alpy'],
    'data': [],
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

`data` is an empty list for now; Tasks 4 and 5 fill it.

- [ ] **Step 3: The neutral schema**

`pos_mercado_pago_reconciliation/models/pos_payment.py`:

```python
import logging

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    settlement_net_amount = fields.Float(
        string='Settled Net Amount',
        readonly=True,
        help='Amount actually credited by the payment processor, gross minus fees.',
    )
    settlement_fee_amount = fields.Float(
        string='Settlement Fees',
        readonly=True,
        help='Total fees charged by the payment processor for this payment.',
    )
    settlement_release_date = fields.Datetime(
        string='Money Release Date',
        readonly=True,
        help='Date the processor releases the money to the account.',
    )
    settlement_status = fields.Char(
        string='Settlement Status',
        readonly=True,
        help="The processor's own status for this payment, stored verbatim.",
    )
    settlement_state = fields.Selection(
        [('pending', 'Pending'), ('settled', 'Settled')],
        string='Settlement',
        readonly=True,
        index=True,
        help='Pending means the processor has not given final figures yet, so the '
             'scheduled job will try again. Empty means this payment is not settled '
             'through any supported processor.',
    )
```

`settlement_state` has **no default on purpose**. It stays empty on every `pos.payment` — cash, customer account, everything — and only the fetcher writes it. Defaulting to `pending` would mark the entire payment history of the POS as awaiting reconciliation, which is false and would poison any report built on the field.

- [ ] **Step 4: Verify**

Run: `C:\Python314\python.exe -m py_compile pos_mercado_pago_reconciliation/__manifest__.py pos_mercado_pago_reconciliation/models/pos_payment.py pos_mercado_pago_reconciliation/models/__init__.py pos_mercado_pago_reconciliation/__init__.py`
Expected: no output, exit 0.

Install verification is DEFERRED (no runnable Odoo).

- [ ] **Step 5: Commit**

```bash
git add pos_mercado_pago_reconciliation
git commit -m "feat(pos_mercado_pago_reconciliation): add the neutral settlement schema"
```

---

### Task 2: Generic orchestration and the cron entry point

Everything in this task is processor-agnostic. It must not import from `pos_mercado_pago_alpy` or mention Mercado Pago.

**Files:**
- Create: `pos_mercado_pago_reconciliation/tests/__init__.py`
- Create: `pos_mercado_pago_reconciliation/tests/test_settlement.py`
- Modify: `pos_mercado_pago_reconciliation/models/pos_payment.py`

- [ ] **Step 1: Write the failing tests**

`pos_mercado_pago_reconciliation/tests/__init__.py`:

```python
from . import test_settlement
```

`pos_mercado_pago_reconciliation/tests/test_settlement.py`:

```python
from datetime import timedelta
from unittest.mock import patch

from odoo import fields
from odoo.addons.point_of_sale.tests.common import TestPoSCommon
from odoo.tests import tagged

FETCH_VALUES = ('odoo.addons.pos_mercado_pago_reconciliation.models'
                '.pos_payment.PosPayment._settlement_fetch_values')


@tagged('post_install', '-at_install')
class TestSettlement(TestPoSCommon):
    """Settlement enrichment of POS payments."""

    def setUp(self):
        super().setUp()
        self.config = self.basic_config
        self.product = self.create_product('Producto', self.categ_basic, 100.0)
        self.mp_method = self.bank_pm1
        self.mp_method.write({
            'use_payment_terminal': 'mercado_pago_alpy',
            'mp_bearer_token': 'test-token',
        })

    def _make_payment(self, uuid='settlement-test'):
        """Create one paid order and return its pos.payment."""
        self.open_new_session()
        orders = self._create_orders([{
            'pos_order_lines_ui_args': [(self.product, 1)],
            'payments': [(self.mp_method, 100.0)],
            'uuid': uuid,
        }])
        return orders[uuid].payment_ids

    def test_complete_values_settle_the_payment(self):
        payment = self._make_payment()
        values = {
            'settlement_net_amount': 93.5,
            'settlement_fee_amount': 6.5,
            'settlement_status': 'accredited',
            'settlement_release_date': fields.Datetime.now(),
        }

        with patch(FETCH_VALUES, return_value=values):
            payment._settlement_fetch()

        self.assertEqual(payment.settlement_state, 'settled')
        self.assertEqual(payment.settlement_net_amount, 93.5)
        self.assertEqual(payment.settlement_fee_amount, 6.5)

    def test_values_without_a_release_date_stay_pending(self):
        """The old code froze these forever; the cron must come back for them."""
        payment = self._make_payment()
        values = {
            'settlement_net_amount': 0.0,
            'settlement_fee_amount': 0.0,
            'settlement_status': 'pending_contingency',
            'settlement_release_date': False,
        }

        with patch(FETCH_VALUES, return_value=values):
            payment._settlement_fetch()

        self.assertEqual(payment.settlement_state, 'pending')
        self.assertEqual(payment.settlement_status, 'pending_contingency')

    def test_a_provider_that_returns_nothing_writes_nothing(self):
        payment = self._make_payment()

        with patch(FETCH_VALUES, return_value=None):
            payment._settlement_fetch()

        self.assertFalse(payment.settlement_state)
        self.assertFalse(payment.settlement_status)

    def test_a_raising_provider_does_not_break_the_sweep(self):
        payment = self._make_payment()

        with patch(FETCH_VALUES, side_effect=ValueError('boom')):
            payment._settlement_fetch()

        self.assertFalse(payment.settlement_state)

    def test_the_pending_domain_excludes_settled_and_old_payments(self):
        payment = self._make_payment()
        domain = self.env['pos.payment']._settlement_pending_domain()
        self.assertIn(payment, self.env['pos.payment'].search(domain))

        payment.settlement_state = 'settled'
        self.assertNotIn(payment, self.env['pos.payment'].search(domain))

        payment.settlement_state = 'pending'
        payment.payment_date = fields.Datetime.now() - timedelta(days=400)
        self.assertNotIn(payment, self.env['pos.payment'].search(domain))
```

- [ ] **Step 2: Run the tests to verify they fail**

DEFERRED. Expected when the user runs them: every test errors with `AttributeError` on `_settlement_fetch` / `_settlement_pending_domain`.

- [ ] **Step 3: Write the orchestration**

Append to `pos_mercado_pago_reconciliation/models/pos_payment.py`. First extend the imports at the top of the file so they read:

```python
import logging
from datetime import timedelta

from odoo import api, fields, models

_logger = logging.getLogger(__name__)

# How far back the scheduled job looks. A payment that never settles is abandoned
# rather than retried forever -- it simply stays 'pending', which is searchable.
SETTLEMENT_LOOKBACK_DAYS = 30
# Payments handled per run, so the first run on an existing database does not fire
# thousands of serial HTTP calls.
SETTLEMENT_BATCH_SIZE = 200
# Commit every N payments: a run that dies partway must not throw away the calls it
# already paid for.
SETTLEMENT_COMMIT_EVERY = 20
```

Then add these four methods to the `PosPayment` class, after the fields:

```python
    @api.model
    def _settlement_pending_domain(self):
        """Which payments the scheduled job should sweep.

        This is the processor-agnostic half: not settled yet, and recent enough to
        be worth asking about. Each processor's module extends it with its own
        payment-method filter -- without that extension this would sweep every
        payment in the POS, cash included.
        """
        horizon = fields.Datetime.now() - timedelta(days=SETTLEMENT_LOOKBACK_DAYS)
        return [
            ('settlement_state', '!=', 'settled'),
            ('payment_date', '>=', horizon),
        ]

    def _settlement_fetch_values(self):
        """Provider hook: return a dict of settlement values, or None.

        The base implementation knows no processor and always declines. Each
        processor's module overrides this. Returning None means "could not resolve
        right now" and leaves the payment untouched for a later run.
        """
        self.ensure_one()
        return None

    def _settlement_fetch(self):
        """Ask each payment's processor for its settlement values and store them.

        A payment is only marked 'settled' once a release date came back. Anything
        less stays 'pending' so a later run tries again -- this is what stops a
        payment that was approved but not yet accredited from being frozen with
        incomplete figures.

        Nothing raises out of here: one bad payment must not abort the sweep.
        """
        for payment in self:
            try:
                values = payment._settlement_fetch_values()
            except Exception:
                _logger.exception(
                    "Settlement: provider failed for pos.payment %s", payment.id)
                continue
            if not values:
                continue
            values = dict(values)
            values['settlement_state'] = (
                'settled' if values.get('settlement_release_date') else 'pending')
            payment.write(values)

    @api.model
    def _cron_fetch_settlements(self):
        """Entry point for the scheduled job."""
        payments = self.search(
            self._settlement_pending_domain(),
            limit=SETTLEMENT_BATCH_SIZE,
            order='payment_date asc, id asc',
        )
        if not payments:
            return
        _logger.info("Settlement: sweeping %s payment(s)", len(payments))
        for index, payment in enumerate(payments, start=1):
            payment._settlement_fetch()
            if index % SETTLEMENT_COMMIT_EVERY == 0:
                self.env.cr.commit()
        self.env.cr.commit()
```

- [ ] **Step 4: Run the tests to verify they pass**

DEFERRED. Expected when the user runs them: 5 tests, 0 failed, 0 errors.

- [ ] **Step 5: Verify statically**

Run: `C:\Python314\python.exe -m py_compile pos_mercado_pago_reconciliation/models/pos_payment.py pos_mercado_pago_reconciliation/tests/test_settlement.py`
Expected: no output, exit 0.

Run: `grep -rn "mercado\|Mercado\|mp_" pos_mercado_pago_reconciliation/models/pos_payment.py`
Expected: **no matches.** This file must stay processor-agnostic; a match means the seam has already leaked.

- [ ] **Step 6: Commit**

```bash
git add pos_mercado_pago_reconciliation/models/pos_payment.py pos_mercado_pago_reconciliation/tests
git commit -m "feat(pos_mercado_pago_reconciliation): add the generic settlement sweep"
```

---

### Task 3: The Mercado Pago fetcher

**Files:**
- Create: `pos_mercado_pago_reconciliation/models/pos_payment_mercado_pago.py`
- Modify: `pos_mercado_pago_reconciliation/models/__init__.py`
- Modify: `pos_mercado_pago_reconciliation/tests/test_settlement.py`

- [ ] **Step 1: Write the failing tests**

Add this constant next to the existing `FETCH_VALUES` at the top of `tests/test_settlement.py`:

```python
CALL_MP = ('odoo.addons.pos_mercado_pago_alpy.models'
           '.mercado_pago_post_request.MercadoPagoPosRequest.call_mercado_pago')
```

Then append these tests to the `TestSettlement` class:

```python
    def test_mercado_pago_payment_is_resolved_by_id(self):
        payment = self._make_payment()
        payment.mp_payment_id = '123456789'
        response = {
            'id': 123456789,
            'status': 'approved',
            'status_detail': 'accredited',
            'transaction_details': {'net_received_amount': 93.5},
            'fee_details': [{'amount': 5.0}, {'amount': 1.5}],
            'money_release_date': '2026-08-20T10:00:00.000-03:00',
        }

        with patch(CALL_MP, return_value=response) as call:
            payment._settlement_fetch()

        self.assertEqual(payment.settlement_state, 'settled')
        self.assertEqual(payment.settlement_net_amount, 93.5)
        self.assertEqual(payment.settlement_fee_amount, 6.5)
        self.assertEqual(payment.settlement_status, 'accredited')
        self.assertTrue(payment.settlement_release_date)
        self.assertEqual(call.call_count, 1, 'a numeric id must not need the search fallback')

    def test_mercado_pago_falls_back_to_search(self):
        payment = self._make_payment()
        payment.write({'mp_payment_id': False, 'mp_external_reference': 'ref-abc'})
        search_response = {'results': [{
            'id': 987654321,
            'status': 'approved',
            'status_detail': 'accredited',
            'transaction_details': {'net_received_amount': 50.0},
            'fee_details': [{'amount': 2.0}],
            'money_release_date': '2026-08-20T10:00:00.000-03:00',
        }]}

        with patch(CALL_MP, return_value=search_response):
            payment._settlement_fetch()

        self.assertEqual(payment.settlement_state, 'settled')
        self.assertEqual(payment.settlement_net_amount, 50.0)

    def test_mercado_pago_network_error_leaves_the_payment_alone(self):
        payment = self._make_payment()
        payment.mp_payment_id = '123456789'

        with patch(CALL_MP, return_value={'errorMessage': 'timeout'}):
            payment._settlement_fetch()

        self.assertFalse(payment.settlement_state)
        self.assertFalse(payment.settlement_net_amount)

    def test_a_payment_without_a_token_is_skipped(self):
        payment = self._make_payment()
        payment.mp_payment_id = '123456789'
        self.mp_method.mp_bearer_token = False

        with patch(CALL_MP) as call:
            payment._settlement_fetch()

        call.assert_not_called()
        self.assertFalse(payment.settlement_state)

    def test_a_non_mercado_pago_payment_is_ignored(self):
        self.open_new_session()
        orders = self._create_orders([{
            'pos_order_lines_ui_args': [(self.product, 1)],
            'payments': [(self.cash_pm1, 100.0)],
            'uuid': 'cash-order',
        }])
        payment = orders['cash-order'].payment_ids

        with patch(CALL_MP) as call:
            payment._settlement_fetch()

        call.assert_not_called()
        self.assertFalse(payment.settlement_state)

    def test_the_pending_domain_only_covers_mercado_pago(self):
        self.open_new_session()
        orders = self._create_orders([{
            'pos_order_lines_ui_args': [(self.product, 1)],
            'payments': [(self.cash_pm1, 100.0)],
            'uuid': 'cash-order-domain',
        }])
        cash_payment = orders['cash-order-domain'].payment_ids

        domain = self.env['pos.payment']._settlement_pending_domain()
        self.assertNotIn(cash_payment, self.env['pos.payment'].search(domain))
```

- [ ] **Step 2: Run the tests to verify they fail**

DEFERRED. Expected when the user runs them: the settlement fields stay empty because no Mercado Pago fetcher exists yet, and `test_the_pending_domain_only_covers_mercado_pago` fails because the base domain still matches cash payments.

- [ ] **Step 3: Write the fetcher**

`pos_mercado_pago_reconciliation/models/pos_payment_mercado_pago.py`:

```python
import logging
from datetime import timezone

from dateutil import parser as dateutil_parser

from odoo import api, models

from odoo.addons.pos_mercado_pago_alpy.models.mercado_pago_post_request import (
    MercadoPagoPosRequest,
)
from odoo.addons.pos_mercado_pago_alpy.models.pos_payment_method import (
    MP_TERMINAL_TYPES,
)

_logger = logging.getLogger(__name__)


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    @api.model
    def _settlement_pending_domain(self):
        """Narrow the generic sweep to payments this processor can answer for."""
        return super()._settlement_pending_domain() + [
            ('payment_method_id.use_payment_terminal', 'in', list(MP_TERMINAL_TYPES)),
        ]

    def _settlement_fetch_values(self):
        self.ensure_one()
        method = self.payment_method_id
        if method.use_payment_terminal not in MP_TERMINAL_TYPES:
            return super()._settlement_fetch_values()

        # mp_bearer_token is restricted to group_pos_manager, so it needs sudo().
        token = method.sudo().mp_bearer_token
        if not token:
            _logger.warning(
                "Settlement: no Mercado Pago token on payment method %s", method.id)
            return None

        response = self._mp_resolve_payment(MercadoPagoPosRequest(token))
        if not response:
            return None

        transaction_details = response.get('transaction_details') or {}
        fee_total = sum(
            fee.get('amount') or 0.0 for fee in (response.get('fee_details') or []))
        return {
            'settlement_net_amount': transaction_details.get('net_received_amount') or 0.0,
            'settlement_fee_amount': fee_total,
            'settlement_status': response.get('status_detail') or '',
            'settlement_release_date': self._mp_parse_release_date(
                response.get('money_release_date')),
        }

    def _mp_resolve_payment(self, mercado_pago):
        """Find this payment on Mercado Pago, by id first and by reference second.

        The Orders API can hand back an alphanumeric payment id, which the
        /v1/payments/{id} endpoint does not accept -- hence the search fallback.
        call_mercado_pago never raises; it returns {'errorMessage': ...}, which has
        no 'id' and therefore falls through.
        """
        self.ensure_one()
        if self.mp_payment_id and self.mp_payment_id.isdigit():
            response = mercado_pago.call_mercado_pago(
                "get", f"/v1/payments/{self.mp_payment_id}", {})
            if response.get('id'):
                return response

        if self.mp_external_reference:
            search = mercado_pago.call_mercado_pago("get", "/v1/payments/search", {
                'external_reference': self.mp_external_reference,
                'sort': 'date_created',
                'criteria': 'desc',
            })
            results = search.get('results') or []
            response = next(
                (r for r in results if r.get('status') == 'approved'),
                results[0] if results else None,
            )
            if response and response.get('id'):
                return response

        _logger.warning(
            "Settlement: could not resolve pos.payment %s on Mercado Pago "
            "(mp_payment_id=%s, external_reference=%s)",
            self.id, self.mp_payment_id, self.mp_external_reference)
        return None

    @api.model
    def _mp_parse_release_date(self, raw):
        """Parse money_release_date into a naive UTC datetime, or False."""
        if not raw:
            return False
        try:
            parsed = dateutil_parser.isoparse(raw)
        except (ValueError, OverflowError):
            _logger.warning("Settlement: unparseable money_release_date %r", raw)
            return False
        if parsed.tzinfo:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
```

Modify `pos_mercado_pago_reconciliation/models/__init__.py` to:

```python
from . import pos_payment
from . import pos_payment_mercado_pago
```

Order matters: `pos_payment` defines the base methods that `pos_payment_mercado_pago` calls through `super()`.

- [ ] **Step 4: Run the tests to verify they pass**

DEFERRED. Expected when the user runs them: 11 tests, 0 failed, 0 errors.

- [ ] **Step 5: Verify statically**

Run: `C:\Python314\python.exe -m py_compile pos_mercado_pago_reconciliation/models/pos_payment_mercado_pago.py pos_mercado_pago_reconciliation/tests/test_settlement.py`
Expected: no output, exit 0.

Run: `grep -n "cron\|LOOKBACK\|BATCH" pos_mercado_pago_reconciliation/models/pos_payment_mercado_pago.py`
Expected: **no matches.** This file must know nothing about scheduling.

- [ ] **Step 6: Commit**

```bash
git add pos_mercado_pago_reconciliation/models pos_mercado_pago_reconciliation/tests
git commit -m "feat(pos_mercado_pago_reconciliation): add the Mercado Pago fetcher"
```

---

### Task 4: The scheduled job

**Files:**
- Create: `pos_mercado_pago_reconciliation/data/ir_cron.xml`
- Modify: `pos_mercado_pago_reconciliation/__manifest__.py`

- [ ] **Step 1: The cron record**

`pos_mercado_pago_reconciliation/data/ir_cron.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <!--
        Runs hourly. There is deliberately no numbercall field: it was removed from
        ir.cron in Odoo 19, and a cron without it already repeats indefinitely.
    -->
    <record id="ir_cron_fetch_settlements" model="ir.cron">
        <field name="name">POS: fetch Mercado Pago settlement data</field>
        <field name="model_id" ref="point_of_sale.model_pos_payment"/>
        <field name="state">code</field>
        <field name="code">model._cron_fetch_settlements()</field>
        <field name="interval_number">1</field>
        <field name="interval_type">hours</field>
        <field name="user_id" ref="base.user_root"/>
    </record>
</odoo>
```

- [ ] **Step 2: Register it**

In `pos_mercado_pago_reconciliation/__manifest__.py`, change the `data` key to:

```python
    'data': [
        'data/ir_cron.xml',
    ],
```

- [ ] **Step 3: Verify**

Run: `C:\Python314\python.exe -c "from lxml import etree; etree.parse(r'pos_mercado_pago_reconciliation/data/ir_cron.xml'); print('XML OK')"`
Expected: `XML OK`.

Run: `grep -n "numbercall" pos_mercado_pago_reconciliation/data/ir_cron.xml`
Expected: **no match outside the comment.** The field does not exist in Odoo 19 and would raise `ParseError`.

Confirm the `model_id` ref: `pos.payment` lives in `point_of_sale`, so the xmlid is `point_of_sale.model_pos_payment`.

- [ ] **Step 4: Commit**

```bash
git add pos_mercado_pago_reconciliation/data pos_mercado_pago_reconciliation/__manifest__.py
git commit -m "feat(pos_mercado_pago_reconciliation): sweep settlements hourly from a cron"
```

---

### Task 5: Show the data in the backend

**Files:**
- Create: `pos_mercado_pago_reconciliation/views/pos_payment_views.xml`
- Modify: `pos_mercado_pago_reconciliation/__manifest__.py`

- [ ] **Step 1: The views**

`pos_mercado_pago_reconciliation/views/pos_payment_views.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="view_pos_payment_tree_settlement" model="ir.ui.view">
        <field name="name">pos.payment.tree.settlement</field>
        <field name="model">pos.payment</field>
        <field name="inherit_id" ref="point_of_sale.view_pos_payment_tree"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='payment_method_id']" position="after">
                <field name="settlement_state" optional="show"/>
                <field name="settlement_net_amount" optional="show"/>
                <field name="settlement_fee_amount" optional="show"/>
                <field name="settlement_release_date" optional="show"/>
                <field name="settlement_status" optional="hide"/>
            </xpath>
        </field>
    </record>

    <record id="view_pos_payment_form_settlement" model="ir.ui.view">
        <field name="name">pos.payment.form.settlement</field>
        <field name="model">pos.payment</field>
        <field name="inherit_id" ref="point_of_sale.view_pos_payment_form"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='payment_method_id']" position="after">
                <field name="settlement_state"/>
                <field name="settlement_net_amount"/>
                <field name="settlement_fee_amount"/>
                <field name="settlement_release_date"/>
                <field name="settlement_status"/>
            </xpath>
        </field>
    </record>
</odoo>
```

The xpath anchor `//field[@name='payment_method_id']` is the same one `pos_mercado_pago_alpy` already uses on these two views. Two modules inheriting the same view at the same anchor is fine — Odoo applies them in dependency order, and this module depends on that one, so its fields land after.

- [ ] **Step 2: Register it**

In `pos_mercado_pago_reconciliation/__manifest__.py`, change the `data` key to:

```python
    'data': [
        'data/ir_cron.xml',
        'views/pos_payment_views.xml',
    ],
```

- [ ] **Step 3: Verify**

Run: `C:\Python314\python.exe -c "from lxml import etree; etree.parse(r'pos_mercado_pago_reconciliation/views/pos_payment_views.xml'); print('XML OK')"`
Expected: `XML OK`.

Cross-check every `<field name="...">` in the views against the fields defined in `models/pos_payment.py`. All five must exist.

- [ ] **Step 4: Commit**

```bash
git add pos_mercado_pago_reconciliation/views pos_mercado_pago_reconciliation/__manifest__.py
git commit -m "feat(pos_mercado_pago_reconciliation): show settlement data on pos.payment"
```

---

### Task 6: README and repository index

**Files:**
- Create: `pos_mercado_pago_reconciliation/README.md`
- Modify: `README.md` (repo root)

- [ ] **Step 1: The module README**

`pos_mercado_pago_reconciliation/README.md`:

```markdown
# POS Mercado Pago Reconciliation

Adds bank-reconciliation data to Mercado Pago payments taken in the Point of Sale:
the **net amount** actually credited, the **fees** charged, and the **release date**
of the money.

Requires `pos_mercado_pago_alpy`, which charges the payments and records the
identifiers this module needs to look them up.

## Why it is a separate module

Fetching this data means one to two HTTP calls to the Mercado Pago API **per payment**.
That work used to run inside the POS session closing, where it added 15–30 seconds to
a 50-payment close and far more when the API was slow. Here it runs from a scheduled
job, so closing a session never waits on Mercado Pago.

## How it works

An hourly scheduled job — **Settings → Technical → Scheduled Actions → "POS: fetch
Mercado Pago settlement data"** — sweeps payments that are not settled yet, up to 200
per run, looking back 30 days.

Each payment is resolved on Mercado Pago by its payment id, or by its external
reference when the id is alphanumeric (the Orders API returns those).

## Settlement states

| State | Meaning |
|---|---|
| *(empty)* | Not a payment this module settles — cash, customer account, any non-Mercado-Pago method |
| **Pending** | Mercado Pago has no final figures yet. The job will try again |
| **Settled** | Final figures received, including a release date |

A payment stays **Pending** until a release date comes back. That matters: a payment
can be approved without being accredited, and its net amount at that moment is not
final. Storing those figures as if they were would silently understate what was
actually credited.

Payments older than the 30-day window stop being retried and simply stay **Pending** —
filter on that state to find them.

## Where the data shows up

On the `pos.payment` list and form, in **Point of Sale → Orders → Payments**.
```

- [ ] **Step 2: Repository index**

In the root `README.md`, add this line to the **💳 Payment & Finance** list, immediately after the `POS Mercado Pago (Alpy)` entry:

```markdown
- **[POS Mercado Pago Reconciliation](./pos_mercado_pago_reconciliation/README.md)**: Fetches net amount, fees and release date for Mercado Pago POS payments from a scheduled job.
```

Make no other change to the root README.

- [ ] **Step 3: Commit**

```bash
git add pos_mercado_pago_reconciliation/README.md README.md
git commit -m "docs(pos_mercado_pago_reconciliation): add module README and index entry"
```

---

## Verification the user must run

- [ ] `odoo -c <conf> -d <db> -i pos_mercado_pago_reconciliation --test-enable --test-tags /pos_mercado_pago_reconciliation --stop-after-init` — expect 11 passed
- [ ] The module installs cleanly, and the scheduled action appears under Settings → Technical → Scheduled Actions
- [ ] Trigger the cron manually on a database with real Mercado Pago payments; confirm the settlement columns fill in
- [ ] A payment that Mercado Pago has not accredited yet stays **Pending**, and settles on a later run
- [ ] The `pos.payment` list and form render with both this module's columns and `pos_mercado_pago_alpy`'s
- [ ] **Close a POS session and confirm it is still fast** — this module must add nothing to the closing path

## Out of scope — do not build these

- **A multi-processor base module.** The seam is prepared, not executed. Do not create an abstract module or a second provider.
- **Migrating the old `mp_net_amount` / `mp_fee_amount` / `mp_release_date` / `mp_status_detail` / `mp_info_fetched` data.** It is discarded on purpose; PR A drops those columns.
- **Any change to `pos_mercado_pago_alpy`.** That module is PR A's business and is otherwise frozen.
- **Making the lookback window or batch size configurable.** They are module constants until someone actually needs to change one.
- **A manual "fetch now" button.** The cron can be triggered by hand from Scheduled Actions.
