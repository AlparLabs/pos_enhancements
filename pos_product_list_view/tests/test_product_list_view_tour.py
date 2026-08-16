from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon


class TestProductListViewTour(TestPointOfSaleHttpCommon):

    def test_list_view_adds_product_to_order(self):
        # Set explicitly rather than relying on the field default: the tour's first step
        # asserts the native grid is intact, which is only true if the session starts in
        # grid mode. The frontend prefers the device's localStorage choice over this
        # value, but every tour gets a throwaway Chrome profile: browser_js builds a fresh
        # ChromeBrowser per call (odoo/tests/common.py:2485), which allocates a
        # TemporaryDirectory (:1260-1262) and hands it to Chrome as --user-data-dir
        # (:1457). localStorage therefore starts empty and this default is what wins.
        self.main_pos_config.write({'product_view_default': 'grid'})
        self.main_pos_config.with_user(self.pos_user).open_ui()
        self.start_pos_tour("ProductListViewTour")
