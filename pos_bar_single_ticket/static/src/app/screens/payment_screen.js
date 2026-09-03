/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import {
    getPendingBarTicketLines,
    isOrderValidated,
    printBarTicketsForLines,
    setBarTicketPrinted,
} from "@pos_bar_single_ticket/app/utils/bar_ticket_utils";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this._barTicketPos = usePos();
        this._barTicketPrinter = useService("printer");
    },

    /**
     * Bar tickets are printed once the order has been validated, never before:
     * the client must have paid, and the receipt number printed on the ticket
     * (pos.order.pos_reference) is only assigned by the server when the order
     * is created during syncAllOrders, inside super.validateOrder().
     *
     * The paid-and-printed gate goes the other way round — it has to be set
     * before that sync so it is persisted with the order — hence the rollback
     * when the validation is cancelled or fails.
     */
    async validateOrder(isForceValidate) {
        const order = this.currentOrder;
        const pendingUuids = getPendingBarTicketLines(order, this._barTicketPos).map(
            (line) => line.uuid
        );
        setBarTicketPrinted(order, pendingUuids, true);

        let result;
        try {
            result = await super.validateOrder(...arguments);
        } catch (error) {
            setBarTicketPrinted(order, pendingUuids, false);
            throw error;
        }

        if (!isOrderValidated(order)) {
            setBarTicketPrinted(order, pendingUuids, false);
            return result;
        }

        await printBarTicketsForLines(order, pendingUuids, this._barTicketPrinter);
        return result;
    },
});
