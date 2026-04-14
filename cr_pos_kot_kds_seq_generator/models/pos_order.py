# -*- coding: utf-8 -*-
# Part of Creyox Technologies.

from odoo import models, api, fields


class PosOrder(models.Model):
    _inherit = "pos.order"

    @api.model
    def create_from_ui(self, orders, draft=False):
        res = super(PosOrder, self).create_from_ui(orders, draft=draft)

        for order_data in orders:
            pos_order = self.search(
                [("pos_reference", "=", order_data["data"]["name"])], limit=1
            )
            if pos_order:
                for line_data in order_data["data"]["lines"]:
                    line_id = line_data[2].get("id")
                    line_info = line_data[2]
                    if "kot_note" in line_info and "kot_is_set" in line_info:
                        pos_order_line = self.env["pos.order.line"].browse(line_id)
                        if pos_order_line:
                            pos_order_line.write(
                                {
                                    "kot_note": line_info["kot_note"],
                                    "kot_is_set": line_info["kot_is_set"],
                                }
                            )
                            self.env.cr.commit()
        return res

    @api.model
    def export_for_ui_table_draft(self, table_ids):
        orders = super().export_for_ui_table_draft(table_ids)
        for order in orders:
            for line in order["lines"]:
                pos_line = self.env["pos.order.line"].browse(line[2]["id"])
                line[2]["kot_note"] = pos_line.kot_note
                line[2]["kot_is_set"] = pos_line.kot_is_set
        self_orders = self.get_standalone_self_order().export_for_ui()
        return orders + self_orders


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    _sql_constraints = [
        (
            "accountable_required_fields",
            "CHECK(display_type IS NOT NULL OR (product_id IS NOT NULL AND quantity IS NOT NULL))",
            "Missing required fields on accountable warranty request line.",
        ),
        (
            "non_accountable_null_fields",
            "CHECK(display_type IS NULL OR (product_id IS NULL AND quantity = 0))",
            "Forbidden values on non-accountable warranty request line",
        ),
    ]

    kot_note = fields.Char(string="KOT Number", readonly=True)
    product_id = fields.Many2one(
        "product.product",
        string="Product",
        domain=[("sale_ok", "=", True)],
        required=False,
        change_default=True,
    )
    sequence = fields.Integer(string="Sequence")
    kot_is_set = fields.Boolean(string="KOT Is Set", readonly=True)
    name = fields.Char("Description")
    display_type = fields.Selection(
        selection=[
            ("line_section", "Section"),
            ("line_note", "Note"),
        ],
        default=False,
    )

    @api.model
    def get_kot_details(self, pos_order_id, product_id):
        pos_order_line = self.env["pos.order.line"].search(
            [("order_id", "=", pos_order_id), ("product_id", "=", product_id)], limit=1
        )
        if pos_order_line:
            return {
                "kot_note": pos_order_line.kot_note,
                "kot_is_set": pos_order_line.kot_is_set,
            }
        else:
            return {}

    @api.model
    def create(self, vals_list):
        """
        This function overrides the create method of the PosOrderLine model to handle the creation of new order lines.
        It checks if a 'kot_note' field is present in the provided values and creates a corresponding note line if it exists.
        It also updates the sequence of the order line based on the existing order lines.

        Parameters:
        vals_list (dict): A dictionary containing the values to be used for creating the new order line.

        Returns:
        record: The newly created order line record.
        """
        sequence = 1

        if "kot_note" in vals_list and vals_list["kot_note"]:
            order_id = vals_list["order_id"]
            max_sequence = max(
                self.search([("order_id", "=", order_id)]).mapped("sequence") or [0]
            )

            note_line_vals = {
                "order_id": order_id,
                "name": vals_list["kot_note"],
                "display_type": "line_note",
                "price_subtotal": 0,
                "price_subtotal_incl": 0,
                "sequence": max_sequence + 1,
            }
            super().create(note_line_vals)

            sequence = max_sequence + 2

            if "product_id" in vals_list:
                product = self.env["product.product"].browse(vals_list["product_id"])
                vals_list["name"] = product.display_name

            vals_list["sequence"] = sequence

        else:
            if "order_id" in vals_list:
                order_id = vals_list["order_id"]
                max_sequence = max(
                    self.search([("order_id", "=", order_id)]).mapped("sequence") or [0]
                )
                vals_list["sequence"] = max_sequence + 1

                if "product_id" in vals_list:
                    product = self.env["product.product"].browse(
                        vals_list["product_id"]
                    )
                    vals_list["name"] = product.display_name

        if vals_list.get("display_type"):
            vals_list.update({"product_id": False, "qty": 0})

        return super().create(vals_list)

    def write(self, vals_list):
        res = super().write(vals_list)
        return res


class PosConfig(models.Model):
    _inherit = "pos.config"

    def get_fields_for_pos_order_line(self):
        """
        This function retrieves the list of fields to be displayed in the Point of Sale (POS) order line.
        It extends the list of fields by adding 'kot_note' and 'kot_is_set' fields.

        Parameters:
        self (PosConfig): The instance of the PosConfig model.

        Returns:
        list: A list of field names to be displayed in the POS order line.
        """
        fields = super(PosConfig, self).get_fields_for_pos_order_line()
        fields.extend(["kot_note", "kot_is_set"])
        return fields
