from odoo import models


class StockMove(models.Model):
    _inherit = 'stock.move'

    def _add_mls_related_to_order(self, related_order_lines, are_qties_done=True):
        """Same as core, but each pack lot consumes its own `qty` (meters) when set.

        Only lot-tracked lines whose pack lots carry a positive `qty` deviate from core;
        everything else is delegated to super so serial tracking and single-lot lines keep
        native behaviour. Pinned to Odoo 19.0 core logic — re-verify on version upgrade.
        """
        # Lines where our per-lot qty applies: lot tracking with at least one qty > 0.
        def uses_spool_qty(line):
            return (
                line.product_id.tracking == 'lot'
                and any(pl.qty for pl in line.pack_lot_ids.filtered(lambda l: l.lot_name))
            )

        spool_lines = related_order_lines.filtered(uses_spool_qty)
        if not spool_lines:
            return super()._add_mls_related_to_order(related_order_lines, are_qties_done=are_qties_done)

        other_lines = related_order_lines - spool_lines
        spool_products = spool_lines.product_id
        other_moves = self.filtered(lambda m: m.product_id not in spool_products)
        spool_moves = self - other_moves

        if other_lines or other_moves:
            other_moves._add_mls_related_to_order(other_lines, are_qties_done=are_qties_done)

        # Handle the spool moves with per-lot meters.
        lines_by_product = {}
        for line in spool_lines:
            lines_by_product.setdefault(line.product_id.id, self.env['pos.order.line'])
            lines_by_product[line.product_id.id] |= line

        existing_lots = spool_moves._create_production_lots_for_pos_order(spool_lines)
        move_lines_to_create = []
        for move in spool_moves:
            lines = lines_by_product.get(move.product_id.id)
            if not lines:
                continue
            if are_qties_done:
                move.move_line_ids.unlink()
            for line in lines:
                for lot in line.pack_lot_ids.filtered(lambda l: l.lot_name):
                    qty = abs(lot.qty) if lot.qty else abs(line.qty)
                    existing_lot = existing_lots.filtered_domain(
                        [('product_id', '=', line.product_id.id), ('name', '=', lot.lot_name)]
                    ) if existing_lots else self.env['stock.lot']
                    if are_qties_done:
                        if existing_lot:
                            quants = self.env['stock.quant'].search(
                                [('lot_id', '=', existing_lot.id), ('quantity', '>', '0.0'),
                                 ('location_id', 'child_of', move.location_id.id)],
                                order='id desc',
                            )
                            qty_left = qty
                            for quant in quants:
                                if qty_left <= 0:
                                    break
                                qty_chg = min(qty_left, quant.quantity)
                                ml_vals = dict(move._prepare_move_line_vals(qty_chg))
                                ml_vals.update({'quant_id': quant.id})
                                move_lines_to_create.append(ml_vals)
                                qty_left -= qty_chg
                            if qty_left > 0:
                                ml_vals = dict(move._prepare_move_line_vals(qty_left))
                                ml_vals.update({'lot_name': existing_lot.name, 'lot_id': existing_lot.id})
                                move_lines_to_create.append(ml_vals)
                        else:
                            ml_vals = dict(move._prepare_move_line_vals(qty))
                            ml_vals.update({'lot_name': lot.lot_name})
                            move_lines_to_create.append(ml_vals)
                    else:
                        if existing_lot:
                            move._update_reserved_quantity(qty, move.location_id, lot_id=existing_lot)

        if move_lines_to_create:
            self.env['stock.move.line'].create(move_lines_to_create)
