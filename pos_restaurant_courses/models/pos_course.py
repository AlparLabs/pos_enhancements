from odoo import api, fields, models, _

class PosCourse(models.Model):
    _name = 'pos.course'
    _description = 'POS Course'
    _inherit = ['pos.load.mixin']
    _order = 'sequence'

    def _default_sequence(self):
        return (self.search([], order="sequence desc", limit=1).sequence or 0) + 1

    name = fields.Char(string="Course Name", required=True)
    sequence = fields.Integer(string="Sequence", default=_default_sequence)
    category_ids = fields.One2many('pos.category', 'course_id', string="Pos Category")

    _sql_constraints = [
        ('name_unique', 'unique (name)', 'A course with this name already exists'),
    ]

    @api.model
    def _load_pos_data_domain(self, data):
        if not data.get('pos.config') or not data['pos.config'].get('data'):
            return [('id', '=', False)]
        config_id = self.env['pos.config'].browse(data['pos.config']['data'][0]['id'])
        pos_categ = config_id.limit_categories and config_id.iface_available_categ_ids.ids or []
        if not pos_categ:
            available_categ_ids = self.env['pos.category'].search([]).ids
        else:
            available_categ_ids = pos_categ
        return [('category_ids', 'in', available_categ_ids)]

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['name', 'sequence', 'category_ids']
