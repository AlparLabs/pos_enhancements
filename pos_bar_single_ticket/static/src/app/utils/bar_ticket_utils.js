/** @odoo-module **/

/* global Sha1 */

import { BarTicketReceipt } from "@pos_bar_single_ticket/app/receipt/bar_ticket_receipt";
import { NumberPopup } from "@point_of_sale/app/components/popups/number_popup/number_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

/**
 * Requests supervisor PIN verification before allowing a reprint.
 * Shared between BarReprintButton (product screen) and TicketScreen reprint.
 * @param {object} pos   – result of usePos()
 * @param {object} dialog – result of useService("dialog")
 * @param {object} notification – result of useService("notification")
 * @returns {Promise<boolean>}
 */
export async function requestSupervisorPin(pos, dialog, notification) {
    // If pos_hr employee login is not enabled, allow freely
    if (!pos.config.module_pos_hr) {
        return true;
    }

    // If the current cashier is already a manager, allow freely
    const cashier = pos.getCashier();
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

/**
 * Returns true when the order is a direct sale, i.e. it is not attached to a
 * restaurant table. Table orders are served through the regular kitchen/bar
 * order flow, so they must never emit individual bar tickets.
 *
 * `getTable()` is only patched onto PosOrder by pos_restaurant; when that
 * module is not installed there are no tables at all and every order counts
 * as a direct sale.
 * @param {import("@point_of_sale/app/models/pos_order").PosOrder} order
 * @returns {boolean}
 */
export function isDirectSaleOrder(order) {
    const table = order?.getTable ? order.getTable() : order?.table_id;
    return !table;
}

/**
 * Returns true if the given orderline belongs to a POS category
 * that has the "Print Single Ticket" flag enabled and is available
 * in the current POS configuration.
 * @param {import("@point_of_sale/app/models/pos_order_line").PosOrderline} line
 * @param {object} pos  – result of usePos()
 * @returns {boolean}
 */
export function shouldSplitLine(line, pos) {
    const product = line.getProduct();
    if (!product) {
        return false;
    }
    const categories = product.pos_categ_ids || [];
    return categories.some((categ) => {
        if (!categ || !categ.x_print_single_ticket) {
            return false;
        }
        // If the POS limits categories, only apply if the category is allowed.
        // iface_available_categ_ids holds record objects, so we must extract
        // their .id before comparing — includes() on objects never matches integers.
        if (pos?.config?.limit_categories && pos.config.iface_available_categ_ids?.length) {
            const allowedIds = pos.config.iface_available_categ_ids.map((c) => c.id ?? c);
            if (!allowedIds.includes(categ.id)) {
                return false;
            }
        }
        return true;
    });
}

/**
 * Prints one bar ticket per unit of the given line.
 * The receipt component reads everything it needs from the records.
 */
async function printTicketsForLine(line, order, printer) {
    const qty = line.getQuantity();
    for (let i = 0; i < qty; i++) {
        await printer.print(
            BarTicketReceipt,
            { order, line },
            { webPrintFallback: true }
        );
    }
}

/**
 * Resolves order lines by uuid instead of holding on to the record objects:
 * the payment flow syncs the order with the server in between marking the
 * lines and printing them, and that round-trip may swap the local records.
 * @param {import("@point_of_sale/app/models/pos_order").PosOrder} order
 * @param {string[]} uuids
 */
function linesByUuid(order, uuids) {
    if (!order || !uuids.length) {
        return [];
    }
    const wanted = new Set(uuids);
    return order.getOrderlines().filter((line) => wanted.has(line.uuid));
}

/**
 * Lines that still owe their individual bar tickets: bar-category lines of a
 * direct sale that have not been paid-and-printed yet.
 *
 * @param {import("@point_of_sale/app/models/pos_order").PosOrder} order
 * @param {object} pos  – result of usePos()
 * @returns {Array} the pending order lines
 */
export function getPendingBarTicketLines(order, pos) {
    if (!order || order.getOrderlines().length === 0) {
        return [];
    }

    // Bar tickets are for direct sales only — never for table orders.
    if (!isDirectSaleOrder(order)) {
        return [];
    }

    return order.getOrderlines().filter(
        (line) =>
            shouldSplitLine(line, pos) &&
            !line.bar_ticket_paid_and_printed &&
            line.getQuantity() > 0
    );
}

/**
 * Flips the `bar_ticket_paid_and_printed` gate on the given lines.
 *
 * bar_ticket_paid_and_printed is a real pos.order.line field, so it is
 * persisted with the order when it syncs to the server. It is therefore set
 * BEFORE the order is validated — so it travels with that very sync — and
 * rolled back when the validation does not go through.
 *
 * @param {import("@point_of_sale/app/models/pos_order").PosOrder} order
 * @param {string[]} uuids – uuids of the lines to update
 * @param {boolean} printed
 */
export function setBarTicketPrinted(order, uuids, printed) {
    for (const line of linesByUuid(order, uuids)) {
        line.update({ bar_ticket_paid_and_printed: printed });
    }
}

/**
 * Prints the individual bar tickets of the given lines.
 *
 * Called ONLY from the patched OrderPaymentValidation.afterOrderValidation:
 * tickets must never be printed before the client actually pays, and the
 * receipt number they carry (pos.order.pos_reference) is only assigned by the
 * server once the order is synced.
 *
 * @param {import("@point_of_sale/app/models/pos_order").PosOrder} order
 * @param {string[]} uuids – uuids of the lines to print, from getPendingBarTicketLines
 * @param {object} printer – result of useService("printer")
 */
export async function printBarTicketsForLines(order, uuids, printer) {
    for (const line of linesByUuid(order, uuids)) {
        await printTicketsForLine(line, order, printer);
    }
}

/**
 * Force-reprints bar tickets for ALL eligible lines in the order,
 * regardless of whether they were already printed.
 *
 * This is intended for supervisor use only (after PIN verification).
 * It does NOT reset the `bar_ticket_paid_and_printed` flag — the flag
 * remains true so normal auto-print logic is not affected.
 *
 * @param {import("@point_of_sale/app/models/pos_order").PosOrder} order
 * @param {object} pos  – result of usePos()
 * @param {object} printer – result of useService("printer")
 */
export async function reprintBarTicketsForOrder(order, pos, printer) {
    if (!order || order.getOrderlines().length === 0) {
        return;
    }

    // Bar tickets are for direct sales only — never for table orders.
    if (!isDirectSaleOrder(order)) {
        return;
    }

    for (const line of order.getOrderlines()) {
        if (!shouldSplitLine(line, pos) || line.getQuantity() <= 0) {
            continue;
        }
        await printTicketsForLine(line, order, printer);
    }
}
