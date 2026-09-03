/** @odoo-module **/

import { OrderPaymentValidation } from "@point_of_sale/app/utils/order_payment_validation";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import {
    getPendingBarTicketLines,
    printBarTicketsForLines,
    setBarTicketPrinted,
} from "@pos_bar_single_ticket/app/utils/bar_ticket_utils";

/**
 * Bar tickets are printed from afterOrderValidation, which the core calls at
 * the end of finalizeValidation: the order has already been created by
 * syncAllOrders, so the server has assigned its receipt number
 * (pos.order.pos_reference), and the customer receipt has not been queued yet.
 *
 * Hooking here instead of after PaymentScreen.validateOrder() matters because
 * with "print receipt automatically" + "skip receipt screen" the core does NOT
 * await finalizeValidation: shouldHideValidationBehindFeedbackScreen hands the
 * promise to the FeedbackScreen as `waitFor` and navigates away, so
 * validateOrder resolves while the order is still syncing and there is no
 * receipt number yet.
 *
 * afterOrderValidation is also called by handleValidationError when the sync
 * failed with ConnectionLostError, so a POS that went offline still gets its
 * bar tickets — without the receipt number, which does not exist yet then.
 */
patch(OrderPaymentValidation.prototype, {
    /**
     * The paid-and-printed gate is a real pos.order.line field, so it must be
     * set BEFORE finalizeValidation syncs the order for it to be persisted,
     * and rolled back whenever the validation does not go through.
     */
    async validateOrder(isForceValidate) {
        this._barTicketPendingUuids = getPendingBarTicketLines(this.order, this.pos).map(
            (line) => line.uuid
        );
        setBarTicketPrinted(this.order, this._barTicketPendingUuids, true);

        let validated;
        try {
            validated = await super.validateOrder(...arguments);
        } catch (error) {
            this._rollbackBarTickets();
            throw error;
        }

        // Falsy result: the core returned early (cancelled dialog, invalid
        // order, cash rounding), so finalizeValidation never ran.
        if (!validated) {
            this._rollbackBarTickets();
        }
        return validated;
    },

    /**
     * Print the bar tickets before the core queues the customer receipt, so the
     * bar gets its tickets first.
     */
    async afterOrderValidation() {
        const pendingUuids = this._barTicketPendingUuids || [];
        this._barTicketPendingUuids = [];

        try {
            await printBarTicketsForLines(
                this.order,
                pendingUuids,
                this.pos.env.services.printer
            );
        } catch (error) {
            // The client has already paid and the order is already synced, so a
            // printer problem must not break the flow: warn the cashier instead,
            // the tickets can be recovered with the supervisor reprint.
            console.error("pos_bar_single_ticket: bar tickets could not be printed", error);
            this.pos.env.services.notification.add(
                _t('No se pudieron imprimir los tickets de barra. Usá "Reimprimir Barra".'),
                { type: "danger", title: _t("Error de impresión") }
            );
        }

        return super.afterOrderValidation(...arguments);
    },

    /**
     * On an RPCError the core puts the order back in draft so the cashier can
     * retry paying; the gate has to follow, otherwise that retry would skip the
     * bar tickets. A ConnectionLostError leaves the order paid and pending sync,
     * and its tickets were already printed by afterOrderValidation.
     */
    handleValidationError(error) {
        const result = super.handleValidationError(...arguments);
        if (this.order?.state === "draft") {
            this._rollbackBarTickets();
        }
        return result;
    },

    _rollbackBarTickets() {
        setBarTicketPrinted(this.order, this._barTicketPendingUuids || [], false);
        this._barTicketPendingUuids = [];
    },
});
