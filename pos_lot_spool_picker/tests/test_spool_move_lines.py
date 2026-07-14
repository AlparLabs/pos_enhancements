from odoo.addons.point_of_sale.tests.common import TestPoSCommon


class TestSpoolLots(TestPoSCommon):

    def setUp(self):
        super().setUp()
        self.config = self.basic_config
        self.product = self.create_product(
            'Cable 2x2.5', self.categ_basic, 10.0, 5.0,
        )
        self.product.write({'is_storable': True, 'tracking': 'lot'})
        self.src_loc = self.config.picking_type_id.default_location_src_id
        self.lotA = self.env['stock.lot'].create({
            'name': 'BOB-A', 'product_id': self.product.id,
        })
        self.env['stock.quant']._update_available_quantity(
            self.product, self.src_loc, 300.0, lot_id=self.lotA,
        )

    def test_get_existing_lots_includes_location(self):
        result = self.env['pos.order.line'].get_existing_lots(
            self.env.company.id, self.config.id, self.product.id,
        )
        self.assertEqual(len(result), 1)
        lot = result[0]
        self.assertEqual(lot['name'], 'BOB-A')
        self.assertEqual(lot['product_qty'], 300.0)
        self.assertIn('location_name', lot)
        self.assertEqual(lot['location_name'], self.src_loc.display_name)
