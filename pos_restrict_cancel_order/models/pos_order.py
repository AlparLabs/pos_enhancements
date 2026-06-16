from odoo import api, models, _


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model
    def log_cancel_supervisor(self, order_ids, employee_id):
        """Post a chatter note on each cancelled order identifying the manager."""
        self.check_access_rights('write')
        employee = self.env['hr.employee'].browse(employee_id)
        if not employee:
            return False
        for order in self.browse(order_ids):
            order.sudo().message_post(
                body=_("Orden cancelada por %(name)s", name=employee.name),
                message_type='comment',
                subtype_xmlid='mail.mt_note',
            )
        return True

    @api.model
    def log_orderline_removal(self, order_id, employee_id, description):
        """Post a chatter note when a manager removes or reduces an orderline.

        Called via RPC from the POS frontend after a line is deleted or its
        quantity is lowered. ``description`` is a human-readable string built on
        the frontend, e.g. ``"Coca-Cola: 3 → 0"``. Only synced orders (numeric
        ``order_id``) reach this method; offline removals are silently skipped.
        """
        self.check_access_rights('write')
        order = self.browse(order_id)
        if not order.exists():
            return False
        employee = self.env['hr.employee'].browse(employee_id)
        who = employee.name if employee.exists() else _("Desconocido")
        order.sudo().message_post(
            body=_("Ítem eliminado/reducido por %(name)s: %(desc)s",
                   name=who, desc=description),
            message_type='comment',
            subtype_xmlid='mail.mt_note',
        )
        return True
