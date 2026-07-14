from odoo import api, models


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    @api.model
    def get_existing_lots(self, company_id, config_id, product_id):
        """Extend the native result with each lot's storage location(s).

        Native groups stock.quant by lot_id summing quantity. We re-read the same
        quants to attach a human-readable location per lot for the spool picker.
        """
        result = super().get_existing_lots(company_id, config_id, product_id)
        if not result:
            return result

        pos_config = self.env['pos.config'].browse(config_id)
        src_loc = pos_config.picking_type_id.default_location_src_id
        lot_ids = [lot['id'] for lot in result]
        quants = self.sudo().env['stock.quant'].search([
            ('lot_id', 'in', lot_ids),
            ('location_id', 'in', src_loc.child_internal_location_ids.ids),
            ('quantity', '>', 0),
        ])
        # Pick the location holding the most quantity for each lot (the main spot).
        loc_by_lot = {}
        for lot_id in lot_ids:
            lot_quants = quants.filtered(lambda q: q.lot_id.id == lot_id)
            if lot_quants:
                main = max(lot_quants, key=lambda q: q.quantity)
                loc_by_lot[lot_id] = main.location_id.display_name
        for lot in result:
            lot['location_name'] = loc_by_lot.get(lot['id'], '')
        return result
