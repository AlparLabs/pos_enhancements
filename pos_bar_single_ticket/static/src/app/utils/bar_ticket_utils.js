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
 * Prints individual bar tickets for every unprinted line in the order.
 * Marks `bar_ticket_printed_qty` on each line to prevent re-printing.
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
        const printed = line.bar_ticket_printed_qty || 0;
        const qty = line.get_quantity();

        if (shouldSplitLine(line) && qty > printed) {
            const qtyToPrint = qty - printed;

            const isolatedReceiptData = {
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

            for (let i = 0; i < qtyToPrint; i++) {
                await printer.print(
                    BarTicketReceipt,
                    {
                        data: isolatedReceiptData,
                        formatCurrency: env.utils.formatCurrency,
                    },
                    { webPrintFallback: true }
                );
            }

            // Mark as printed
            line.bar_ticket_printed_qty = printed + qtyToPrint;
        }
    }
}
