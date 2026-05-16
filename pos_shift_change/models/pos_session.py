from odoo import models, fields, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = 'pos.session'

    # -------------------------------------------------------------------------
    # Override draft-order blocking guards
    # -------------------------------------------------------------------------

    def _cannot_close_session(self, bank_payment_method_diffs=None):
        """Skip the draft-order check during a shift change close.

        The context flag ``pos_shift_change`` is set by ``close_session_shift_change``.
        """
        if self.env.context.get('pos_shift_change'):
            bank_payment_method_diffs = bank_payment_method_diffs or {}
            if self.state == 'closed':
                return {
                    'successful': False,
                    'type': 'alert',
                    'title': 'Session already closed',
                    'message': _(
                        "The session has been already closed by another User. "
                        "All sales completed in the meantime have been saved in a "
                        "Rescue Session, which can be reviewed anytime and posted "
                        "to Accounting from Point of Sale's dashboard."
                    ),
                    'redirect': True,
                }
            if bank_payment_method_diffs:
                no_loss_account = self.env['account.journal']
                no_profit_account = self.env['account.journal']
                for payment_method in self.env['pos.payment.method'].browse(
                    bank_payment_method_diffs.keys()
                ):
                    journal = payment_method.journal_id
                    compare_to_zero = self.currency_id.compare_amounts(
                        bank_payment_method_diffs.get(payment_method.id), 0
                    )
                    if compare_to_zero == -1 and not journal.loss_account_id:
                        no_loss_account |= journal
                    elif compare_to_zero == 1 and not journal.profit_account_id:
                        no_profit_account |= journal
                message = ''
                if no_loss_account:
                    message += _(
                        "Need loss account for the following journals to post the "
                        "lost amount: %s\n",
                        ', '.join(no_loss_account.mapped('name'))
                    )
                if no_profit_account:
                    message += _(
                        "Need profit account for the following journals to post the "
                        "gained amount: %s",
                        ', '.join(no_profit_account.mapped('name'))
                    )
                if message:
                    return {'successful': False, 'message': message, 'redirect': False}
            return None
        return super()._cannot_close_session(bank_payment_method_diffs)

    def action_pos_session_closing_control(
        self, balancing_account=False, amount_to_balance=0, bank_payment_method_diffs=None
    ):
        """Skip the draft-order UserError during a shift change."""
        bank_payment_method_diffs = bank_payment_method_diffs or {}
        if self.env.context.get('pos_shift_change'):
            for session in self:
                if session.state == 'closed':
                    raise UserError(_('This session is already closed.'))
                stop_at = self.stop_at or fields.Datetime.now()
                session.write({'state': 'closing_control', 'stop_at': stop_at})
                if not session.config_id.cash_control:
                    return session.action_pos_session_close(
                        balancing_account, amount_to_balance, bank_payment_method_diffs
                    )
                if session.rescue and session.config_id.cash_control:
                    default_cash_payment_method_id = self.payment_method_ids.filtered(
                        lambda pm: pm.type == 'cash'
                    )[0]
                    orders = self._get_closed_orders()
                    total_cash = sum(
                        orders.payment_ids.filtered(
                            lambda p: p.payment_method_id == default_cash_payment_method_id
                        ).mapped('amount')
                    ) + self.cash_register_balance_start
                    session.cash_register_balance_end_real = total_cash
                return session.action_pos_session_validate(
                    balancing_account, amount_to_balance, bank_payment_method_diffs
                )
        return super().action_pos_session_closing_control(
            balancing_account, amount_to_balance, bank_payment_method_diffs
        )

    def _check_if_no_draft_orders(self):
        """Allow draft orders when performing a shift change close."""
        if self.env.context.get('pos_shift_change'):
            return
        return super()._check_if_no_draft_orders()

    # -------------------------------------------------------------------------
    # New RPC method: close_session_shift_change
    # -------------------------------------------------------------------------

    def close_session_shift_change(self, bank_payment_method_diff_pairs=None,
                                    counted_cash=None, closing_notes=''):
        """Close the session for a shift change.

        Transfers draft orders to a new continuation session.
        All draft-order guards are bypassed via the ``pos_shift_change`` context flag.
        """
        self.ensure_one()

        draft_orders = self.get_session_orders().filtered(lambda o: o.state == 'draft')
        draft_count = len(draft_orders)
        draft_names = ', '.join(draft_orders.mapped('name')) if draft_orders else ''

        _logger.info(
            "POS Shift Change: closing session %s with %d open order(s): [%s]",
            self.name, draft_count, draft_names,
        )

        bank_payment_method_diffs = dict(bank_payment_method_diff_pairs or [])

        check_result = self.with_context(pos_shift_change=True)._cannot_close_session(
            bank_payment_method_diffs
        )
        if check_result:
            check_result['open_order_ids'] = draft_orders.ids
            return check_result

        if counted_cash is not None and self.config_id.cash_control:
            if not self.cash_journal_id:
                return {
                    'successful': False,
                    'message': _("There is no cash register in this session."),
                    'redirect': False,
                }
            self.cash_register_balance_end_real = counted_cash

        if self.state != 'closed':
            self.write({
                'state': 'closing_control',
                'stop_at': fields.Datetime.now(),
                'closing_notes': closing_notes or '',
            })
            self._post_cash_details_message(
                'Closing',
                self.cash_register_balance_end,
                self.cash_register_difference,
                closing_notes or '',
            )

        validate_result = self.with_context(pos_shift_change=True).action_pos_session_closing_control(
            bank_payment_method_diffs=bank_payment_method_diffs
        )

        if isinstance(validate_result, dict):
            return {
                'successful': False,
                'message': validate_result.get('name'),
                'redirect': True,
            }

        new_session = self.env['pos.session'].create({'config_id': self.config_id.id})

        if draft_orders:
            draft_orders.write({'session_id': new_session.id})

        closing_body = _(
            "Shift Change – Session Closed. "
            "%d open order(s) transferred to continuation session %s: %s",
            draft_count, new_session.name, draft_names or _('(none)'),
        )
        self.message_post(body=closing_body)

        new_session_body = _(
            "Shift Change – Session Opened. "
            "Continuation of %s. Received %d open order(s): %s",
            self.name, draft_count, draft_names or _('(none)'),
        )
        new_session.message_post(body=new_session_body)

        self.post_close_register_message()

        _logger.info(
            "POS Shift Change: session %s closed. Continuation %s created with %d order(s).",
            self.name, new_session.name, draft_count,
        )

        return {'successful': True, 'new_session_id': new_session.id}
