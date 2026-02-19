import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { register_payment_method } from "@point_of_sale/app/store/pos_store";

export class PaymentMercadoPago extends PaymentInterface {
    async createOrder() {
        const order = this.pos.getOrder();
        const line = order.getSelectedPaymentline();
        // Build informations for creating an order on Mercado Pago.
        // Data in "external_reference" are send back with the webhook notification
        const infos = {
            amount: parseInt(line.amount * 100, 10),
            additional_info: {
                external_reference: `${this.pos.pos_session.id}_${line.payment_method_id.id}_${order.uuid}`,
                print_on_terminal: true,
            },
        };
        // mp_order_create will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_create",
            [[line.payment_method_id.id], infos]
        );
    }
    async getOrderStatus() {
        const line = this.pos.getOrder().getSelectedPaymentline();
        // mp_order_get will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_get",
            [[line.payment_method_id.id], this.order.id]
        );
    }

    async cancelOrder() {
        const line = this.pos.getOrder().getSelectedPaymentline();
        // mp_order_cancel will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_cancel",
            [[line.payment_method_id.id], this.order.id]
        );
    }

    async getPayment(payment_id) {
        const line = this.pos.getOrder().getSelectedPaymentline();
        // mp_get_payment_status will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_get_payment_status",
            [[line.payment_method_id.id], payment_id]
        );
    }

    setup() {
        super.setup(...arguments);
        this.webhook_resolver = null;
        this.order = {};
    }

    async sendPaymentRequest(cid) {
        await super.sendPaymentRequest(...arguments);
        const line = this.pos.getOrder().getSelectedPaymentline();
        try {
            // During payment creation, user can't cancel the order
            line.setPaymentStatus("waitingCapture");
            // Call Mercado Pago to create an order
            console.log("Sending Mercado Pago Order...", { line, amount: line.amount });
            const order = await this.createOrder();
            console.log("Mercado Pago Order Response:", order);
            
            if (!("id" in order)) {
                const msg = order.errorMessage || order.message || "Unknown error from Mercado Pago";
                this._showMsg(msg, "error");
                return false;
            }
            // Order creation successfull, save it
            this.order = order;
            // After order creation, make the order canceling possible
            line.setPaymentStatus("waitingCard");
            // Wait for order status change and return status result
            return await new Promise((resolve) => {
                this.webhook_resolver = resolve;
            });
        } catch (error) {
            this._showMsg(error?.message || String(error), "System error");
            return false;
        }
    }

    async sendPaymentCancel(order, cid) {
        await super.sendPaymentCancel(order, cid);
        if (!("id" in this.order)) {
            return true;
        }
        const canceling_status = await this.cancelOrder();
        if (!canceling_status || "error" in canceling_status || "errorMessage" in canceling_status) {
            this._showMsg(_t("Could not cancel the order, please cancel directly on the terminal"), "info");
            return false;
        }
        return true;
    }

    async handleMercadoPagoWebhook() {
        const line = this.pos.getOrder().getSelectedPaymentline();
        const MAX_RETRY = 5; // Maximum number of retries for the "ON_TERMINAL" BUG
        const RETRY_DELAY = 1000; // Delay between retries in milliseconds for the "ON_TERMINAL" BUG

        const showMessageAndResolve = (messageKey, status, resolverValue) => {
            if (!resolverValue) {
                this._showMsg(messageKey, status);
            }
            line.setPaymentStatus("done");
            this.webhook_resolver?.(resolverValue);
            return resolverValue;
        };

        const handleFinishedPayment = async (orderStatus) => {
            if (orderStatus.status === "canceled") {
                return showMessageAndResolve(_t("Payment has been canceled"), "info", false);
            }
            if (["processed", "finished"].includes(orderStatus.status)) { // "finished" is legacy, kept for safety
                // For processed orders, check the payment status
                // If there are multiple payments, we check the last one
                const payments = orderStatus.transactions?.payments || [];
                if (payments.length > 0) {
                    const paymentId = payments[payments.length - 1].id;
                    const payment = await this.getPayment(paymentId);
                    if (payment.status === "approved") {
                        return showMessageAndResolve(_t("Payment has been processed"), "info", true);
                    }
                }
                 // Fallback if no payment details or not approved
                return showMessageAndResolve(_t("Payment has been rejected"), "info", false);
            }
        };

        // No order id means either that the user reload the page or
        // it is an old webhook -> trash
        if ("id" in this.order) {
            // Call Mercado Pago to get the order status
            let last_status_order = await this.getOrderStatus();
            // Bad order id, then it's an old webhook not related with the
            // current order -> trash
            if (this.order.id == last_status_order.id) {
                if (
                    ["processed", "finished", "canceled", "failed", "expired"].includes(last_status_order.status)
                ) {
                    return await handleFinishedPayment(last_status_order);
                }
                // BUG Sometimes the Mercado Pago webhook return at_terminal (ON_TERMINAL equivalent)
                // instead of canceled/processed when we requested a payment status
                // that was actually canceled/finished by the user on the terminal.
                // Then the strategy here is to ask Mercado Pago MAX_RETRY times the
                // order status, hoping going out of this status
                if (
                    ["created", "at_terminal", "action_required"].includes(last_status_order.status)
                ) {
                    return await new Promise((resolve) => {
                        let retry_cnt = 0;
                        const s = setInterval(async () => {
                            last_status_order = await this.getOrderStatus();
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
                // If the state does not match any of the expected values
                return showMessageAndResolve(_t("Unknown payment status"), "error", false);
            }
        }
    }

    // private methods
    _showMsg(msg, title) {
        this.env.services.dialog.add(AlertDialog, {
            title: "Mercado Pago " + title,
            body: msg,
        });
    }
}

register_payment_method("mercado_pago_alpy", PaymentMercadoPago);