from odoo import fields, models

class PosOrder(models.Model):
    _inherit = 'pos.order'

    course_ids = fields.One2many('restaurant.order.course', 'order_id', string="Courses")

    @api.model
    def _load_pos_data_fields(self, config_id):
        return super()._load_pos_data_fields(config_id) + ["course_ids"]

    def read_pos_data(self, config_id, domain=None, fields=None, offset=0, limit=None, order=None):
        data = super().read_pos_data(config_id, domain, fields, offset, limit, order)
        # Ensure course data is included when reading order data (e.g. for reprinting or resuming)
        if config_id:
            data['restaurant.order.course'] = self.course_ids._load_pos_data({'pos.order': {'data': [{'id': self.id}]}})['data']
        return data

