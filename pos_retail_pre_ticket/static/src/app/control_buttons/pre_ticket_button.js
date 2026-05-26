/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { useService } from "@web/core/utils/hooks";
import { PreTicketReceipt } from "@pos_retail_pre_ticket/app/receipt/pre_ticket_receipt";

export class PreTicketButton extends Component {
    static template = "pos_retail_pre_ticket.PreTicketButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.printer = useService("printer");
    }

    /**
     * @returns {import("@point_of_sale/app/models/pos_order").PosOrder|null}
     */
    get currentOrder() {
        return this.pos.getOrder();
    }

    /**
     * Print a pre-ticket (non-fiscal) for the current order.
     * @returns {Promise<void>}
     */
    async click() {
        const order = this.currentOrder;
        if (!order || order.getOrderlines().length === 0) {
            return;
        }
        await this.printer.print(PreTicketReceipt, { order }, { webPrintFallback: true });
    }
}

Object.assign(ControlButtons.components, { PreTicketButton });
