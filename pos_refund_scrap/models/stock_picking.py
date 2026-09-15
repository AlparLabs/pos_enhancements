# -*- coding: utf-8 -*-
from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    @api.model
    def _create_picking_from_pos_order_lines(self, location_dest_id, lines, picking_type, partner=False):
        """Override to intercept negative lines destined for scrap/waste and route them
        to the configured scrap location instead of standard WH/Stock return.
        Also creates official stock.scrap records linked to the picking and moves.
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

        # Create moves per scrap line to track which moves belong to which product/kit
        lines_with_moves = []
        for line in scrap_lines:
            moves_before = scrap_picking.move_ids
            scrap_picking._create_move_from_pos_order_lines(line)
            new_moves = scrap_picking.move_ids - moves_before
            lines_with_moves.append((line, new_moves))

        try:
            with self.env.cr.savepoint():
                scrap_picking.with_context(is_scrap=True)._action_done()
        except (UserError, ValidationError):
            pass

        # Create official stock.scrap records and link the stock moves
        scrap_picking._create_scrap_records_for_pos_refund(lines_with_moves, scrap_location)

        pickings |= scrap_picking
        return pickings

    def _create_scrap_records_for_pos_refund(self, lines_with_moves, scrap_location):
        """Creates official stock.scrap records for each refunded line and links the
        generated stock.move records so they appear in Inventory > Operations > Scrap
        and in the picking's Scraps smart button without duplicate stock moves.
        """
        self.ensure_one()
        for line, moves in lines_with_moves:
            bom_id = False
            if 'mrp.bom' in self.env:
                bom = self.env['mrp.bom'].sudo()._bom_find(
                    line.product_id,
                    company_id=self.company_id.id,
                    bom_type='phantom'
                ).get(line.product_id)
                if bom:
                    bom_id = bom.id

            # Fallback if moves were not captured directly
            if not moves:
                moves = self.move_ids.filtered(
                    lambda m: not m.scrap_id and (
                        m.product_id == line.product_id
                        or m.description_picking == line.product_id.display_name
                        or (bom_id and m.bom_line_id)
                    )
                )
            if not moves and len(lines_with_moves) == 1:
                moves = self.move_ids.filtered(lambda m: not m.scrap_id)

            scrap_vals = {
                'name': self.env['ir.sequence'].next_by_code('stock.scrap') or _('New'),
                'company_id': self.company_id.id,
                'origin': line.order_id.name or self.origin or self.name,
                'product_id': line.product_id.id,
                'product_uom_id': line.product_uom_id.id or line.product_id.uom_id.id,
                'scrap_qty': abs(line.qty),
                'location_id': self.location_id.id,
                'scrap_location_id': scrap_location.id,
                'picking_id': self.id,
                'state': 'done',
                'date_done': fields.Datetime.now(),
                'pos_order_id': line.order_id.id,
                'pos_order_line_id': line.id,
            }
            if bom_id:
                scrap_vals['bom_id'] = bom_id

            scrap = self.env['stock.scrap'].sudo().create(scrap_vals)

            if moves:
                moves.sudo().write({'scrap_id': scrap.id})
