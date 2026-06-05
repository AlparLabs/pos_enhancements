from odoo import api, models, _


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model
    def log_cancel_supervisor(self, order_ids, employee_id):
        """Post a chatter note on each cancelled order identifying the manager."""
        employee = self.env['hr.employee'].browse(employee_id)
        for order in self.browse(order_ids):
            order.sudo().message_post(
                body=_("Orden cancelada por %(name)s", name=employee.name),
                message_type='comment',
                subtype_xmlid='mail.mt_note',
            )
