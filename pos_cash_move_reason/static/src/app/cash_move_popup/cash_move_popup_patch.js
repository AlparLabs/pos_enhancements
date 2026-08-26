/** @odoo-module **/

import { CashMovePopup } from "@point_of_sale/app/components/popups/cash_move_popup/cash_move_popup";
import { patch } from "@web/core/utils/patch";

patch(CashMovePopup.prototype, {
    setup() {
        super.setup(...arguments);
        this.state.reasonId = null;
        this.state.counterpartPartnerId = null;
    },

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

    isReasonSelected(reason) {
        return this.state.reasonId === reason.id;
    },

    /**
     * Select a concept, or deselect it when it is tapped a second time.
     * Selecting prefills the reason textarea, which stays editable on purpose:
     * the concept fixes the accounting, the text is local detail.
     */
    selectCashMoveReason(reason) {
        if (this.state.reasonId === reason.id) {
            this.state.reasonId = null;
            this.state.counterpartPartnerId = null;
            return;
        }
        this.state.reasonId = reason.id;
        this.state.counterpartPartnerId = null;
        this.state.reason = reason.name;
    },

    /**
     * Switching between Cash In and Cash Out drops a concept that no longer applies.
     */
    onClickButton(type) {
        super.onClickButton(type);
        const selected =
            this.state.reasonId &&
            this.pos.models["pos.cash.move.reason"].get(this.state.reasonId);
        if (selected && selected.move_type !== "both" && selected.move_type !== type) {
            this.state.reasonId = null;
            this.state.counterpartPartnerId = null;
        }
    },
});
