import logging
from typing import Any

from odoo import models

_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = 'pos.session'

    def action_pos_session_closing_control(
        self,
        balancing_account: Any = False,
        amount_to_balance: float = 0,
        bank_payment_method_diffs: Any = None,
    ) -> None:
        """Enrich Mercado Pago payments with reconciliation info (net amount,
        fees, release date) right before the session closing entries are
        created. Failures are logged and never block the closing.
        """
        for session in self:
            try:
                session.payment_ids._mp_fetch_reconciliation_info()
            except Exception:
                _logger.exception(
                    "Mercado Pago: failed to fetch reconciliation info for session %s",
                    session.name)
        return super().action_pos_session_closing_control(
            balancing_account, amount_to_balance, bank_payment_method_diffs)
