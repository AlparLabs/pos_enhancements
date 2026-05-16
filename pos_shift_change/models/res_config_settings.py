from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_pos_shift_change_enabled = fields.Boolean(
        string='Allow Shift Change Close',
        related='pos_config_id.pos_shift_change_enabled',
        readonly=False,
    )
