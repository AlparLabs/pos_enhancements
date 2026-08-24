/** @odoo-module **/

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import {
    canCreateConceptInvoice,
    openConceptInvoiceDialog,
} from "@pos_concept_invoice/app/utils/concept_invoice";

/**
 * The "Factura Concepto" button belongs on the screen the cashier is already
 * looking at when the customer asks for an invoice: the post-payment screen.
 *
 * The 19.0 port had moved it to the TicketScreen on the premise that
 * ReceiptScreen was removed in v19. It was not — point_of_sale.ReceiptScreen
 * is alive and is exactly the "Pago exitoso" screen with the print buttons.
 */
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this._conceptOrm = useService("orm");
        this._conceptReport = useService("report");
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

    clickConceptInvoice() {
        openConceptInvoiceDialog({
            order: this.currentOrder,
            services: {
                orm: this._conceptOrm,
                dialog: this.dialog,
                notification: this.notification,
                report: this._conceptReport,
            },
            onGenerated: (order) => this._conceptInvoiced.uuids.add(order.uuid),
        });
    },
});
