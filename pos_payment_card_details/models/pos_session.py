from collections import defaultdict
from typing import Any

from odoo import models, _
from odoo.exceptions import UserError
from odoo.tools import float_is_zero


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _create_bank_payment_moves(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        For bank payment methods with ``use_terminal_details=True``, replace
        the single combined account.payment with one account.payment per lot
        number (``pos.payment.lot_number``).

        This lets the accounting team reconcile each lot from the card processor
        settlement report (Fiserv, Prisma, etc.) directly against an outstanding
        payment in Odoo, instead of trying to split one large combined entry.

        Payments without a lot number are grouped under a single "Sin Lote" entry
        so no money is lost.

        Known limitations
        -----------------
        - Multi-currency sessions: amount_converted is taken equal to amount.
        - Closing differences (``bank_payment_method_diffs``) entered for a
          terminal-detail method are not applied to the per-lot payments;
          record them as a separate adjustment if needed.

        Implementation note
        -------------------
        We pre-remove terminal-detail methods from ``combine_receivables_bank``
        before calling super() so the standard combine path never processes them.
        After super() finishes we append our lot-based entries to
        ``payment_method_to_receivable_lines`` so the existing reconciliation
        step picks them up unchanged.
        """
        combine_receivables_bank = data.get('combine_receivables_bank', {})
        MoveLine = data.get('MoveLine')

        # ── 1. Pull terminal methods out of the combine dict ──────────────────
        terminal_methods = {
            pm: amounts
            for pm, amounts in list(combine_receivables_bank.items())
            if pm.use_terminal_details
        }
        for pm in terminal_methods:
            combine_receivables_bank.pop(pm)

        # ── 2. Standard processing for all non-terminal methods ───────────────
        data = super()._create_bank_payment_moves(data)

        if not terminal_methods:
            return data

        payment_method_to_receivable_lines = data.get('payment_method_to_receivable_lines', {})

        # ── 3. Per-lot processing for terminal-detail methods ─────────────────
        for method, amounts in terminal_methods.items():
            if not method.journal_id:
                continue

            # Read the payments from the same source the core accumulated
            # ``combine_receivables_bank`` from. A plain search on the session would
            # also pick up payments belonging to draft/cancelled orders, which the
            # core excludes via _get_closed_orders(); those extra receivable lines
            # would leave self.move_id unbalanced.
            payments = self._get_closed_orders().payment_ids.filtered(
                lambda p, m=method: p.payment_method_id == m
            )

            # Group payment amounts by lot number
            lots = defaultdict(float)
            for payment in payments:
                lot_key = payment.lot_number or _('Sin Lote')
                lots[lot_key] += payment.amount

            # The per-lot split replaces what super() would have posted for this
            # method, so it has to add up to exactly the same total. If it ever
            # diverges, fail at closing time instead of writing an entry that
            # silently does not balance.
            split_total = sum(lots.values())
            if self.currency_id.compare_amounts(split_total, amounts['amount']) != 0:
                raise UserError(_(
                    "Cannot close the session: the per-lot breakdown for payment "
                    "method %(method)s adds up to %(split)s, but the session "
                    "accumulated %(expected)s for it.",
                    method=method.name,
                    split=split_total,
                    expected=amounts['amount'],
                ))

            destination_account = self._get_receivable_account(method)
            method_lines = self.env['account.move.line']

            for lot_number, amount in lots.items():
                if float_is_zero(amount, precision_rounding=self.currency_id.rounding):
                    continue

                # For single-currency sessions amount == amount_converted.
                # Multi-currency support can be added via _amount_converter() if needed.
                amount_converted = amount
                payment_type = 'inbound' if amount > 0 else 'outbound'

                # a) Receivable move line inside the POS closing journal entry
                receivable_vals = self._debit_amounts(
                    {
                        'account_id': destination_account.id,
                        'move_id': self.move_id.id,
                        'name': 'Lote %s — %s' % (lot_number, method.name),
                        'display_type': 'payment_term',
                    },
                    amount,
                    amount_converted,
                )
                combine_receivable_line = MoveLine.create(receivable_vals)

                # b) account.payment with lot reference in the memo/label
                account_payment = self.env['account.payment'].with_context(pos_payment=True).create({
                    'amount': abs(amount),
                    'journal_id': method.journal_id.id,
                    'force_outstanding_account_id': method.outstanding_account_id.id,
                    'destination_account_id': destination_account.id,
                    'memo': _('Lote %(lot)s — %(method)s (%(session)s)',
                              lot=lot_number, method=method.name, session=self.name),
                    'pos_payment_method_id': method.id,
                    'pos_session_id': self.id,
                    'company_id': self.company_id.id,
                    'payment_type': payment_type,
                })
                self._ensure_payment_outstanding_account(account_payment, amount)
                account_payment.action_post()

                payment_receivable_line = account_payment.move_id.line_ids.filtered(
                    lambda l, acct=destination_account: l.account_id == acct
                )
                method_lines |= combine_receivable_line | payment_receivable_line

            # All lot lines for this method are reconciled together in the
            # existing _reconcile_account_move_lines() step (they net to zero).
            payment_method_to_receivable_lines[method] = method_lines

        data['payment_method_to_receivable_lines'] = payment_method_to_receivable_lines
        return data
