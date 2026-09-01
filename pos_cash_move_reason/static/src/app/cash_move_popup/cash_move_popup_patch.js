/** @odoo-module **/

import { CashMovePopup } from "@point_of_sale/app/components/popups/cash_move_popup/cash_move_popup";
import { patch } from "@web/core/utils/patch";

/** A leading `[CODE]` and the blank space after it. */
const REASON_PREFIX = /^\[[^\]]*\]\s*/;

patch(CashMovePopup.prototype, {
    /**
     * Concepts available for the currently selected direction, ordered as configured.
     * @returns {Object[]}
     */
    get cashMoveReasons() {
        const type = this.state.type;
        return this.pos.models["pos.cash.move.reason"]
            .getAll()
            .filter((reason) => reason.move_type === type || reason.move_type === "both")
            .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
    },

    /**
     * Whether the reason text already carries this concept's code.
     *
     * The highlight is derived from the text rather than from a state flag of our own,
     * so a button can never stay lit over a label the cashier has since edited.
     */
    isReasonSelected(reason) {
        return this.state.reason.startsWith(`[${reason.code}]`);
    },

    /**
     * Put the concept's code in front of the reason, or take it out when the same
     * concept is tapped twice. Whatever detail the cashier already typed is kept:
     * the code fixes the concept, the rest of the line stays theirs.
     */
    selectCashMoveReason(reason) {
        const detail = this.state.reason.replace(REASON_PREFIX, "");
        this.state.reason = this.isReasonSelected(reason) ? detail : `[${reason.code}] ${detail}`;
    },

    /**
     * Switching between Cash In and Cash Out drops a code that no longer applies.
     */
    onClickButton(type) {
        super.onClickButton(type);
        if (!this.cashMoveReasons.some((reason) => this.isReasonSelected(reason))) {
            this.state.reason = this.state.reason.replace(REASON_PREFIX, "");
        }
    },
});
