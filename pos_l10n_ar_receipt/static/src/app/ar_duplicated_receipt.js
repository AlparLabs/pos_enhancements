import { Component } from "@odoo/owl";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

/**
 * Renders the receipt twice (ORIGINAL + DUPLICADO) inside a single component so
 * it can be printed as ONE print job. Printing the receipt with two separate
 * printer.print() calls deadlocks the shared single-slot POS renderer when web
 * printing (printWeb's window.print blocks the thread), so both copies must live
 * in one render.
 */
export class ArDuplicatedReceipt extends Component {
    static template = "pos_l10n_ar_receipt.ArDuplicatedReceipt";
    static components = { OrderReceipt };
    static props = {
        order: Object,
        basic_receipt: { type: Boolean, optional: true },
    };
    static defaultProps = {
        basic_receipt: false,
    };
}
