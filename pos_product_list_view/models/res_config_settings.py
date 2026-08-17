from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Odoo's Settings screen only renders fields declared directly on res.config.settings.
    # pos.config fields do NOT appear there automatically, so every setting needs a related
    # field here, prefixed with pos_. Without these the view below fails validation.
    pos_product_view_default = fields.Selection(
        related='pos_config_id.product_view_default',
        readonly=False,
    )
    pos_product_list_show_image = fields.Boolean(
        related='pos_config_id.product_list_show_image',
        readonly=False,
    )
    pos_product_list_show_ref = fields.Boolean(
        related='pos_config_id.product_list_show_ref',
        readonly=False,
    )
    pos_product_list_show_uom = fields.Boolean(
        related='pos_config_id.product_list_show_uom',
        readonly=False,
    )
    pos_product_list_show_barcode = fields.Boolean(
        related='pos_config_id.product_list_show_barcode',
        readonly=False,
    )
