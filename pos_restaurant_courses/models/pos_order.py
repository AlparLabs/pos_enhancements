from odoo import api, fields, models

class PosOrder(models.Model):
    _inherit = 'pos.order'

    course_ids = fields.One2many('restaurant.order.course', 'order_id', string="Courses")

    @api.model
    def _load_pos_data_fields(self, config_id):
        base_fields = super()._load_pos_data_fields(config_id)
        # Odoo 18 does not define any fields for pos.order in _load_pos_data_fields by default.
        return list(set(base_fields + ["course_ids"]))

    def read_pos_data(self, data, config_id):
        result = super().read_pos_data(data, config_id)
        # Ensure course data is included in the dictionary returned to the POS
        if config_id:
            all_courses = self.course_ids
            if all_courses:
                # Provide pos.order context as required by RestaurantOrderCourse._load_pos_data_domain
                load_context = {
                    'pos.config': {'data': [{'id': config_id}]},
                    'pos.order': {'data': [{'id': order.id} for order in self]}
                }
                result['restaurant.order.course'] = all_courses._load_pos_data(load_context)['data']
            else:
                result['restaurant.order.course'] = []
        return result

