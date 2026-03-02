/** @odoo-module */

import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component, useState } from "@odoo/owl";

export class MercadoPagoQrPopup extends Component {
    static template = "pos_mercado_pago_alpy.MercadoPagoQrPopup";
    static defaultProps = {
        title: "Mercado Pago QR",
        qrData: "",
        amount: 0,
    };

    setup() {
        this.pos = usePos();
        this.state = useState({ status: "pending" });
    }

    get qrCodeUrl() {
        // Odoo has an endpoint for generating QR codes visually
        return `/report/barcode/?barcode_type=QR&value=${encodeURIComponent(this.props.qrData)}&width=250&height=250`;
    }

    cancel() {
        this.props.close();
    }
}
