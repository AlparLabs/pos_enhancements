/** @odoo-module **/

import { CashMovePopup } from "@point_of_sale/app/components/popups/cash_move_popup/cash_move_popup";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
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
     * In "ask" mode the cashier picks the contact right away; cancelling the
     * picker keeps the concept but leaves the contact empty.
     */
    async selectCashMoveReason(reason) {
        if (this.state.reasonId === reason.id) {
            this.state.reasonId = null;
            this.state.counterpartPartnerId = null;
            return;
        }
        this.state.reasonId = reason.id;
        this.state.counterpartPartnerId = null;
        this.state.reason = reason.name;

        if (reason.partner_mode === "ask") {
            const partner = await makeAwaitable(this.dialog, PartnerList);
            if (partner) {
                this.state.counterpartPartnerId = partner.id;
                this.state.reason = `${reason.name} — ${partner.name}`;
            }
        }
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

    /**
     * `extras` is the sixth positional argument of try_cash_in_out and is a free-form
     * dict, so the concept rides along without changing the core signature. The fifth
     * argument stays the cashier's partner, untouched.
     */
    _prepareTryCashInOutPayload(type, amount, reason, partnerId, extras) {
        const payload = super._prepareTryCashInOutPayload(
            type,
            amount,
            reason,
            partnerId,
            extras
        );
        Object.assign(payload[5], {
            cash_move_reason_id: this.state.reasonId,
            counterpart_partner_id: this.state.counterpartPartnerId,
        });
        return payload;
    },
});
