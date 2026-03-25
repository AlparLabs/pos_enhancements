/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * @typedef {Object} TerminalDetailsPopupProps
 * @property {Function} [getPayload]
 * @property {Function} [close]
 * @property {string} [title]
 * @property {Object} [startingValue]
 */

export class TerminalDetailsPopup extends Component {
    static template = "pos_payment_card_details.TerminalDetailsPopup";
    static components = { Dialog };
    
    /** @type {TerminalDetailsPopupProps} */
    static props = {
        getPayload: { type: Function, optional: true },
        close: { type: Function, optional: true },
        title: { type: String, optional: true },
        startingValue: { type: Object, optional: true },
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

