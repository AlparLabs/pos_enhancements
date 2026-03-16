/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class TerminalDetailsPopup extends Component {
    static template = "pos_payment_card_details.TerminalDetailsPopup";

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

