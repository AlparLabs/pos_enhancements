from odoo import models
from odoo.tools.misc import formatLang as _format_lang


class ReportSalesBySalesperson(models.AbstractModel):
    # Short suffix (no "report_" prefix): the derived Postgres table name
    # must stay within the 63-character identifier limit.
    _name = 'report.pos_retail_cash_closure_reports.sales_by_salesperson'
    _description = 'POS Retail Sales by Salesperson Report'

    def _get_report_values(self, docids: list, data: dict | None = None) -> dict:
        env = self.env
        sessions = env['pos.session'].browse(docids)
        orders = env['pos.order'].search([
            ('session_id', 'in', sessions.ids),
            ('state', 'not in', ('draft', 'cancel')),
        ])

        groups = {}
        for order in orders:
            salesperson = (
                order.counter_salesperson_id
                or order.employee_id
                or order.user_id
            )
            key = (salesperson._name, salesperson.id) if salesperson else None
            name = salesperson.name if salesperson else 'Sin vendedor asignado'
            group = groups.setdefault(key, {
                'salesperson_name': name,
                'payment_totals': {},
                'total': 0.0,
            })
            for payment in order.payment_ids:
                method_name = payment.payment_method_id.name
                group['payment_totals'][method_name] = (
                    group['payment_totals'].get(method_name, 0.0) + payment.amount
                )
                group['total'] += payment.amount

        group_list = sorted(
            (
                {
                    'salesperson_name': group['salesperson_name'],
                    'payment_totals': [
                        {'name': name, 'amount': amount}
                        for name, amount in group['payment_totals'].items()
                    ],
                    'total': group['total'],
                }
                for group in groups.values()
            ),
            key=lambda group: group['salesperson_name'],
        )
        grand_total = sum(group['total'] for group in group_list)
        currency_id = sessions[0].currency_id if sessions else env.company.currency_id

        return {
            'docs': sessions,
            'currency_id': currency_id,
            # formatLang must be passed explicitly — it is NOT auto-injected in custom reports.
            'formatLang': lambda amount, **kwargs: _format_lang(env, amount, **kwargs),
            'groups': group_list,
            'grand_total': grand_total,
        }
