/** @odoo-module **/

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import {
    canCreateConceptInvoice,
    openConceptInvoiceDialog,
} from "@pos_concept_invoice/app/utils/concept_invoice";

/**
 * The "Factura Concepto" button belongs on the screen the cashier is already
 * looking at when the customer asks for an invoice: the post-payment screen.
 */
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.pos = usePos();
        this._conceptOrm = useService("orm");
        // Hides the button once the invoice exists, without touching the
        // order model — the server-side is_invoiced only refreshes on reload.
        this._conceptInvoiced = useState({ uuids: new Set() });
    },

    /**
     * @returns {boolean}
     */
    get isConceptInvoiceAvailable() {
        return canCreateConceptInvoice(this.currentOrder, this._conceptInvoiced.uuids);
    },

    async clickConceptInvoice() {
        await openConceptInvoiceDialog({
            order: this.currentOrder,
            services: {
                orm: this._conceptOrm,
                dialog: this.dialog,
                notification: this.notification,
                pos: this.pos,
            },
            onGenerated: (order) => this._conceptInvoiced.uuids.add(order.uuid),
        });
    },
});
