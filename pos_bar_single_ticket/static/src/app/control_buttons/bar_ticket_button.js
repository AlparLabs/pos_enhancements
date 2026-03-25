/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { useService } from "@web/core/utils/hooks";
import { BarTicketReceipt } from "@pos_bar_single_ticket/app/receipt/bar_ticket_receipt";

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

    get hasPrintableLines() {
        const order = this.currentOrder;
        if (!order || order.get_orderlines().length === 0) {
            return false;
        }
        return order.get_orderlines().some((line) => {
            const printed = line.bar_ticket_printed_qty || 0;
            return this._shouldSplitLine(line) && line.get_quantity() > printed;
        });
    }

    async click() {
        const order = this.currentOrder;
        if (!order || order.get_orderlines().length === 0) {
            return;
        }

        const lines = order.get_orderlines();
        const headerData = this.pos.getReceiptHeaderData(order);

        for (const line of lines) {
            const printed = line.bar_ticket_printed_qty || 0;
            if (this._shouldSplitLine(line) && line.get_quantity() > printed) {
                // Determine how many tickets to print
                const qtyToPrint = line.get_quantity() - printed;
                
                // Formulate isolated receipt payload for this specific line
                const isolatedReceiptData = {
                    ...headerData,
                    ...order.export_for_printing(this.pos.session._base_url, headerData),
                    // Override orderlines so it's JUST this single unit
                    orderlines: [{
                        ...line.getDisplayData(),
                        quantity: 1, 
                    }],
                    // Add POS name for the simplified receipt
                    pos_name: this.pos.config.name,
                    // Hide financial subtotals
                    amount_total: 0,
                    subtotal: 0,
                    tax_details: [],
                };

                // Fire N separate print jobs for this line
                for (let i = 0; i < qtyToPrint; i++) {
                    await this.printer.print(
                        BarTicketReceipt,
                        { 
                            data: isolatedReceiptData,
                            formatCurrency: this.env.utils.formatCurrency,
                        },
                        { webPrintFallback: true }
                    );
                }

                // Mark the line as printed to prevent re-printing
                line.bar_ticket_printed_qty = printed + qtyToPrint;
                
                // Mimic Order button to prevent silent deletions (pos_restaurant logic)
                if (typeof line.set_dirty === 'function') {
                    line.set_dirty(false);
                }
                if ('saved_quantity' in line) {
                    line.saved_quantity = line.get_quantity();
                }
            }
        }
    }

    _shouldSplitLine(line) {
        const product = line.get_product();
        if (!product) {
            return false;
        }
        const categories = product.pos_categ_ids || [];
        // `categories` in Odoo 18 are objects loaded from `pos_available_models`.
        return categories.some((categ) => categ.x_print_single_ticket);
    }
}

Object.assign(ControlButtons.components, { BarTicketButton });
