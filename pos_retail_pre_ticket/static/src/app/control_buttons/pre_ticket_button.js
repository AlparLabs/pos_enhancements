/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useService } from "@web/core/utils/hooks";
import { PreTicketReceipt } from "@pos_retail_pre_ticket/app/receipt/pre_ticket_receipt";

export class PreTicketButton extends Component {
    static template = "pos_retail_pre_ticket.PreTicketButton";

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

        // Generate the receipt data using standard POS formatting methods
        const receiptData = order.export_for_printing();
        
        // Use the standard POS printer service to print our custom QWeb template
        await this.printer.print(
            PreTicketReceipt,
            { data: receiptData },
            { webPrintFallback: true }
        );
    }
}
