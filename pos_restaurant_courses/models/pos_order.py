from odoo import fields, models

class PosOrder(models.Model):
    _inherit = 'pos.order'

    course_ids = fields.One2many('restaurant.order.course', 'order_id', string="Courses")

    def read_pos_data(self, data, config_id):
        result = super().read_pos_data(data, config_id)
        if config_id:
            result['restaurant.order.course'] = self.course_ids.read(self.course_ids._load_pos_data_fields(config_id), load=False)
        else:
            result['restaurant.order.course'] = []
        return result
