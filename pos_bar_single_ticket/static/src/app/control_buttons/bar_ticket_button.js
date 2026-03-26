/** @odoo-module **/

/* global Sha1 */

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { useService } from "@web/core/utils/hooks";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";
import { shouldSplitLine, reprintBarTicketsForOrder } from "@pos_bar_single_ticket/app/utils/bar_ticket_utils";

/**
 * Requests supervisor PIN verification before allowing a reprint.
 * Reuses the same pattern as pos_discount_supervisor.
 */
async function requestSupervisorPin(pos, dialog, notification) {
    // If pos_hr employee login is not enabled, allow freely
    if (!pos.config.module_pos_hr) {
        return true;
    }

    // If the current cashier is already a manager, allow freely
    const cashier = pos.get_cashier();
    if (cashier?._role === "manager") {
        return true;
    }

    // Find all manager employees
    const employees = pos.models["hr.employee"] || [];
    const managers = employees.filter((e) => e._role === "manager");

    // If no managers configured, allow freely (degraded mode)
    if (!managers.length) {
        return true;
    }

    // Prompt for supervisor PIN
    const inputPin = await makeAwaitable(dialog, NumberPopup, {
        formatDisplayedValue: (x) => x.replace(/./g, "•"),
        title: _t("PIN de Supervisor Requerido"),
    });

    if (!inputPin) {
        return false;
    }

    const hashedPin = Sha1.hash(inputPin);
    const authorized = managers.some((m) => m._pin && m._pin === hashedPin);

    if (!authorized) {
        notification.add(_t("PIN incorrecto. Reimpresión no autorizada."), {
            type: "warning",
            title: _t("Acceso Denegado"),
        });
        return false;
    }
    return true;
}

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
            (line) => shouldSplitLine(line) && line.bar_ticket_paid_and_printed
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
