from psycopg2 import IntegrityError

from odoo.addons.point_of_sale.tests.common import TestPoSCommon
from odoo.exceptions import ValidationError
from odoo.tests import tagged
from odoo.tools import mute_logger


@tagged('post_install', '-at_install')
class TestCashMoveReason(TestPoSCommon):
    """Catalogue of concept buttons for the POS cash in/out popup.

    The module writes nothing accounting: it only standardises the movement label.
    The imputation is configured in Accounting with reconciliation models that match
    on the `[CODE]` prefix, which is out of this module's scope.
    """

    def setUp(self):
        super().setUp()
        self.config = self.basic_config

    def _make_reason(self, **kwargs):
        vals = {'name': 'Proveedores', 'code': 'PROVEEDORES', 'move_type': 'out'}
        vals.update(kwargs)
        return self.env['pos.cash.move.reason'].create(vals)

    def test_concepts_are_scoped_by_point_of_sale(self):
        shared = self._make_reason(name='Varios', code='VARIOS')
        scoped = self._make_reason(
            name='Delivery',
            code='DELIVERY',
            config_ids=[(6, 0, [self.other_currency_config.id])],
        )

        domain = self.env['pos.cash.move.reason']._load_pos_data_domain({}, self.config)
        loaded = self.env['pos.cash.move.reason'].search(domain)

        self.assertIn(shared, loaded, 'an empty config_ids must load on every terminal')
        self.assertNotIn(scoped, loaded, 'a concept scoped to another terminal must not load')

    def test_the_model_is_registered_for_pos_loading(self):
        models = self.env['pos.session']._load_pos_data_models(self.config)
        self.assertIn('pos.cash.move.reason', models)

    def test_the_code_reaches_the_browser(self):
        """The client builds the label prefix, so it needs the code."""
        loaded = self.env['pos.cash.move.reason']._load_pos_data_fields(self.config)
        self.assertIn('code', loaded)

    def test_the_code_is_normalized_on_create(self):
        reason = self._make_reason(name='Gift Card', code=' gift  card ')
        self.assertEqual(reason.code, 'GIFT_CARD')

    def test_the_code_is_normalized_on_write(self):
        reason = self._make_reason()
        reason.code = 'retiro chacras'
        self.assertEqual(reason.code, 'RETIRO_CHACRAS')

    def test_accents_are_stripped_from_the_code(self):
        """The code is typed inside a free-text field; keep it to plain ASCII."""
        reason = self._make_reason(name='Impuestos', code='imposición')
        self.assertEqual(reason.code, 'IMPOSICION')

    def test_a_code_with_brackets_is_rejected(self):
        """Square brackets delimit the code inside the label; they cannot be part of it."""
        with self.assertRaises(ValidationError):
            self._make_reason(code='PROV[1]')

    def test_a_code_that_starts_with_a_symbol_is_rejected(self):
        with self.assertRaises(ValidationError):
            self._make_reason(code='-PROV')

    def test_the_code_is_unique_within_a_company(self):
        self._make_reason()
        with self.assertRaises(IntegrityError), mute_logger('odoo.sql_db'):
            self._make_reason(name='Proveedores varios')
            self.env.flush_all()

    def test_the_same_code_is_allowed_in_another_company(self):
        other_company = self.env['res.company'].create({'name': 'Otra Compania'})
        self._make_reason()

        twin = self._make_reason(company_id=other_company.id)
        self.env.flush_all()

        self.assertEqual(twin.code, 'PROVEEDORES')

    def test_the_catalogue_carries_nothing_accounting(self):
        """Regression guard for the scope of the module: the imputation is configured
        with native reconciliation models, not here."""
        fields = self.env['pos.cash.move.reason']._fields
        for gone in ('account_id', 'partner_id', 'partner_mode'):
            self.assertNotIn(gone, fields)
