# -*- coding: utf-8 -*-
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
        """Override to skip the draft-order check during a shift change close.

        In a normal close, Odoo blocks if any order is in 'draft' state.
        When we are doing a shift change, draft orders have already been
        transferred to a new session before this method is reached, so
        the check would be a false negative. The context flag
        ``pos_shift_change`` is set by ``close_session_shift_change``.
        """
        if self.env.context.get('pos_shift_change'):
            # Skip the draft-order guard; delegate to parent for all
            # other checks (already-closed, bank diffs, etc.)
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
            return None  # all checks passed
        return super()._cannot_close_session(bank_payment_method_diffs)

    def action_pos_session_closing_control(
        self, balancing_account=False, amount_to_balance=0, bank_payment_method_diffs=None
    ):
        """Override to skip the draft-order UserError during a shift change."""
        bank_payment_method_diffs = bank_payment_method_diffs or {}
        if self.env.context.get('pos_shift_change'):
            for session in self:
                # Skip the draft check (line 390–391 in core).
                # Replicate the rest of the original method.
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
        """Override to allow draft orders when performing a shift change close.

        At this point in a shift change, all draft orders have already been
        moved to the continuation session, so the check is always safe to
        skip. The context flag ensures we only skip intentionally.
        """
        if self.env.context.get('pos_shift_change'):
            return  # orders already transferred; nothing to block
        return super()._check_if_no_draft_orders()

    # -------------------------------------------------------------------------
    # New RPC method: close_session_shift_change
    # -------------------------------------------------------------------------

    def close_session_shift_change(self, bank_payment_method_diff_pairs=None,
                                    counted_cash=None, closing_notes=''):
        """Close the session for a shift change.

        All draft-order guards are bypassed via the ``pos_shift_change`` context
        flag.  Cash details and session-state transitions that would normally be
        done by separate frontend calls (``post_closing_cash_details`` and
        ``update_closing_control_state_session``) are handled here so that none
        of those helpers can block on draft orders before the context flag is
        active.

        Steps:
        1. Identify all draft orders in the current session.
        2. Record counted cash (if cash control is enabled) – skipping the
           draft-order guard that lives in ``post_closing_cash_details``.
        3. Transition the session to ``closing_control`` state and save notes.
        4. Close the current session (bypassing draft-order checks).
        5. Create a new continuation session for the same POS config.
        6. Transfer the draft orders to the new session.
        7. Log chatter messages on both sessions.

        Returns:
            dict with 'successful' key (True/False) and, on success,
            'new_session_id' pointing to the continuation session.
        """
        self.ensure_one()

        # Capture draft orders before closing (they still belong to this session).
        draft_orders = self.get_session_orders().filtered(
            lambda o: o.state == 'draft'
        )
        draft_count = len(draft_orders)
        draft_names = ', '.join(draft_orders.mapped('name')) if draft_orders else ''

        _logger.info(
            "POS Shift Change: closing session %s with %d open order(s) to transfer: [%s]",
            self.name,
            draft_count,
            draft_names,
        )

        bank_payment_method_diffs = dict(bank_payment_method_diff_pairs or [])

        # ------------------------------------------------------------------
        # Step 1: Validate (skipping the draft-order check via context flag)
        # ------------------------------------------------------------------
        check_result = self.with_context(
            pos_shift_change=True
        )._cannot_close_session(bank_payment_method_diffs)
        if check_result:
            open_order_ids = draft_orders.ids
            check_result['open_order_ids'] = open_order_ids
            return check_result

        # ------------------------------------------------------------------
        # Step 2: Record counted cash (cash control only)
        #   We do this ourselves instead of calling post_closing_cash_details
        #   because that method calls _cannot_close_session WITHOUT the
        #   pos_shift_change context, which would block on draft orders.
        # ------------------------------------------------------------------
        if counted_cash is not None and self.config_id.cash_control:
            if not self.cash_journal_id:
                return {
                    'successful': False,
                    'message': _("There is no cash register in this session."),
                    'redirect': False,
                }
            self.cash_register_balance_end_real = counted_cash

        # ------------------------------------------------------------------
        # Step 3: Transition to closing_control and save notes
        #   We replicate update_closing_control_state_session here so we stay
        #   inside the shift-change context the entire time.
        # ------------------------------------------------------------------
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

        # ------------------------------------------------------------------
        # Step 4: Close the session (draft-order guard bypassed via context)
        # ------------------------------------------------------------------
        validate_result = self.with_context(
            pos_shift_change=True
        ).action_pos_session_closing_control(
            bank_payment_method_diffs=bank_payment_method_diffs
        )

        if isinstance(validate_result, dict):
            # Imbalance accounting entry – redirect user to back-end.
            return {
                'successful': False,
                'message': validate_result.get('name'),
                'redirect': True,
            }

        # ------------------------------------------------------------------
        # Step 5: Create the continuation session
        # ------------------------------------------------------------------
        new_session = self.env['pos.session'].create({
            'config_id': self.config_id.id,
        })

        # ------------------------------------------------------------------
        # Step 6: Transfer draft orders to the continuation session
        # ------------------------------------------------------------------
        if draft_orders:
            draft_orders.write({'session_id': new_session.id})

        # ------------------------------------------------------------------
        # Step 7: Audit-trail chatter messages
        # ------------------------------------------------------------------
        closing_body = _(
            "🔄 Shift Change – Session Closed"
            "%d open order(s) transferred to continuation session "
            "%s: %s",
            draft_count,
            new_session.name,
            draft_names or _('(none)'),
        )
        self.message_post(body=closing_body)

        new_session_body = _(
            "🔄 Shift Change – Session Opened"
            "Continuation of %s. Received %d open order(s): %s",
            self.name,
            draft_count,
            draft_names or _('(none)'),
        )
        new_session.message_post(body=new_session_body)

        self.post_close_register_message()

        _logger.info(
            "POS Shift Change: session %s closed. Continuation session %s created with %d order(s).",
            self.name,
            new_session.name,
            draft_count,
        )

        return {
            'successful': True,
            'new_session_id': new_session.id,
        }
