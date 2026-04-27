import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { ask } from "@point_of_sale/app/store/make_awaitable_dialog";
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
    // ------------------------------------------------------------------
    // Getters
    // ------------------------------------------------------------------

    /** Returns true when this POS terminal has shift-change enabled. */
    get shiftChangeEnabled() {
        return Boolean(this.pos.config.pos_shift_change_enabled);
    },

    /**
     * Returns the list of draft (unfinalized) orders currently in the POS.
     * `finalized` is the OWL model flag set when an order has been paid/cancelled.
     */
    get draftOrders() {
        return this.pos.models["pos.order"].filter((o) => !o.finalized);
    },

    /**
     * True when the Shift Change button should be rendered:
     * feature enabled AND at least one draft order exists.
     */
    get showShiftChangeButton() {
        return this.shiftChangeEnabled && this.draftOrders.length > 0;
    },

    // ------------------------------------------------------------------
    // Handlers
    // ------------------------------------------------------------------

    /** Called when the user clicks the "Shift Change" button. */
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
        if (!confirmed) {
            return;
        }
        await this.closeSessionShiftChange();
    },

    /**
     * Mirrors the `closeSession()` flow but calls `close_session_shift_change`
     * instead of `close_session_from_ui`.
     *
     * Key differences from the standard flow:
     *   - `post_closing_cash_details` is NOT called separately because it
     *     internally runs `_cannot_close_session` without the shift-change
     *     context, causing it to block on draft orders and return the
     *     "Review Orders / Cancel Orders" error dialog.  Instead we pass
     *     `counted_cash` directly to `close_session_shift_change` so the
     *     backend can record cash details itself, inside the context that
     *     skips the draft-order guard.
     *   - `update_closing_control_state_session` is also skipped for the
     *     same reason – session-state management is handled inside the RPC.
     *
     * Steps:
     *   1. Reset connected cashier state.
     *   2. Optionally send "close" to customer-facing display.
     *   3. Push any unsynced orders to the backend.
     *   4. Call `close_session_shift_change` RPC (handles cash + state).
     *   5. Reload the page so the user lands on the POS home screen.
     */
    async closeSessionShiftChange() {
        this.pos._resetConnectedCashier();

        // Customer-facing display: send "close" signal if proxy is configured.
        if (this.pos.config.customer_display_type === "proxy") {
            const proxyIP = this.pos.getDisplayDeviceIP();
            fetch(`${deduceUrl(proxyIP)}/hw_proxy/customer_facing_display`, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ params: { action: "close" } }),
                targetAddressSpace: odoo.use_lna ? "local" : undefined,
            }).catch(() => {
                console.log("Shift Change: Failed to send data to customer display");
            });
        }

        // Push any locally-queued orders to the backend before closing.
        const syncSuccess = await this.pos.push_orders_with_closing_popup();
        if (!syncSuccess) {
            return;
        }

        // Collect counted cash if cash control is enabled.
        // We pass it to close_session_shift_change instead of calling
        // post_closing_cash_details separately, because that method calls
        // _cannot_close_session without the shift-change context and would
        // block on the existing draft orders.
        const countedCash = this.pos.config.cash_control
            ? parseFloat(this.state.payments[this.props.default_cash_details.id].counted)
            : null;

        // Single RPC: transfers draft orders, records cash details if needed,
        // saves closing notes, and closes the session atomically.
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
                    context: {
                        login_number: odoo.login_number,
                    },
                }
            );

            if (!response.successful) {
                return this.handleClosingError(response);
            }

            // Success — clean up local storage and reload to the home screen.
            localStorage.removeItem(`pos.session.${odoo.pos_config_id}`);
            location.reload();
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                throw error;
            } else {
                await this.handleClosingControlError();
            }
        }
    },
});
