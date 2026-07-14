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

    def _make_paid_order_with_split(self):
        """One line of 500m of cable split across BOB-A (300) and BOB-B (200)."""
        self.lotB = self.env['stock.lot'].create({
            'name': 'BOB-B', 'product_id': self.product.id,
        })
        self.env['stock.quant']._update_available_quantity(
            self.product, self.src_loc, 250.0, lot_id=self.lotB,
        )
        order = self.env['pos.order'].create({
            'company_id': self.env.company.id,
            'session_id': self.open_new_session().id,
            'partner_id': False,
            'lines': [(0, 0, {
                'name': 'L1',
                'product_id': self.product.id,
                'qty': 500.0,
                'price_unit': 10.0,
                'price_subtotal': 5000.0,
                'price_subtotal_incl': 5000.0,
                'pack_lot_ids': [
                    (0, 0, {'lot_name': 'BOB-A', 'qty': 300.0}),
                    (0, 0, {'lot_name': 'BOB-B', 'qty': 200.0}),
                ],
            })],
            'amount_total': 5000.0, 'amount_tax': 0.0,
            'amount_paid': 0.0, 'amount_return': 0.0,
        })
        return order

    def test_split_creates_one_move_with_two_move_lines(self):
        order = self._make_paid_order_with_split()
        order.lines._launch_stock_rule_from_pos_order_lines()

        moves = order.picking_ids.move_ids.filtered(
            lambda m: m.product_id == self.product)
        self.assertEqual(len(moves), 1, "expected a single stock move for the line")
        mls = moves.move_line_ids
        by_lot = {ml.lot_id.name: ml.quantity for ml in mls}
        self.assertEqual(by_lot.get('BOB-A'), 300.0)
        self.assertEqual(by_lot.get('BOB-B'), 200.0)

    def test_single_lot_matches_native(self):
        order = self.env['pos.order'].create({
            'company_id': self.env.company.id,
            'session_id': self.open_new_session().id,
            'partner_id': False,
            'lines': [(0, 0, {
                'name': 'L1', 'product_id': self.product.id, 'qty': 120.0,
                'price_unit': 10.0, 'price_subtotal': 1200.0, 'price_subtotal_incl': 1200.0,
                'pack_lot_ids': [(0, 0, {'lot_name': 'BOB-A', 'qty': 0.0})],
            })],
            'amount_total': 1200.0, 'amount_tax': 0.0,
            'amount_paid': 0.0, 'amount_return': 0.0,
        })
        order.lines._launch_stock_rule_from_pos_order_lines()
        moves = order.picking_ids.move_ids.filtered(lambda m: m.product_id == self.product)
        mls = moves.move_line_ids
        self.assertEqual(len(mls), 1)
        self.assertEqual(mls.lot_id.name, 'BOB-A')
        self.assertEqual(mls.quantity, 120.0)
