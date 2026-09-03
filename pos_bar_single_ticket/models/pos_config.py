from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # No hace falta tocar _load_pos_data_fields: pos.config no lo define, el mixin
    # devuelve [] y read([]) trae todos los campos, asi que este llega solo al POS.
    bar_ticket_watermark = fields.Char(
        string='Bar Ticket Watermark',
        size=5,
        help=(
            'Up to five characters printed as an outlined watermark on the four '
            'corners of the bar ticket, e.g. the initial of the venue. The type '
            'size shrinks as you add characters so the watermark never collides '
            'with the POS name. '
            'Leave empty to print no watermark.'
        ),
    )
