/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { useService } from "@web/core/utils/hooks";
import { shouldSplitLine, printBarTicketsForOrder } from "@pos_bar_single_ticket/app/utils/bar_ticket_utils";

export class BarTicketButton extends Component {
    static template = "pos_bar_single_ticket.BarTicketButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.printer = useService("printer");
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get isOrderFinalized() {
        const order = this.currentOrder;
        return !order || order.finalized || order.state === "done";
    }

    get hasPrintableLines() {
        const order = this.currentOrder;
        if (!order || order.get_orderlines().length === 0) {
            return false;
        }
        return order.get_orderlines().some((line) => {
            const printed = line.bar_ticket_printed_qty || 0;
            return shouldSplitLine(line) && line.get_quantity() > printed;
        });
    }

    async click() {
        await printBarTicketsForOrder(
            this.currentOrder,
            this.pos,
            this.printer,
            this.env
        );
    }
}

Object.assign(ControlButtons.components, { BarTicketButton });
