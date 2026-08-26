from psycopg2 import IntegrityError

from odoo.tests import tagged
from odoo.tools import mute_logger
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


@tagged('post_install', '-at_install')
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
        dessert = Group.create({'name': 'AAA Postres', 'sequence': 30})
        starter = Group.create({'name': 'ZZZ Entradas', 'sequence': 10})
        ordered = Group.search([('id', 'in', (dessert + starter).ids)])
        self.assertEqual(ordered[0], starter)
        self.assertEqual(ordered[1], dessert)

    @mute_logger('odoo.sql_db')
    def test_group_name_is_unique(self):
        self.env['pos.kitchen.group'].create({'name': 'Principales'})
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                self.env['pos.kitchen.group'].create({'name': 'Principales'})

    def test_category_kitchen_group_travels_to_the_pos(self):
        fields = self.env['pos.category']._load_pos_data_fields(self.config)
        self.assertIn('kitchen_group_id', fields)

    def test_category_ids_is_the_inverse_of_kitchen_group_id(self):
        group = self.env['pos.kitchen.group'].create({'name': 'Entradas', 'sequence': 10})
        category = self.env['pos.category'].create({
            'name': 'Picadas',
            'kitchen_group_id': group.id,
        })
        self.assertIn(category, group.category_ids)

    def test_product_kitchen_group_travels_to_the_pos(self):
        fields = self.env['product.template']._load_pos_data_fields(self.config)
        self.assertIn('kitchen_group_id', fields)

    def test_product_can_override_the_category_group(self):
        starters = self.env['pos.kitchen.group'].create({'name': 'Entradas', 'sequence': 10})
        mains = self.env['pos.kitchen.group'].create({'name': 'Principales', 'sequence': 20})
        category = self.env['pos.category'].create({
            'name': 'Minutas',
            'kitchen_group_id': mains.id,
        })
        product = self.env['product.template'].create({
            'name': 'Empanada',
            'available_in_pos': True,
            'pos_categ_ids': [(6, 0, category.ids)],
            'kitchen_group_id': starters.id,
        })
        self.assertEqual(product.kitchen_group_id, starters)
        self.assertEqual(product.pos_categ_ids.kitchen_group_id, mains)

    def test_groups_default_to_the_current_company(self):
        group = self.env['pos.kitchen.group'].create({'name': 'Guarniciones'})
        self.assertEqual(group.company_id, self.env.company)

    def test_the_same_name_is_allowed_in_another_company(self):
        other = self.env['res.company'].create({'name': 'Otra Compania'})
        self.env['pos.kitchen.group'].create({'name': 'Principales de la casa'})
        twin = self.env['pos.kitchen.group'].create({
            'name': 'Principales de la casa',
            'company_id': other.id,
        })
        self.assertEqual(twin.company_id, other)

    def test_only_own_and_shared_groups_are_loaded(self):
        Group = self.env['pos.kitchen.group']
        other = self.env['res.company'].create({'name': 'Otra Compania'})
        shared = Group.create({'name': 'Compartido', 'company_id': False})
        mine = Group.create({'name': 'Propio', 'company_id': self.config.company_id.id})
        theirs = Group.create({'name': 'Ajeno', 'company_id': other.id})
        loaded = Group.search(Group._load_pos_data_domain({}, self.config))
        self.assertIn(shared, loaded)
        self.assertIn(mine, loaded)
        self.assertNotIn(theirs, loaded)

    def test_archived_groups_are_hidden_from_the_default_search(self):
        Group = self.env['pos.kitchen.group']
        group = Group.create({'name': 'Temporada'})
        group.active = False
        self.assertNotIn(group, Group.search([]))
        self.assertIn(group, Group.with_context(active_test=False).search([]))

    def test_archiving_a_group_keeps_the_category_assignment(self):
        group = self.env['pos.kitchen.group'].create({'name': 'Temporada alta'})
        category = self.env['pos.category'].create({
            'name': 'Estacionales',
            'kitchen_group_id': group.id,
        })
        group.active = False
        self.assertEqual(category.kitchen_group_id, group)
