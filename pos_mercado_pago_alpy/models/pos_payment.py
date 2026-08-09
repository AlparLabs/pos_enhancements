import logging
from datetime import timezone

from dateutil import parser as dateutil_parser

from odoo import fields, models

from .mercado_pago_post_request import MercadoPagoPosRequest
from .pos_payment_method import MP_TERMINAL_TYPES

_logger = logging.getLogger(__name__)


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    mp_payment_id = fields.Char(
        string='MP Payment ID',
        help='Mercado Pago payment identifier, captured when the payment is approved.',
    )
    mp_external_reference = fields.Char(
        string='MP External Reference',
        help='External reference sent to Mercado Pago when the payment was requested. '
             'Used to look the payment up when the payment id is not available.',
    )
    mp_net_amount = fields.Float(
        string='MP Net Amount',
        help='Net amount credited by Mercado Pago (gross minus fees). For bank reconciliation.',
    )
    mp_fee_amount = fields.Float(
        string='MP Fee',
        help='Total Mercado Pago fees for this payment (sum of fee_details).',
    )
    mp_release_date = fields.Datetime(
        string='MP Release Date',
        help='Date when Mercado Pago releases the money to the account (money_release_date).',
    )
    mp_status_detail = fields.Char(
        string='MP Status Detail',
        help='Mercado Pago status_detail (e.g. accredited).',
    )
    mp_info_fetched = fields.Boolean(
        string='MP Info Fetched',
        default=False,
        help='Set once the reconciliation info was successfully fetched from Mercado Pago.',
    )

    def _mp_fetch_reconciliation_info(self) -> None:
        """Fetch fee / net amount / release date from Mercado Pago for every
        MP payment in the recordset that was not enriched yet.

        Resolution order:
          1. ``GET /v1/payments/{id}`` when we captured a numeric payment id.
          2. ``GET /v1/payments/search?external_reference=...`` otherwise
             (also covers Orders-API alphanumeric payment ids).

        Network errors are logged and skipped — this must never block a
        session closing. The method is idempotent (``mp_info_fetched``),
        so it can be re-run manually or by a cron for missed payments.
        """
        for payment in self:
            method = payment.payment_method_id
            if method.use_payment_terminal not in MP_TERMINAL_TYPES or payment.mp_info_fetched:
                continue
            token = method.sudo().mp_bearer_token
            if not token:
                continue
            mercado_pago = MercadoPagoPosRequest(token)

            resp = None
            if payment.mp_payment_id and payment.mp_payment_id.isdigit():
                resp = mercado_pago.call_mercado_pago(
                    "get", f"/v1/payments/{payment.mp_payment_id}", {})
                if not resp.get('id'):
                    resp = None
            if resp is None and payment.mp_external_reference:
                search = mercado_pago.call_mercado_pago("get", "/v1/payments/search", {
                    'external_reference': payment.mp_external_reference,
                    'sort': 'date_created',
                    'criteria': 'desc',
                })
                results = search.get('results') or []
                resp = next(
                    (r for r in results if r.get('status') == 'approved'),
                    results[0] if results else None,
                )
            if not resp or not resp.get('id'):
                _logger.warning(
                    "Mercado Pago: could not resolve payment info for pos.payment %s "
                    "(mp_payment_id=%s, external_reference=%s)",
                    payment.id, payment.mp_payment_id, payment.mp_external_reference)
                continue

            transaction_details = resp.get('transaction_details') or {}
            fee_total = sum(
                fee.get('amount') or 0.0 for fee in (resp.get('fee_details') or []))
            vals = {
                'mp_payment_id': str(resp['id']),
                'mp_net_amount': transaction_details.get('net_received_amount') or 0.0,
                'mp_fee_amount': fee_total,
                'mp_status_detail': resp.get('status_detail') or '',
                'mp_info_fetched': True,
            }
            release_date = resp.get('money_release_date')
            if release_date:
                try:
                    release_dt = dateutil_parser.isoparse(release_date)
                    if release_dt.tzinfo:
                        release_dt = release_dt.astimezone(timezone.utc).replace(tzinfo=None)
                    vals['mp_release_date'] = release_dt
                except (ValueError, OverflowError):
                    _logger.warning(
                        "Mercado Pago: could not parse money_release_date %r", release_date)
            payment.write(vals)
            _logger.info(
                "Mercado Pago: reconciliation info stored for pos.payment %s "
                "(payment_id=%s, net=%s, fee=%s)",
                payment.id, vals['mp_payment_id'], vals['mp_net_amount'], vals['mp_fee_amount'])
