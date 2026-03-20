from odoo import api, fields, models

class PosCategory(models.Model):
    _inherit = 'pos.category'

    course_id = fields.Many2one('pos.course', string='Course')

    @api.model
    def _load_pos_data_fields(self, config_id):
        result = super()._load_pos_data_fields(config_id)
        result.append('course_id')
        return result
