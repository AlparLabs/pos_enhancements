/** @odoo-module **/

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { useState } from "@odoo/owl";

export class TerminalDetailsPopup extends AbstractAwaitablePopup {
    static template = "pos_payment_card_details.TerminalDetailsPopup";

    setup() {
        super.setup();
        this.state = useState({
            lot_number: this.props.startingValue?.lot_number || "",
            coupon_number: this.props.startingValue?.coupon_number || "",
            installments: this.props.startingValue?.installments || 1,
        });
    }

    getPayload() {
        return {
            lot_number: this.state.lot_number,
            coupon_number: this.state.coupon_number,
            installments: parseInt(this.state.installments) || 1,
        };
    }
}
