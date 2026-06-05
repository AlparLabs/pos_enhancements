from __future__ import annotations

from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    restrict_payment_to_manager: bool = fields.Boolean(
        string='Pago Centralizado',
        default=False,
        help=(
            'Cuando está activo, el botón Cobrar solo es visible para cajeros con rol Manager. '
            'Diseñado para restaurantes con múltiples terminales y una única caja central.'
        ),
    )

    @api.model
    def _load_pos_data_read(self, records, config) -> list[dict]:
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['restrict_payment_to_manager'] = config.restrict_payment_to_manager
        return read_records
