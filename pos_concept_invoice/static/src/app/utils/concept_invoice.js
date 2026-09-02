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
    if (order.is_invoiced || order.to_invoice || order.concept_invoice_name) {
        return false;
    }
    return !generatedUuids?.has(order.uuid);
}

/**
 * Opens the concept popup and, on confirm, creates the invoice server-side,
 * updates the order reactively to reflect the concept invoice on the receipt,
 * and sends the receipt directly to the POS printer. Shared by the ReceiptScreen
 * (right after payment) and the TicketScreen (later, from the order list).
 *
 * @param {object} params
 * @param {object} params.order
 * @param {object} params.services – { orm, dialog, notification, pos }
 * @param {(order: object) => void} [params.onGenerated]
 */
export async function openConceptInvoiceDialog({ order, services, onGenerated }) {
    if (!order) {
        return;
    }
    const { orm, dialog, notification, pos } = services;

    // Pre-flight: the concept line needs exactly one VAT tax and an income
    // account resolvable from the order's own company. Checking here means a
    // misconfigured company is reported before the cashier types the concept,
    // instead of surfacing as an opaque ARCA error once the payment is done.
    try {
        const check = await orm.call("pos.order", "check_concept_invoice_config", [order.uuid]);
        if (!check.ok) {
            notification.add(check.message, { type: "danger", sticky: true });
            return;
        }
    } catch (error) {
        notification.add(
            error?.data?.message || "No se pudo validar la configuración de la factura concepto.",
            { type: "danger", sticky: true }
        );
        return;
    }

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

            // 1. Update reactive order model so the receipt screen immediately displays the concept invoice
            order.is_invoiced = true;
            order.to_invoice = true;
            order.account_move = result.invoice_id;
            order.concept_invoice_name = result.concept;

            if (result.partner_id) {
                const partnerObj = order.models?.["res.partner"]?.get(result.partner_id);
                if (partnerObj) {
                    order.partner_id = partnerObj;
                } else if (result.partner) {
                    order.partner_id = result.partner;
                }
            }

            order.l10n_latam_document_number = result.l10n_latam_document_number;
            order.l10n_ar_document_type_name = result.l10n_ar_document_type_name;
            order.l10n_ar_document_type_code = result.l10n_ar_document_type_code;
            order.l10n_ar_letter = result.l10n_ar_letter;
            order.l10n_ar_afip_auth_code = result.l10n_ar_afip_auth_code;
            order.l10n_ar_afip_auth_code_due = result.l10n_ar_afip_auth_code_due;
            order.l10n_ar_afip_qr_code = result.l10n_ar_afip_qr_code;
            order.l10n_ar_company_cuit = result.l10n_ar_company_cuit;
            order.l10n_ar_company_responsibility = result.l10n_ar_company_responsibility;
            order.l10n_ar_tax_details = result.l10n_ar_tax_details;
            order.l10n_ar_custom_tax_summary = result.l10n_ar_custom_tax_summary;

            notification.add(`✓ Factura ${result.invoice_name} generada`, { type: "success" });
            onGenerated?.(order);

            // 2. Automatically print the concept invoice receipt directly through POS printer
            const posStore = pos || order.pos;
            if (posStore) {
                try {
                    await posStore.printReceipt({ order });
                } catch (e) {
                    console.warn("[concept_invoice] Direct print failed:", e);
                }
            }
        },
    });
}
