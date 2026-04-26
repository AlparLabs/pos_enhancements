/** @odoo-module **/

import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { _t } from "@web/core/l10n/translation";
import {
    shouldSplitLine,
    reprintBarTicketsForOrder,
    requestSupervisorPin,
} from "@pos_bar_single_ticket/app/utils/bar_ticket_utils";

patch(TicketScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this._barTicketPos = usePos();
        this._barTicketPrinter = useService("printer");
        this._barTicketDialog = useService("dialog");
        this._barTicketNotification = useService("notification");
    },

    /**
     * Returns true if the given order has at least one bar-category line.
     * Used in the XML template to conditionally show the reprint button.
     * @param {object} order
     * @returns {boolean}
     */
    hasBarTicketLines(order) {
        if (!order || !order.get_orderlines) {
            return false;
        }
        const hasTable = order.getTable ? order.getTable() : order.table_id;
        if (hasTable) {
            return false;
        }
        return order.get_orderlines().some((line) => shouldSplitLine(line, this._barTicketPos));
    },

    /**
     * Called when the supervisor clicks "Reimprimir Barra" from the Ticket Screen.
     * Verifies the supervisor PIN then reprints all bar-category tickets.
     * @param {object} order – the selected synced (paid) order
     */
    async reprintBarTickets(order) {
        if (!order) {
            return;
        }

        const authorized = await requestSupervisorPin(
            this._barTicketPos,
            this._barTicketDialog,
            this._barTicketNotification
        );
        if (!authorized) {
            return;
        }

        await reprintBarTicketsForOrder(
            order,
            this._barTicketPos,
            this._barTicketPrinter,
            this.env
        );

        this._barTicketNotification.add(_t("Tickets Barra reimpresos."), {
            type: "success",
            title: _t("Reimpresión OK"),
        });
    },
});
