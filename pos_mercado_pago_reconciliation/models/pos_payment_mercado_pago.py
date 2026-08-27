import logging
from datetime import timezone

from dateutil import parser as dateutil_parser

from odoo import api, models

from odoo.addons.pos_mercado_pago_alpy.models.mercado_pago_post_request import (
    MercadoPagoPosRequest,
)
from odoo.addons.pos_mercado_pago_alpy.models.pos_payment_method import (
    MP_TERMINAL_TYPES,
)

_logger = logging.getLogger(__name__)


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    @api.model
    def _settlement_pending_domain(self):
        """Narrow the generic sweep to payments this processor can answer for."""
        return super()._settlement_pending_domain() + [
            ('payment_method_id.use_payment_terminal', 'in', list(MP_TERMINAL_TYPES)),
        ]

    def _settlement_fetch_values(self):
        self.ensure_one()
        method = self.payment_method_id
        if method.use_payment_terminal not in MP_TERMINAL_TYPES:
            return super()._settlement_fetch_values()

        # mp_bearer_token is restricted to group_pos_manager, so it needs sudo().
        token = method.sudo().mp_bearer_token
        if not token:
            _logger.warning(
                "Settlement: no Mercado Pago token on payment method %s", method.id)
            return None

        response = self._mp_resolve_payment(MercadoPagoPosRequest(token))
        if not response:
            return None

        transaction_details = response.get('transaction_details') or {}
        fee_total = sum(
            fee.get('amount') or 0.0 for fee in (response.get('fee_details') or []))
        return {
            'settlement_net_amount': transaction_details.get('net_received_amount') or 0.0,
            'settlement_fee_amount': fee_total,
            'settlement_status': response.get('status_detail') or '',
            'settlement_release_date': self._mp_parse_release_date(
                response.get('money_release_date')),
        }

    def _mp_resolve_payment(self, mercado_pago):
        """Find this payment on Mercado Pago, by id first and by reference second.

        The Orders API can hand back an alphanumeric payment id, which the
        /v1/payments/{id} endpoint does not accept -- hence the search fallback.
        call_mercado_pago never raises; it returns {'errorMessage': ...}, which has
        no 'id' and therefore falls through.
        """
        self.ensure_one()
        if self.mp_payment_id and self.mp_payment_id.isdigit():
            response = mercado_pago.call_mercado_pago(
                "get", f"/v1/payments/{self.mp_payment_id}", {})
            if response.get('id'):
                return response

        if self.mp_external_reference:
            search = mercado_pago.call_mercado_pago("get", "/v1/payments/search", {
                'external_reference': self.mp_external_reference,
                'sort': 'date_created',
                'criteria': 'desc',
            })
            results = search.get('results') or []
            response = next(
                (r for r in results if r.get('status') == 'approved'),
                results[0] if results else None,
            )
            if response and response.get('id'):
                return response

        _logger.warning(
            "Settlement: could not resolve pos.payment %s on Mercado Pago "
            "(mp_payment_id=%s, external_reference=%s)",
            self.id, self.mp_payment_id, self.mp_external_reference)
        return None

    @api.model
    def _mp_parse_release_date(self, raw):
        """Parse money_release_date into a naive UTC datetime, or False."""
        if not raw:
            return False
        try:
            parsed = dateutil_parser.isoparse(raw)
        except (ValueError, OverflowError):
            _logger.warning("Settlement: unparseable money_release_date %r", raw)
            return False
        if parsed.tzinfo:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
