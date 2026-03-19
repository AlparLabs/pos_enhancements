from odoo import fields, models

class PosOrder(models.Model):
    _inherit = 'pos.order'

    course_ids = fields.One2many('restaurant.order.course', 'order_id', string="Courses")

    def read_pos_data(self, data, config):
        result = super().read_pos_data(data, config)
        result['restaurant.order.course'] = self.env['restaurant.order.course']._load_pos_data_read(self.course_ids, config)
        return result
