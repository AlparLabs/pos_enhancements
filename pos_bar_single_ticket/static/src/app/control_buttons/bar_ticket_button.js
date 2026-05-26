/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import {
    shouldSplitLine,
    reprintBarTicketsForOrder,
    requestSupervisorPin,
} from "@pos_bar_single_ticket/app/utils/bar_ticket_utils";

export class BarReprintButton extends Component {
    static template = "pos_bar_single_ticket.BarReprintButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.printer = useService("printer");
        this.notification = useService("notification");
        this.dialog = useService("dialog");
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get isOrderFinalized() {
        const order = this.currentOrder;
        return !order || order.finalized || order.state === "done";
    }

    /**
     * Show the button only when the order has at least one bar-ticket line
     * that has already been paid-and-printed (i.e., reprint makes sense).
     */
    get hasReprintableLines() {
        const order = this.currentOrder;
        if (!order || order.get_orderlines().length === 0) {
            return false;
        }
        return order.get_orderlines().some(
            (line) => shouldSplitLine(line, this.pos) && line.bar_ticket_paid_and_printed
        );
    }

    async click() {
        const authorized = await requestSupervisorPin(
            this.pos,
            this.dialog,
            this.notification
        );
        if (!authorized) {
            return;
        }

        await reprintBarTicketsForOrder(
            this.currentOrder,
            this.pos,
            this.printer,
            this.env
        );

        this.notification.add(_t("Tickets Barra reimpresos."), {
            type: "success",
            title: _t("Reimpresión OK"),
        });
    }
}

Object.assign(ControlButtons.components, { BarReprintButton });
