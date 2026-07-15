from odoo import api, fields, models


class PosPackOperationLot(models.Model):
    _inherit = 'pos.pack.operation.lot'

    # Meters (or units) taken from THIS lot for the order line. When set, it drives the
    # stock move line qty instead of the whole line qty. Defaults to 0.0 so native
    # single-lot behaviour (qty = line qty) is preserved when the field is untouched.
    qty = fields.Float('Lot Quantity', default=0.0, digits='Product Unit of Measure')

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if 'qty' not in fields_list:
            fields_list.append('qty')
        return fields_list
