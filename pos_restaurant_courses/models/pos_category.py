from odoo import fields, models

class PosCategory(models.Model):
    _inherit = 'pos.category'

    course_id = fields.Many2one('pos.course', string='Course')
