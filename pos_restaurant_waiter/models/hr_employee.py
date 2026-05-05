# -*- coding: utf-8 -*-
from odoo import models, api


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    @api.model
    def _load_pos_data_fields(self, config_id):
        """
        Remove 'partner_id' from the fields loaded for hr.employee in the POS.

        Context:
          pos_hr loads hr.employee with partner_id in its field list.
          When pos_restaurant_waiter exposes waiter_id on pos.order, Odoo 18's
          reactive model system resolves the full relationship chain:
            pos.order.waiter_id → hr.employee → hr.employee.partner_id → res.partner

          Employee partners (home/work addresses) are NOT in the POS partner
          domain, so models["res.partner"].get(employee_partner_id) returns
          undefined. Any attempt to process that undefined record causes:
            TypeError: Cannot convert undefined or null to object (Object.entries)

          By removing partner_id from the employee fields loaded in POS, we
          break the cascade before it reaches res.partner, preventing the crash.

          All POS functionality that depends on employees (pin, name, role_ids)
          continues to work normally — partner_id is not used by POS UI logic.
        """
        params = super()._load_pos_data_fields(config_id)
        if 'partner_id' in params:
            params.remove('partner_id')
        return params
