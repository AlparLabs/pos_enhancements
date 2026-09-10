/** @odoo-module **/

import { Component } from "@odoo/owl";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { formatCurrency } from "@web/core/currency";

export class PreCuentaReceipt extends Component {
    static template = "pos_restaurant_pre_cuenta.PreCuentaReceipt";
    static components = { ReceiptHeader, Orderline };
    static props = {
        order: Object,
    };

    formatCurrency(amount) {
        return formatCurrency(amount, this.props.order.currency.id);
    }

    get npsSurveyEnabled() {
        const config = this.props.order?.config;
        return Boolean(
            config?.nps_survey_enabled &&
            config?.nps_survey_on_pre_cuenta &&
            config?.nps_survey_url
        );
    }

    get npsSurveyUrl() {
        return this.props.order?.config?.nps_survey_url || "";
    }

    get npsReceiptTitle() {
        return this.props.order?.config?.nps_receipt_title || "¿Cómo fue tu experiencia?";
    }

    get npsReceiptSubtitle() {
        return this.props.order?.config?.nps_receipt_subtitle || "Escaneá el código QR y dejanos tu opinión.";
    }

    get npsSurveyQrCodeSrc() {
        const url = this.npsSurveyUrl;
        if (!url) {
            return "";
        }
        return `/report/barcode/?barcode_type=QR&width=140&height=140&value=${encodeURIComponent(url)}`;
    }
}
