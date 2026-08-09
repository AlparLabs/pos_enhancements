/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { printBarTicketsForOrder } from "@pos_bar_single_ticket/app/utils/bar_ticket_utils";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this._barTicketPos = usePos();
        this._barTicketPrinter = useService("printer");
    },

    async validateOrder(isForceValidate) {
        const order = this.currentOrder;

        // Print any unprinted bar tickets before finalizing the order
        if (order) {
            await printBarTicketsForOrder(order, this._barTicketPos, this._barTicketPrinter);
        }

        return super.validateOrder(...arguments);
    },
});
