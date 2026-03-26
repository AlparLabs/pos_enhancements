/** @odoo-module **/

import { BarTicketReceipt } from "@pos_bar_single_ticket/app/receipt/bar_ticket_receipt";

/**
 * Returns true if the given orderline belongs to a POS category
 * that has the "Print Single Ticket" flag enabled.
 * @param {import("@point_of_sale/app/models/pos_order_line").PosOrderline} line
 * @returns {boolean}
 */
export function shouldSplitLine(line) {
    const product = line.get_product();
    if (!product) {
        return false;
    }
    const categories = product.pos_categ_ids || [];
    return categories.some((categ) => categ.x_print_single_ticket);
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
        if (!shouldSplitLine(line) || line.bar_ticket_paid_and_printed) {
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
        if (!shouldSplitLine(line)) {
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
