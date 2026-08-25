from psycopg2 import IntegrityError

from odoo.tools import mute_logger
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


class TestKitchenGroup(TestPoSCommon):

    def setUp(self):
        super().setUp()
        self.config = self.basic_config

    def test_model_is_loaded_in_the_pos_session(self):
        models = self.env['pos.session']._load_pos_data_models(self.config)
        self.assertIn('pos.kitchen.group', models)

    def test_loaded_fields_are_id_name_and_sequence(self):
        fields = self.env['pos.kitchen.group']._load_pos_data_fields(self.config)
        self.assertEqual(sorted(fields), ['id', 'name', 'sequence'])

    def test_groups_are_ordered_by_sequence(self):
        Group = self.env['pos.kitchen.group']
        dessert = Group.create({'name': 'Postres ZZZ', 'sequence': 30})
        starter = Group.create({'name': 'Entradas AAA', 'sequence': 10})
        ordered = Group.search([('id', 'in', (dessert + starter).ids)])
        self.assertEqual(ordered[0], starter)
        self.assertEqual(ordered[1], dessert)

    @mute_logger('odoo.sql_db')
    def test_group_name_is_unique(self):
        self.env['pos.kitchen.group'].create({'name': 'Principales'})
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                self.env['pos.kitchen.group'].create({'name': 'Principales'})
