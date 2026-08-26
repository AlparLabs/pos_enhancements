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

    def test_fixed_contact_mode_requires_a_contact(self):
        with self.assertRaises(ValidationError):
            self._make_reason(partner_mode='fixed')

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

    def test_ask_mode_without_a_payload_contact_keeps_the_cashier(self):
        """The cashier can cancel the contact picker; the concept still applies."""
        self.open_new_session()
        reason = self._make_reason(
            account_id=self.expense_account.id,
            partner_mode='ask',
        )

        st_line = self._cash_out(extras={'cash_move_reason_id': reason.id})

        self.assertEqual(st_line.pos_cash_move_reason_id, reason)
        self.assertFalse(st_line.pos_counterpart_partner_id)
        _liquidity, _suspense, other = st_line._seek_for_lines()
        self.assertEqual(other.partner_id, self.env.user.partner_id)

    def test_ask_mode_rejects_a_contact_from_another_company(self):
        other_company = self.env['res.company'].create({'name': 'Otra Compania'})
        foreign_partner = self.env['res.partner'].create({
            'name': 'Proveedor Ajeno',
            'company_id': other_company.id,
        })
        self.open_new_session()
        reason = self._make_reason(
            account_id=self.expense_account.id,
            partner_mode='ask',
        )

        st_line = self._cash_out(extras={
            'cash_move_reason_id': reason.id,
            'counterpart_partner_id': foreign_partner.id,
        })

        self.assertFalse(st_line.pos_counterpart_partner_id)

    def test_ask_mode_accepts_a_company_less_contact(self):
        """Partners are normally shared across companies; those must not be rejected."""
        self.open_new_session()
        self.assertFalse(self.supplier.company_id, 'this test needs a company-less partner')
        reason = self._make_reason(
            account_id=self.expense_account.id,
            partner_mode='ask',
        )

        st_line = self._cash_out(extras={
            'cash_move_reason_id': reason.id,
            'counterpart_partner_id': self.supplier.id,
        })

        self.assertEqual(st_line.pos_counterpart_partner_id, self.supplier)
