/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentPage } from "@pos_self_order/app/pages/payment_page/payment_page";
import { SelfOrder } from "@pos_self_order/app/self_order_service";
import { rpc } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";

/**
 * Mercado Pago Kiosk Payment Integration
 *
 * Patches the kiosk PaymentPage to support async Mercado Pago terminal payments
 * and SelfOrder service to whitelist the terminal.
 */

patch(SelfOrder.prototype, {
    filterPaymentMethods(pms) {
        return this.config.self_ordering_mode === "kiosk"
            ? pms.filter((rec) => ["adyen", "stripe", "mercado_pago_alpy"].includes(rec.use_payment_terminal))
            : [];
    }
});

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = ["processed", "finished", "canceled", "failed", "expired"];
const SUCCESS_STATUSES = ["processed", "finished"];

patch(PaymentPage.prototype, {
    setup() {
        super.setup(...arguments);
        this._mpPollTimer = null;
        this._mpOrderId = null;
        this._mpPaymentMethodId = null;
        this._mpPolling = false;
    },

    get showFooterBtn() {
        return super.showFooterBtn || this._mpPolling;
    },

    async startPayment() {
        const paymentMethod = this.selectedPaymentMethod;

        if (!paymentMethod || paymentMethod.use_payment_terminal !== "mercado_pago_alpy") {
            return super.startPayment(...arguments);
        }

        this.selfOrder.paymentError = false;
        this._mpPolling = true;

        try {
            const result = await rpc(`/kiosk/payment/${this.selfOrder.config.id}/kiosk`, {
                order: this.selfOrder.currentOrder.serialize({ orm: true }),
                access_token: this.selfOrder.access_token,
                payment_method_id: this.state.paymentMethodId,
            });

            const mpOrder = result?.payment_status;

            if (!mpOrder || !mpOrder.id) {
                const errMsg = mpOrder?.message || mpOrder?.errorMessage || _t("Mercado Pago did not return a valid order.");
                throw new Error("MP_ERROR: " + errMsg);
            }

            this._mpOrderId = mpOrder.id;
            this._mpPaymentMethodId = this.state.paymentMethodId;

            await this._pollMercadoPago();

        } catch (error) {
            // Unpack server errors string into the notification so the user can see it on Kiosk
            const detailMsg = error?.data?.message || error?.message || String(error);
            this.selfOrder.handleErrorNotification(new Error("MercadoPago Kiosk Error: " + detailMsg));
            this.selfOrder.paymentError = true;
        } finally {
            this._mpPolling = false;
        }
    },

    async _pollMercadoPago() {
        return new Promise((resolve) => {
            this._mpPollTimer = setInterval(async () => {
                try {
                    const status = await rpc(
                        `/kiosk/mp/status/${this._mpPaymentMethodId}/${this._mpOrderId}`,
                        { access_token: this.selfOrder.access_token }
                    );

                    if (!TERMINAL_STATUSES.includes(status?.status)) {
                        return;
                    }

                    this._stopPolling();

                    if (SUCCESS_STATUSES.includes(status.status)) {
                        const payments = status.transactions?.payments || [];
                        const lastPayment = payments[payments.length - 1];

                        if (lastPayment?.status === "approved") {
                            this.router.navigate("order");
                            return resolve(true);
                        }
                    }

                    this.selfOrder.paymentError = true;
                    resolve(false);

                } catch (pollError) {
                    this._stopPolling();
                    this.selfOrder.paymentError = true;
                    resolve(false);
                }
            }, POLL_INTERVAL_MS);
        });
    },

    _stopPolling() {
        if (this._mpPollTimer) {
            clearInterval(this._mpPollTimer);
            this._mpPollTimer = null;
        }
        this._mpPolling = false;
    },

    async cancelMercadoPagoPayment() {
        if (!this._mpOrderId) return;

        const orderIdToCancel = this._mpOrderId;
        const methodId = this._mpPaymentMethodId;

        this._stopPolling();
        this._mpOrderId = null;
        this._mpPaymentMethodId = null;

        try {
            await rpc(`/kiosk/mp/cancel/${methodId}/${orderIdToCancel}`, {
                access_token: this.selfOrder.access_token,
            });
        } catch (_cancelError) {
        }

        this.selfOrder.paymentError = true;
    },
});
