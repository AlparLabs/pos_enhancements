from odoo.addons.point_of_sale.tests.common import TestPoSCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestLotPaymentMoves(TestPoSCommon):
    """Per-lot account.payment generation at session closing."""

    def setUp(self):
        super().setUp()
        self.config = self.basic_config
        self.bank_pm1.use_terminal_details = True
        self.product = self.create_product('Producto', self.categ_basic, 100.0)

    def _set_lot(self, order, lot_number):
        """Tag the card payment of `order` with a terminal lot number."""
        order.payment_ids.filtered(
            lambda p: p.payment_method_id == self.bank_pm1
        ).lot_number = lot_number

    def _order_params(self, uuid):
        return {
            'pos_order_lines_ui_args': [(self.product, 1)],
            'payments': [(self.bank_pm1, 100.0)],
            'uuid': uuid,
        }

    def _close_and_get_payments(self):
        session = self.pos_session
        session.action_pos_session_closing_control()
        self.assertEqual(session.state, 'closed')
        return session, self.env['account.payment'].search([
            ('pos_session_id', '=', session.id),
        ])

    def test_one_payment_per_lot(self):
        """Each lot gets its own account.payment; unlabelled ones are grouped."""
        self.open_new_session()
        orders = self._create_orders([
            self._order_params('lot-a'),
            self._order_params('lot-b'),
            self._order_params('no-lot'),
        ])
        self._set_lot(orders['lot-a'], 'L001')
        self._set_lot(orders['lot-b'], 'L002')
        # 'no-lot' keeps lot_number empty on purpose.

        _session, payments = self._close_and_get_payments()

        memos = payments.mapped('memo')
        self.assertTrue(any('L001' in memo for memo in memos))
        self.assertTrue(any('L002' in memo for memo in memos))
        self.assertTrue(any('Sin Lote' in memo for memo in memos))
        self.assertEqual(sum(payments.mapped('amount')), 300.0)

    def test_cancelled_order_is_excluded(self):
        """A cancelled order must not leak into the per-lot breakdown.

        The core accumulates the closing amounts from _get_closed_orders() only.
        If the per-lot split read every payment of the session instead, the extra
        receivable line would leave the closing entry unbalanced.
        """
        self.open_new_session()
        orders = self._create_orders([
            self._order_params('kept'),
            self._order_params('cancelled'),
        ])
        self._set_lot(orders['kept'], 'L001')
        self._set_lot(orders['cancelled'], 'L999')
        orders['cancelled'].state = 'cancel'

        session, payments = self._close_and_get_payments()

        memos = payments.mapped('memo')
        self.assertTrue(any('L001' in memo for memo in memos))
        self.assertFalse(
            any('L999' in memo for memo in memos),
            "the payment of a cancelled order leaked into the closing entry",
        )
        self.assertEqual(sum(payments.mapped('amount')), 100.0)

        move = session.move_id
        self.assertAlmostEqual(
            sum(move.line_ids.mapped('debit')),
            sum(move.line_ids.mapped('credit')),
            msg="the closing journal entry must balance",
        )
