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

    get showWaiter() {
        const order = this.props.order;
        const waiterName = order?.waiter_id?.name;
        if (!waiterName) {
            return false;
        }
        const cashierName =
            (typeof order.getCashierName === "function" ? order.getCashierName() : null) ||
            order.cashier?.name ||
            order.employee_id?.name ||
            order.user_id?.name ||
            "";
        return waiterName !== cashierName;
    }

    get tipSuggestions() {
        const config = this.props.order?.config;
        if (!config?.pre_cuenta_show_tip) {
            return [];
        }
        const raw = config?.pre_cuenta_tip_percentages || "10, 15, 20";
        const total = this.props.order?.priceIncl || 0;
        if (!total || total <= 0) {
            return [];
        }
        return raw
            .split(",")
            .map((s) => parseFloat(s.replace("%", "").trim()))
            .filter((pct) => !isNaN(pct) && pct > 0)
            .map((pct) => ({
                percentage: pct,
                label: `${pct}%`,
                amount: this.formatCurrency(total * (pct / 100)),
                totalWithTip: this.formatCurrency(total * (1 + pct / 100)),
            }));
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
