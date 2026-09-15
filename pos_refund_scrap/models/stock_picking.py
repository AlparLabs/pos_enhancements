# -*- coding: utf-8 -*-
from odoo import api, models
from odoo.exceptions import UserError, ValidationError


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    @api.model
    def _create_picking_from_pos_order_lines(self, location_dest_id, lines, picking_type, partner=False):
        """Override to intercept negative lines destined for scrap/waste and route them
        to the configured scrap location instead of standard WH/Stock return.
        """
        stockable_lines = lines.filtered(
            lambda l: l.product_id.type == 'consu' and not l.product_id.uom_id.is_zero(l.qty)
        )
        negative_lines = stockable_lines.filtered(lambda l: l.qty < 0)

        scrap_lines = negative_lines.filtered(lambda l: l._should_refund_to_scrap())
        if not scrap_lines:
            return super()._create_picking_from_pos_order_lines(location_dest_id, lines, picking_type, partner=partner)

        remaining_lines = lines - scrap_lines
        pickings = self.env['stock.picking']

        if remaining_lines:
            pickings |= super()._create_picking_from_pos_order_lines(location_dest_id, remaining_lines, picking_type, partner=partner)

        # Process scrap_lines
        first_order = scrap_lines[0].order_id
        config = first_order.session_id.config_id
        scrap_location = config.refund_scrap_location_id or self.env['stock.location'].search([
            ('usage', '=', 'inventory'),
            ('company_id', 'in', [picking_type.company_id.id, False]),
        ], limit=1)

        if not scrap_location:
            # Fallback to standard flow if no scrap location is found
            return pickings | super()._create_picking_from_pos_order_lines(location_dest_id, scrap_lines, picking_type, partner=partner)

        if picking_type.return_picking_type_id:
            return_picking_type = picking_type.return_picking_type_id
        else:
            return_picking_type = picking_type

        scrap_picking = self.create(
            self._prepare_picking_vals(partner, return_picking_type, location_dest_id, scrap_location.id)
        )
        scrap_picking._create_move_from_pos_order_lines(scrap_lines)
        try:
            with self.env.cr.savepoint():
                scrap_picking.with_context(is_scrap=True)._action_done()
        except (UserError, ValidationError):
            pass

        pickings |= scrap_picking
        return pickings
