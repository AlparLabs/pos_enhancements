from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Odoo's Settings screen only shows fields declared directly on res.config.settings;
    # pos.config fields do NOT appear there automatically (unlike POS frontend data loading).
    # Every existing pos.config setting in core (e.g. pos_ship_later, pos_use_presets) has a
    # matching related field here, prefixed with pos_, for that same reason. Without this, the
    # <field name="pos_spool_picker_enforce_stock"/> in res_config_settings_views.xml would fail
    # view validation with "field does not exist on model res.config.settings".
    pos_spool_picker_enforce_stock = fields.Boolean(
        related='pos_config_id.spool_picker_enforce_stock',
        readonly=False,
    )
