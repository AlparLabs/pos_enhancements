from odoo import api, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config):
        return super()._load_pos_data_models(config) + ['pos.cash.move.reason']

    def _get_cash_move_reason(self, session, reason_id):
        """Re-read the concept from the database.

        `extras` is built in the browser, so nothing inside it is trusted: the
        account and the contact mode always come from the record, never from the
        payload. `config_ids` is deliberately NOT checked here — it is a UI filter,
        not a security boundary. The POS caches its data when the session opens, so
        unlinking a concept from a terminal mid-shift would otherwise block the
        cashier on a button that is still drawn on screen.
        """
        empty = self.env['pos.cash.move.reason']
        if not reason_id:
            return empty
        reason = empty.sudo().browse(int(reason_id)).exists()
        if not reason or not reason.active or reason.company_id != session.company_id:
            return empty
        return reason

    def _prepare_account_bank_statement_line_vals(self, session, sign, amount, reason, partner_id, extras):
        vals = super()._prepare_account_bank_statement_line_vals(
            session, sign, amount, reason, partner_id, extras,
        )
        extras = extras or {}
        cash_reason = self._get_cash_move_reason(session, extras.get('cash_move_reason_id'))
        if not cash_reason:
            return vals

        vals['pos_cash_move_reason_id'] = cash_reason.id
        if cash_reason.account_id:
            # Not a stored field: account.bank.statement.line.create() pops this key and
            # uses it in place of the journal's suspense account.
            vals['counterpart_account_id'] = cash_reason.account_id.id

        counterpart_partner_id = False
        if cash_reason.partner_mode == 'fixed':
            counterpart_partner_id = cash_reason.partner_id.id
        elif cash_reason.partner_mode == 'ask':
            counterpart_partner_id = extras.get('counterpart_partner_id')
        if counterpart_partner_id:
            # exists() runs a bare SELECT with no record rules applied, so the id alone
            # proves nothing about who may use it. Partners are usually company-less and
            # shared; reject only one that is bound to a different company.
            partner = self.env['res.partner'].sudo().browse(int(counterpart_partner_id)).exists()
            if partner and partner.company_id in (False, session.company_id):
                vals['pos_counterpart_partner_id'] = partner.id
        return vals
