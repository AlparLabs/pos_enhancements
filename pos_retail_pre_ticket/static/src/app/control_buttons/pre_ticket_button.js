/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { useService } from "@web/core/utils/hooks";
import { PreTicketReceipt } from "@pos_retail_pre_ticket/app/receipt/pre_ticket_receipt";

export class PreTicketButton extends Component {
    static template = "pos_retail_pre_ticket.PreTicketButton";
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

        // Generate the receipt data using standard POS formatting methods
        const headerData = this.pos.getReceiptHeaderData(order);
        const receiptData = {
            ...headerData,
            ...order.export_for_printing(this.pos.session._base_url, headerData),
        };

        // Use the standard POS printer service to print our custom QWeb template
        await this.printer.print(
            PreTicketReceipt,
            {
                data: receiptData,
                formatCurrency: this.env.utils.formatCurrency,
            },
            { webPrintFallback: true }
        );
    }
}

Object.assign(ControlButtons.components, { PreTicketButton });
