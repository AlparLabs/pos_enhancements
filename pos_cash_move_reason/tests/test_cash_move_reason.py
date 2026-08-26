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
