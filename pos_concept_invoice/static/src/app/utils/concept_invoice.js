/** @odoo-module **/

import { ConceptInvoicePopup } from "@pos_concept_invoice/app/concept_invoice_popup/concept_invoice_popup";

/**
 * True when the order can still receive a concept invoice.
 *
 * We read `is_invoiced` and NOT `account_move`. In v19 the POS declares
 * account.move as a loaded model but its `_load_pos_data_domain` returns
 * False, so no move is ever preloaded; pos.load.mixin reads with
 * `load=False`, so the m2o arrives as a bare id and related_models refuses
 * to connect an id it cannot find. `order.account_move` is therefore
 * undefined for any order coming from the backend, invoiced or not.
 * `is_invoiced` is a plain boolean and always travels correctly.
 *
 * @param {import("@point_of_sale/app/models/pos_order").PosOrder} order
 * @param {Set<string>} generatedUuids – invoices generated in this session
 * @returns {boolean}
 */
export function canCreateConceptInvoice(order, generatedUuids) {
    if (!order?.finalized) {
        return false;
    }
    if (order.is_invoiced || order.to_invoice) {
        return false;
    }
    return !generatedUuids?.has(order.uuid);
}

/**
 * Opens the concept popup and, on confirm, creates the invoice server-side
 * and downloads its PDF. Shared by the ReceiptScreen (right after payment)
 * and the TicketScreen (later, from the order list).
 *
 * @param {object} params
 * @param {object} params.order
 * @param {object} params.services – { orm, dialog, notification, report }
 * @param {(order: object) => void} [params.onGenerated]
 */
export function openConceptInvoiceDialog({ order, services, onGenerated }) {
    if (!order) {
        return;
    }
    const { orm, dialog, notification, report } = services;

    dialog.add(ConceptInvoicePopup, {
        order,
        onConfirm: async ({ concept, partnerId }) => {
            let result;
            try {
                result = await orm.call("pos.order", "create_concept_invoice", [
                    order.uuid,
                    concept,
                    partnerId || false,
                ]);
            } catch (error) {
                notification.add(
                    error?.data?.message || "Error al generar la factura concepto.",
                    { type: "danger", sticky: true }
                );
                return;
            }

            notification.add(`✓ Factura ${result.invoice_name} generada`, { type: "success" });
            onGenerated?.(order);

            await report.doAction("account.account_invoices", [result.invoice_id]);
        },
    });
}
