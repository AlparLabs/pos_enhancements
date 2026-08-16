from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # Semilla para dispositivos nuevos. El cajero puede cambiar de vista en cualquier
    # momento; su eleccion se guarda en localStorage y pisa este valor.
    product_view_default = fields.Selection(
        selection=[('grid', 'Grid'), ('list', 'List')],
        string='Default Product View',
        help='Initial product view for devices that have not chosen one yet. '
             'The cashier can always switch, and their choice is remembered per device.',
        default='grid',
        required=True,
    )
    product_list_show_image = fields.Boolean(
        string='List View: Show Thumbnail',
        default=True,
    )
    product_list_show_ref = fields.Boolean(
        string='List View: Show Internal Reference',
        default=True,
    )
    product_list_show_uom = fields.Boolean(
        string='List View: Show Unit of Measure',
        default=False,
    )
    # Off by default: barcodes are scanned, not read. The column exists for the
    # setups that genuinely need it, but it costs width and earns little.
    product_list_show_barcode = fields.Boolean(
        string='List View: Show Barcode',
        default=False,
    )
