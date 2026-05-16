/** @odoo-module */
import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * @typedef {Object} MercadoPagoQrPopupProps
 * @property {string} qrString - URL / text encoded in the QR
 * @property {number} amount - Amount to display
 * @property {string} [currency] - Currency symbol
 * @property {Function} onCancel - Callback when cashier cancels
 * @property {Function} close - Injected by dialog service
 */

export class MercadoPagoQrPopup extends Component {
    static template = "pos_mercado_pago_alpy.MercadoPagoQrPopup";
    static components = { Dialog };

    /** @type {MercadoPagoQrPopupProps} */
    static props = {
        qrString: { type: String },
        amount: { type: Number },
        currency: { type: String, optional: true },
        onCancel: { type: Function },
        close: { type: Function },
    };

    static defaultProps = {
        currency: "$",
    };

    setup() {
        this.state = useState({ loading: true, error: false });
        this.qrImageUrl = `/report/barcode/QR/${encodeURIComponent(this.props.qrString)}?width=300&height=300`;
    }

    get formattedAmount() {
        return this.props.currency + " " + this.props.amount.toFixed(2);
    }

    onImageLoad() {
        this.state.loading = false;
    }

    onImageError() {
        this.state.loading = false;
        this.state.error = true;
    }

    cancel() {
        this.props.onCancel();
        this.props.close();
    }
}
