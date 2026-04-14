from typing import Any
from odoo import models

class PosSession(models.Model):
    _inherit = 'pos.session'

    def _loader_params_pos_category(self) -> dict[str, Any]:
        result = super()._loader_params_pos_category()
        result['search_params']['fields'].append('kitchen_sequence')
        return result
