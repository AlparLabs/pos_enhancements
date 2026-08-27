import logging

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    settlement_net_amount = fields.Float(
        string='Settled Net Amount',
        readonly=True,
        help='Amount actually credited by the payment processor, gross minus fees.',
    )
    settlement_fee_amount = fields.Float(
        string='Settlement Fees',
        readonly=True,
        help='Total fees charged by the payment processor for this payment.',
    )
    settlement_release_date = fields.Datetime(
        string='Money Release Date',
        readonly=True,
        help='Date the processor releases the money to the account.',
    )
    settlement_status = fields.Char(
        string='Settlement Status',
        readonly=True,
        help="The processor's own status for this payment, stored verbatim.",
    )
    settlement_state = fields.Selection(
        [('pending', 'Pending'), ('settled', 'Settled')],
        string='Settlement',
        readonly=True,
        index=True,
        help='Pending means the processor has not given final figures yet, so the '
             'scheduled job will try again. Empty means this payment is not settled '
             'through any supported processor.',
    )
