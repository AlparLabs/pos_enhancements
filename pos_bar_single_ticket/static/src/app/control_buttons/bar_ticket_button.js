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

    async click() {
        const order = this.currentOrder;
        if (!order || order.get_orderlines().length === 0) {
            return;
        }

        const lines = order.get_orderlines();
        const headerData = this.pos.getReceiptHeaderData(order);

        for (const line of lines) {
            if (this._shouldSplitLine(line)) {
                // Determine how many tickets to print
                const qty = Math.max(1, Math.abs(line.get_quantity()));
                
                // Formulate isolated receipt payload for this specific line
                const isolatedReceiptData = {
                    ...headerData,
                    ...order.export_for_printing(this.pos.session._base_url, headerData),
                    // Override orderlines so it's JUST this single unit
                    orderlines: [{
                        ...line.getDisplayData(),
                        quantity: 1, 
                    }],
                    // Hide financial subtotals
                    amount_total: 0,
                    subtotal: 0,
                    tax_details: [],
                };

                // Fire N separate print jobs for this line
                for (let i = 0; i < qty; i++) {
                    await this.printer.print(
                        BarTicketReceipt,
                        { 
                            data: isolatedReceiptData,
                            formatCurrency: this.env.utils.formatCurrency,
                        },
                        { webPrintFallback: true }
                    );
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
