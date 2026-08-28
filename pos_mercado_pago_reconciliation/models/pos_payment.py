import logging
from datetime import timedelta

from odoo import api, fields, models

_logger = logging.getLogger(__name__)

# How far back the scheduled job looks. A payment that never settles is abandoned
# rather than retried forever -- it simply stays 'pending', which is searchable.
SETTLEMENT_LOOKBACK_DAYS = 30
# Payments handled per run, so the first run on an existing database does not fire
# thousands of serial HTTP calls.
SETTLEMENT_BATCH_SIZE = 200
# Commit every N payments: a run that dies partway must not throw away the calls it
# already paid for.
SETTLEMENT_COMMIT_EVERY = 20


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

    @api.model
    def _settlement_pending_domain(self):
        """Which payments the scheduled job should sweep.

        This is the processor-agnostic half: not settled yet, and recent enough to
        be worth asking about. Each processor's module extends it with its own
        payment-method filter -- without that extension this would sweep every
        payment in the POS, cash included.
        """
        horizon = fields.Datetime.now() - timedelta(days=SETTLEMENT_LOOKBACK_DAYS)
        return [
            ('settlement_state', '!=', 'settled'),
            ('payment_date', '>=', horizon),
        ]

    def _settlement_fetch_values(self):
        """Provider hook: return a dict of settlement values, or None.

        The base implementation knows no processor and always declines. Each
        processor's module overrides this. Returning None means "could not resolve
        right now" and leaves the payment untouched for a later run.
        """
        self.ensure_one()
        return None

    def _settlement_fetch(self):
        """Ask each payment's processor for its settlement values and store them.

        A payment is only marked 'settled' once a release date came back. Anything
        less stays 'pending' so a later run tries again -- this is what stops a
        payment that was approved but not yet accredited from being frozen with
        incomplete figures.

        Nothing raises out of here: one bad payment must not abort the sweep.
        """
        for payment in self:
            try:
                values = payment._settlement_fetch_values()
            except Exception:
                _logger.exception(
                    "Settlement: provider failed for pos.payment %s", payment.id)
                continue
            if not values:
                continue
            values = dict(values)
            values['settlement_state'] = (
                'settled' if values.get('settlement_release_date') else 'pending')
            payment.write(values)

    @api.model
    def _cron_fetch_settlements(self):
        """Entry point for the scheduled job."""
        payments = self.search(
            self._settlement_pending_domain(),
            limit=SETTLEMENT_BATCH_SIZE,
            order='payment_date asc, id asc',
        )
        if not payments:
            return
        _logger.info("Settlement: sweeping %s payment(s)", len(payments))
        for index, payment in enumerate(payments, start=1):
            payment._settlement_fetch()
            if index % SETTLEMENT_COMMIT_EVERY == 0:
                self.env.cr.commit()
        self.env.cr.commit()
