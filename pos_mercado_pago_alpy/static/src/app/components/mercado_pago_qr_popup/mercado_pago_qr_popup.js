/** @odoo-module */
import { Component, useState, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * MercadoPagoQrPopup
 *
 * Displays a full-screen overlay on the POS PaymentScreen while the
 * customer scans the QR code. The QR is rendered via a <canvas> using
 * the browser's built-in BarcodeDetector API fallback or an SVG-based
 * approach, but we rely on the simpler strategy of rendering a QR image
 * by calling the Odoo built-in `/report/barcode/QR?value=<url>` endpoint
 * which wraps the Python `qrcode` library already bundled with Odoo.
 *
 * Props:
 *   - qrString  {string}  URL / text encoded in the QR (from mp_qr_string)
 *   - amount    {number}  Amount to display (for customer clarity)
 *   - currency  {string}  Currency symbol
 *   - onCancel  {fn}      Callback when cashier cancels
 */
export class MercadoPagoQrPopup extends Component {
    static template = "pos_mercado_pago_alpy.MercadoPagoQrPopup";
    static props = {
        qrString: String,
        amount: Number,
        currency: { type: String, optional: true },
        onCancel: Function,
        close: Function,
    };
    static defaultProps = {
        currency: "$",
    };

    setup() {
        this.state = useState({ loading: true, error: false });
        // Build the QR image URL using Odoo's built-in barcode controller
        this.qrImageUrl = `/report/barcode/QR?value=${encodeURIComponent(this.props.qrString)}&width=300&height=300`;
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
