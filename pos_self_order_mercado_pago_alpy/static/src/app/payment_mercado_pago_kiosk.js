/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentPage } from "@pos_self_order/app/pages/payment_page/payment_page";
import { rpc } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";

/**
 * Mercado Pago Kiosk Payment Integration
 *
 * Patches the kiosk PaymentPage to support async Mercado Pago terminal payments:
 *
 * Flow:
 *  1. Customer selects Mercado Pago on the payment screen.
 *  2. `startPayment` sends the order to /kiosk/payment/ (standard Odoo route).
 *  3. The backend creates a MP order and returns its id immediately.
 *  4. The kiosk starts polling /kiosk/mp/status/ every 3 seconds.
 *  5. The terminal prompts the customer to tap/insert their card.
 *  6. On success  → navigates to the order confirmation page.
 *     On cancel   → shows error state, allows retry.
 *     On failure  → shows error state, allows retry.
 *
 * Cancel scenarios handled:
 *  - Customer presses the "Cancel" / back button on the kiosk → calls /kiosk/mp/cancel/
 *  - Customer cancels on the terminal itself → polling detects "canceled" status
 *  - Terminal times out / payment fails / expires → polling detects terminal status
 */

/** How often to poll MP for order status (ms) */
const POLL_INTERVAL_MS = 3000;

/** MP order statuses that signal the payment flow has ended */
const TERMINAL_STATUSES = ["processed", "finished", "canceled", "failed", "expired"];

/** MP order statuses that signal a successful payment */
const SUCCESS_STATUSES = ["processed", "finished"];

patch(PaymentPage.prototype, {
    setup() {
        super.setup(...arguments);
        // State for tracking an in-progress MP payment
        this._mpPollTimer = null;
        this._mpOrderId = null;
        this._mpPaymentMethodId = null;
        this._mpPolling = false;
    },

    /**
     * Extend the parent getter so the footer (cancel/back) button is also
     * visible while we are polling — giving the customer a way to cancel.
     */
    get showFooterBtn() {
        return super.showFooterBtn || this._mpPolling;
    },

    /**
     * Override startPayment to intercept Mercado Pago terminal payments.
     * For any other payment method, falls through to the parent implementation.
     */
    async startPayment() {
        const paymentMethod = this.selectedPaymentMethod;

        if (!paymentMethod || paymentMethod.use_payment_terminal !== "mercado_pago_alpy") {
            return super.startPayment(...arguments);
        }

        this.selfOrder.paymentError = false;
        this._mpPolling = true;

        try {
            // Submit the order to the standard kiosk payment route.
            // The Python _payment_request_from_kiosk creates a MP order
            // and returns the full MP response as payment_status.
            const result = await rpc(`/kiosk/payment/${this.selfOrder.config.id}/kiosk`, {
                order: this.selfOrder.currentOrder.serialize({ orm: true }),
                access_token: this.selfOrder.access_token,
                payment_method_id: this.state.paymentMethodId,
            });

            const mpOrder = result?.payment_status;

            if (!mpOrder || !mpOrder.id) {
                throw new Error(
                    _t("Mercado Pago did not return a valid order. Please try again.")
                );
            }

            this._mpOrderId = mpOrder.id;
            this._mpPaymentMethodId = this.state.paymentMethodId;

            // Start async polling — awaits until a terminal status is reached
            await this._pollMercadoPago();

        } catch (error) {
            this.selfOrder.handleErrorNotification(error);
            this.selfOrder.paymentError = true;
        } finally {
            this._mpPolling = false;
        }
    },

    /**
     * Polls /kiosk/mp/status/ every POLL_INTERVAL_MS milliseconds until
     * the MP order reaches a terminal state (success, cancel, failure, etc).
     *
     * On success: verifies the payment was approved and navigates to confirmation.
     * On any other terminal state: sets paymentError = true so the UI shows retry.
     */
    async _pollMercadoPago() {
        return new Promise((resolve) => {
            this._mpPollTimer = setInterval(async () => {
                try {
                    const status = await rpc(
                        `/kiosk/mp/status/${this._mpPaymentMethodId}/${this._mpOrderId}`,
                        { access_token: this.selfOrder.access_token }
                    );

                    if (!TERMINAL_STATUSES.includes(status?.status)) {
                        // Still in progress (created / at_terminal / action_required) — keep polling
                        return;
                    }

                    this._stopPolling();

                    if (SUCCESS_STATUSES.includes(status.status)) {
                        // Check that at least one payment transaction was actually approved
                        const payments = status.transactions?.payments || [];
                        const lastPayment = payments[payments.length - 1];

                        if (lastPayment?.status === "approved") {
                            // All good — navigate to order confirmation
                            this.router.navigate("order");
                            return resolve(true);
                        }
                        // Payment was "processed/finished" but not approved (e.g. rejected card)
                    }

                    // canceled / failed / expired / not approved
                    this.selfOrder.paymentError = true;
                    resolve(false);

                } catch (pollError) {
                    // Network or server error during polling
                    this._stopPolling();
                    this.selfOrder.paymentError = true;
                    resolve(false);
                }
            }, POLL_INTERVAL_MS);
        });
    },

    /**
     * Stops the polling interval and resets internal state.
     */
    _stopPolling() {
        if (this._mpPollTimer) {
            clearInterval(this._mpPollTimer);
            this._mpPollTimer = null;
        }
        this._mpPolling = false;
    },

    /**
     * Called when the customer presses the cancel / back button while
     * a Mercado Pago payment is in progress.
     *
     * - Stops polling.
     * - Sends a cancel request to MP (best-effort: ignored if terminal already processed it).
     * - Sets paymentError = true so the kiosk shows the retry state.
     *
     * This method is intended to be called from the template's back/cancel button.
     * The parent template already shows a back button when showFooterBtn is true.
     */
    async cancelMercadoPagoPayment() {
        if (!this._mpOrderId) return;

        const orderIdToCancel = this._mpOrderId;
        const methodId = this._mpPaymentMethodId;

        // Stop polling first so we don't race with the cancel response
        this._stopPolling();
        this._mpOrderId = null;
        this._mpPaymentMethodId = null;

        try {
            // Best-effort cancel — MP only allows it in "created" or "action_required" states
            await rpc(`/kiosk/mp/cancel/${methodId}/${orderIdToCancel}`, {
                access_token: this.selfOrder.access_token,
            });
        } catch (_cancelError) {
            // Ignore errors — if the terminal already processed it, cancel is not needed
        }

        this.selfOrder.paymentError = true;
    },
});
