/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

export class TerminalDetailsPopup extends Component {
    static template = "pos_payment_card_details.TerminalDetailsPopup";
    static components = { Dialog };
    static props = {
        // Injected by makeAwaitable
        getPayload: Function,
        close: Function,
        // Custom
        title: { type: String, optional: true },
        startingValue: {
            type: Object,
            optional: true,
            shape: {
                lot_number: { type: String, optional: true },
                coupon_number: { type: String, optional: true },
                installments: { type: Number, optional: true },
            },
        },
    };

    setup() {
        super.setup();
        this.state = useState({
            lot_number: this.props.startingValue?.lot_number || "",
            coupon_number: this.props.startingValue?.coupon_number || "",
            installments: this.props.startingValue?.installments || 1,
        });
    }

    confirm() {
        this.props.getPayload({
            lot_number: this.state.lot_number,
            coupon_number: this.state.coupon_number,
            installments: parseInt(this.state.installments) || 1,
        });
        this.props.close();
    }

    cancel() {
        this.props.close();
    }
}

