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
