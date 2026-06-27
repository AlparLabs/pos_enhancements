import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

patch(PosStore.prototype, {
    /**
     * After printing the ORIGINAL receipt, print a DUPLICADO copy when:
     *  - the POS config has the option enabled,
     *  - the order is an invoice (has an AR document type),
     *  - it is not a basic receipt and not the "print bill" / pre-cuenta action.
     * The copy is printed directly via the printer (it must NOT increment
     * nb_print: it is a control copy, not a reprint).
     */
    async printReceipt(opts = {}) {
        const result = await super.printReceipt(opts);

        // `printBillActionTriggered` is a core printReceipt() opt: it is true when
        // the print comes from the "print bill" / pre-cuenta action, which we skip.
        const { basic = false, order = this.getOrder(), printBillActionTriggered = false } = opts;

        const shouldPrintDuplicate =
            result &&
            this.config.l10n_ar_receipt_print_duplicate &&
            !basic &&
            !printBillActionTriggered &&
            Boolean(order?.l10n_ar_document_type_name);

        if (shouldPrintDuplicate) {
            order.uiState.l10nArReceiptCopy = "DUPLICADO";
            try {
                await this.printer.print(
                    OrderReceipt,
                    { order, basic_receipt: basic },
                    this.printOptions
                );
            } finally {
                // Clear back to the neutral state; the template falls back to
                // 'ORIGINAL' when this is unset.
                delete order.uiState.l10nArReceiptCopy;
            }
        }

        return result;
    },
});
