/** @odoo-module **/

/* global Sha1 */

import { BarTicketReceipt } from "@pos_bar_single_ticket/app/receipt/bar_ticket_receipt";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
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

/**
 * Returns true if the given orderline belongs to a POS category
 * that has the "Print Single Ticket" flag enabled and is available
 * in the current POS configuration.
 * @param {import("@point_of_sale/app/models/pos_order_line").PosOrderline} line
 * @param {object} pos  – result of usePos()
 * @returns {boolean}
 */
export function shouldSplitLine(line, pos) {
    const product = line.get_product();
    if (!product) {
        return false;
    }
    const categories = product.pos_categ_ids || [];
    return categories.some((categ) => {
        if (!categ || !categ.x_print_single_ticket) {
            return false;
        }
        // If the POS limits categories, only apply if the category is allowed
        if (pos?.config?.limit_categories && pos.config.iface_available_categ_ids) {
            const categId = categ.id || categ;
            if (!pos.config.iface_available_categ_ids.includes(categId)) {
                return false;
            }
        }
        return true;
    });
}

/**
 * Builds the isolated receipt data for a single order line.
 */
function buildReceiptData(line, order, pos, headerData) {
    return {
        ...headerData,
        ...order.export_for_printing(pos.session._base_url, headerData),
        orderlines: [{
            ...line.getDisplayData(),
            quantity: 1,
        }],
        pos_name: pos.config.name,
        amount_total: 0,
        subtotal: 0,
        tax_details: [],
    };
}

/**
 * Prints individual bar tickets for every line that has not yet been
 * paid-and-printed. Marks `bar_ticket_paid_and_printed = true` on each line
 * after printing so they can never be auto-printed again.
 *
 * This is called ONLY from validateOrder (payment screen) to ensure tickets
 * are never printed before the client actually pays.
 *
 * @param {import("@point_of_sale/app/models/pos_order").PosOrder} order
 * @param {object} pos  – result of usePos()
 * @param {object} printer – result of useService("printer")
 * @param {object} env  – OWL component env (for formatCurrency)
 */
export async function printBarTicketsForOrder(order, pos, printer, env) {
    if (!order || order.get_orderlines().length === 0) {
        return;
    }

    const headerData = pos.getReceiptHeaderData(order);

    for (const line of order.get_orderlines()) {
        // Skip if already printed at payment time
        if (!shouldSplitLine(line, pos) || line.bar_ticket_paid_and_printed) {
            continue;
        }

        const qty = line.get_quantity();
        const receiptData = buildReceiptData(line, order, pos, headerData);

        for (let i = 0; i < qty; i++) {
            await printer.print(
                BarTicketReceipt,
                {
                    data: receiptData,
                    formatCurrency: env.utils.formatCurrency,
                },
                { webPrintFallback: true }
            );
        }

        // Mark as printed — this gate is permanent for this order line
        line.bar_ticket_paid_and_printed = true;
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
 * @param {object} env  – OWL component env (for formatCurrency)
 */
export async function reprintBarTicketsForOrder(order, pos, printer, env) {
    if (!order || order.get_orderlines().length === 0) {
        return;
    }

    const headerData = pos.getReceiptHeaderData(order);

    for (const line of order.get_orderlines()) {
        if (!shouldSplitLine(line, pos)) {
            continue;
        }

        const qty = line.get_quantity();
        if (qty <= 0) {
            continue;
        }

        const receiptData = buildReceiptData(line, order, pos, headerData);

        for (let i = 0; i < qty; i++) {
            await printer.print(
                BarTicketReceipt,
                {
                    data: receiptData,
                    formatCurrency: env.utils.formatCurrency,
                },
                { webPrintFallback: true }
            );
        }
    }
}
