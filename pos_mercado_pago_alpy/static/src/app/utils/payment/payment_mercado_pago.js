import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { register_payment_method } from "@point_of_sale/app/store/pos_store";

export class PaymentMercadoPago extends PaymentInterface {
    setup(pos, payment_method_id) {
        super.setup(pos, payment_method_id);
        this.webhook_resolver = null;
        this.mp_order = {};
    }

    // ---- RPC helpers (private) ----

    async _createOrder() {
        const order = this.pos.get_order();
        const line = order.get_selected_paymentline();
        const infos = {
            amount: parseInt(line.amount * 100, 10),
            additional_info: {
                external_reference: `${this.pos.pos_session.id}_${line.payment_method_id.id}_${order.uuid}`,
                print_on_terminal: true,
            },
        };
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_create",
            [[line.payment_method_id.id], infos]
        );
    }

    async _getOrderStatus() {
        const order = this.pos.get_order();
        const line = order.get_selected_paymentline();
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_get",
            [[line.payment_method_id.id], this.mp_order.id]
        );
    }

    async _cancelOrder() {
        const order = this.pos.get_order();
        const line = order.get_selected_paymentline();
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_cancel",
            [[line.payment_method_id.id], this.mp_order.id]
        );
    }

    async _getPayment(payment_id) {
        const order = this.pos.get_order();
        const line = order.get_selected_paymentline();
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_get_payment_status",
            [[line.payment_method_id.id], payment_id]
        );
    }

    // ---- PaymentInterface overrides (snake_case required by Odoo 18) ----

    async send_payment_request(cid) {
        const order = this.pos.get_order();
        const line = order.get_selected_paymentline();
        try {
            // During payment creation, user can't cancel the order
            line.set_payment_status("waitingCapture");
            console.log("MercadoPago: Sending order...", { amount: line.amount });
            const mp_response = await this._createOrder();
            console.log("MercadoPago: Order response:", mp_response);

            if (!mp_response || !("id" in mp_response)) {
                const msg = mp_response?.errorMessage || mp_response?.message || "Unknown error from Mercado Pago";
                this._showMsg(msg, "error");
                return false;
            }
            // Order created successfully, save it
            this.mp_order = mp_response;
            // After order creation, allow the user to cancel
            line.set_payment_status("waitingCard");
            // Wait for webhook to resolve the payment status
            return await new Promise((resolve) => {
                this.webhook_resolver = resolve;
            });
        } catch (error) {
            this._showMsg(error?.message || String(error), "System error");
            return false;
        }
    }

    async send_payment_cancel(order, cid) {
        if (!("id" in this.mp_order)) {
            return true;
        }
        try {
            const canceling_status = await this._cancelOrder();
            if (!canceling_status || "error" in canceling_status || "errorMessage" in canceling_status) {
                this._showMsg(_t("Could not cancel the order, please cancel directly on the terminal"), "info");
                return false;
            }
            return true;
        } catch (error) {
            this._showMsg(error?.message || String(error), "System error");
            return false;
        }
    }

    // ---- Webhook handler (called from pos_store.js) ----

    async handleMercadoPagoWebhook() {
        const order = this.pos.get_order();
        const line = order.get_selected_paymentline();
        const MAX_RETRY = 5;
        const RETRY_DELAY = 1000;

        const showMessageAndResolve = (messageKey, status, resolverValue) => {
            if (!resolverValue) {
                this._showMsg(messageKey, status);
            }
            line.set_payment_status("done");
            this.webhook_resolver?.(resolverValue);
            return resolverValue;
        };

        const handleFinishedPayment = async (orderStatus) => {
            if (orderStatus.status === "canceled") {
                return showMessageAndResolve(_t("Payment has been canceled"), "info", false);
            }
            if (["processed", "finished"].includes(orderStatus.status)) {
                const payments = orderStatus.transactions?.payments || [];
                if (payments.length > 0) {
                    const paymentId = payments[payments.length - 1].id;
                    const payment = await this._getPayment(paymentId);
                    if (payment.status === "approved") {
                        return showMessageAndResolve(_t("Payment has been processed"), "info", true);
                    }
                }
                return showMessageAndResolve(_t("Payment has been rejected"), "info", false);
            }
        };

        // No order id means either that the user reloaded the page or it is an old webhook
        if (!("id" in this.mp_order)) {
            return;
        }

        // Call Mercado Pago to get the order status
        let last_status_order = await this._getOrderStatus();

        // Bad order id -> old webhook not related to current order, ignore
        if (this.mp_order.id != last_status_order.id) {
            return;
        }

        if (["processed", "finished", "canceled", "failed", "expired"].includes(last_status_order.status)) {
            return await handleFinishedPayment(last_status_order);
        }

        // BUG: Sometimes MP webhook returns at_terminal/created instead of
        // canceled/processed. Retry up to MAX_RETRY times.
        if (["created", "at_terminal", "action_required"].includes(last_status_order.status)) {
            return await new Promise((resolve) => {
                let retry_cnt = 0;
                const s = setInterval(async () => {
                    last_status_order = await this._getOrderStatus();
                    if (
                        ["processed", "finished", "canceled", "failed", "expired"].includes(
                            last_status_order.status
                        )
                    ) {
                        clearInterval(s);
                        resolve(await handleFinishedPayment(last_status_order));
                    }
                    retry_cnt += 1;
                    if (retry_cnt >= MAX_RETRY) {
                        clearInterval(s);
                        resolve(
                            showMessageAndResolve(
                                _t("Payment status could not be confirmed"),
                                "error",
                                false
                            )
                        );
                    }
                }, RETRY_DELAY);
            });
        }

        return showMessageAndResolve(_t("Unknown payment status"), "error", false);
    }

    // ---- Private helpers ----

    _showMsg(msg, title) {
        this.env.services.dialog.add(AlertDialog, {
            title: "Mercado Pago " + title,
            body: String(msg),
        });
    }
}

register_payment_method("mercado_pago_alpy", PaymentMercadoPago);