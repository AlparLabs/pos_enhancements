/** @odoo-module **/

import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { ConceptInvoicePopup } from "@pos_concept_invoice/app/concept_invoice_popup/concept_invoice_popup";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

/**
 * In Odoo 19, ReceiptScreen was removed. The concept invoice button migrated
 * to the TicketScreen, where finalized orders can be acted upon — consistent
 * with how pos_bar_single_ticket handles reprints in v19.
 *
 * After generating the invoice, the PDF is downloaded immediately via the
 * standard account invoice report (account.account_invoices), which includes
 * all AR fiscal data (CAE, QR code) natively through l10n_ar.
 */
patch(TicketScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this._conceptOrm = useService("orm");
        this._conceptDialog = useService("dialog");
        this._conceptNotification = useService("notification");
        this._conceptReport = useService("report");
        // Reactive set to hide the button after invoice is generated in this session,
        // without modifying the order model directly.
        this._conceptInvoiced = useState({ uuids: new Set() });
    },

    /**
     * Returns true when the "Factura Concepto" button should be shown.
     * Conditions: finalized order, no linked invoice, not yet generated this session.
     * @param {Object|null} order
     * @returns {boolean}
     */
    isConceptInvoiceAvailable(order) {
        if (!order?.finalized) return false;
        if (order.account_move) return false;
        if (this._conceptInvoiced.uuids.has(order.uuid)) return false;
        return true;
    },

    /**
     * Opens the ConceptInvoicePopup and, on confirm, calls the backend to create
     * the invoice and immediately downloads its PDF.
     * @param {Object} order - The selected synced (finalized) POS order
     * @returns {Promise<void>}
     */
    async clickConceptInvoice(order) {
        if (!order) return;

        this._conceptDialog.add(ConceptInvoicePopup, {
            order,
            onConfirm: async ({ concept, partnerId }) => {
                let result;
                try {
                    result = await this._conceptOrm.call(
                        "pos.order",
                        "create_concept_invoice",
                        [order.uuid, concept, partnerId || false]
                    );
                } catch (error) {
                    this._conceptNotification.add(
                        error?.data?.message || "Error al generar la factura concepto.",
                        { type: "danger", sticky: true }
                    );
                    return;
                }

                this._conceptNotification.add(
                    `✓ Factura ${result.invoice_name} generada`,
                    { type: "success" }
                );

                // Hide the button for this order for the rest of the session
                this._conceptInvoiced.uuids.add(order.uuid);

                // Download the invoice PDF immediately
                await this._conceptReport.doAction(
                    "account.account_invoices",
                    [result.invoice_id]
                );
            },
        });
    },
});
