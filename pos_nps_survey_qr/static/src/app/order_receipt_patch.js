/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

patch(OrderReceipt.prototype, {
    setup() {
        super.setup(...arguments);
        if (!this.pos) {
            try {
                this.pos = usePos();
            } catch {
                // Pos hook fallback if outside POS component hierarchy
            }
        }
    },

    get npsSurveyEnabled() {
        return Boolean(this.pos?.config?.nps_survey_enabled && this.pos?.config?.nps_survey_url);
    },

    get npsSurveyUrl() {
        return this.pos?.config?.nps_survey_url || "";
    },

    get npsReceiptTitle() {
        return this.pos?.config?.nps_receipt_title || "¿Cómo fue tu experiencia?";
    },

    get npsReceiptSubtitle() {
        return this.pos?.config?.nps_receipt_subtitle || "Escaneá el código QR y dejanos tu opinión.";
    },

    get npsSurveyQrCodeSrc() {
        const url = this.npsSurveyUrl;
        if (!url) {
            return "";
        }
        return `/report/barcode/?barcode_type=QR&width=140&height=140&value=${encodeURIComponent(url)}`;
    },
});
