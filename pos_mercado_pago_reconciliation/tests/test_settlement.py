from datetime import timedelta
from unittest.mock import patch

from odoo import fields
from odoo.addons.point_of_sale.tests.common import TestPoSCommon
from odoo.tests import tagged

FETCH_VALUES = ('odoo.addons.pos_mercado_pago_reconciliation.models'
                '.pos_payment.PosPayment._settlement_fetch_values')
CALL_MP = ('odoo.addons.pos_mercado_pago_alpy.models'
           '.mercado_pago_post_request.MercadoPagoPosRequest.call_mercado_pago')


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
