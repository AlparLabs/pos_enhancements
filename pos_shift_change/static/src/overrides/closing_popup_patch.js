import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { ask } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { parseFloat } from "@web/views/fields/parsers";
import { ConnectionLostError } from "@web/core/network/rpc";
import { deduceUrl } from "@point_of_sale/utils";

/**
 * Patch ClosePosPopup to add a "Shift Change" button.
 *
 * The button appears only when:
 *   1. `pos_shift_change_enabled` is true on the current POS config.
 *   2. There are unfinalized (draft) orders in the session.
 *
 * When confirmed, it calls `close_session_shift_change` on the backend,
 * which transfers open orders to a new session before closing the current one.
 */
patch(ClosePosPopup.prototype, {
    get shiftChangeEnabled() {
        return Boolean(this.pos.config.pos_shift_change_enabled);
    },

    get draftOrders() {
        return this.pos.models["pos.order"].filter((o) => !o.finalized);
    },

    get showShiftChangeButton() {
        return this.shiftChangeEnabled && this.draftOrders.length > 0;
    },

    async onShiftChangeClick() {
        const count = this.draftOrders.length;
        const confirmed = await ask(this.dialog, {
            title: _t("Confirm Shift Change"),
            body: _t(
                "%s open order(s) will be transferred to the next shift. " +
                "Only paid orders will be closed now. Continue?",
                count
            ),
            confirmLabel: _t("Confirm Shift Change"),
            cancelLabel: _t("Cancel"),
        });
        if (!confirmed) return;
        await this.closeSessionShiftChange();
    },

    /**
     * Mirrors the native closeSession() flow but calls close_session_shift_change
     * instead of close_session_from_ui.
     *
     * post_closing_cash_details and update_closing_control_state_session are NOT
     * called separately because they internally run _cannot_close_session without
     * the pos_shift_change context, which would block on draft orders.
     * Instead we pass counted_cash directly to close_session_shift_change.
     */
    async closeSessionShiftChange() {
        this.pos._resetConnectedCashier();

        if (this.pos.config.customer_display_type === "proxy") {
            const proxyIP = this.pos.getDisplayDeviceIP();
            fetch(`${deduceUrl(proxyIP)}/hw_proxy/customer_facing_display`, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ params: { action: "close" } }),
            }).catch(() => {
                console.log("Shift Change: Failed to send data to customer display");
            });
        }

        const syncSuccess = await this.pos.pushOrdersWithClosingPopup();
        if (!syncSuccess) return;

        const countedCash = this.pos.config.cash_control
            ? parseFloat(this.state.payments[this.props.default_cash_details.id].counted)
            : null;

        try {
            const bankPaymentMethodDiffPairs = this.props.non_cash_payment_methods
                .filter((pm) => pm.type === "bank")
                .map((pm) => [pm.id, this.getDifference(pm.id)]);

            const response = await this.pos.data.call(
                "pos.session",
                "close_session_shift_change",
                [this.pos.session.id, bankPaymentMethodDiffPairs],
                {
                    counted_cash: countedCash,
                    closing_notes: this.state.notes,
                }
            );

            if (!response.successful) {
                return this.handleClosingError(response);
            }

            this.pos.session.state = "closed";
            this.pos.router.close();
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                throw error;
            } else {
                await this.handleClosingControlError();
            }
        } finally {
            localStorage.removeItem(`pos.session.${odoo.pos_config_id}`);
        }
    },
});
