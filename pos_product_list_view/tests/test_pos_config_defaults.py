from odoo.addons.point_of_sale.tests.common import TestPoSCommon


class TestProductListViewConfig(TestPoSCommon):

    def setUp(self):
        super().setUp()
        self.config = self.basic_config

    def test_defaults_are_grid_with_image_and_ref(self):
        self.assertEqual(self.config.product_view_default, 'grid')
        self.assertTrue(self.config.product_list_show_image)
        self.assertTrue(self.config.product_list_show_ref)
        self.assertFalse(self.config.product_list_show_uom)
        self.assertFalse(self.config.product_list_show_barcode)

    def test_settings_related_fields_write_through_to_config(self):
        settings = self.env['res.config.settings'].create({
            'pos_config_id': self.config.id,
            'pos_product_view_default': 'list',
            'pos_product_list_show_uom': True,
        })
        settings.execute()
        # The write-through to pos_config_id already happened above, inside create(),
        # not here in execute(). See the create() override in
        # point_of_sale/models/res_config_settings.py, which strips 'pos_'-prefixed
        # vals and writes them to pos_config_id right after the super().create() call.
        self.assertEqual(self.config.product_view_default, 'list')
        self.assertTrue(self.config.product_list_show_uom)
