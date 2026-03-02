import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { registry } from "@web/core/registry";

export class PaymentMercadoPago extends PaymentInterface {
    setup(pos, payment_method_id) {
        super.setup(pos, payment_method_id);
        this.webhook_resolver = null;
        this.mp_order = {};
        this.pending_cid = null;
    }

    // Find the payment line by UUID (cid).
    _findPaymentLine(cid) {
        const order = this.pos.getOrder();
        if (cid) {
            const found = order.payment_ids.find((pl) => pl.uuid === cid);
            if (found) return found;
        }
        // Fallback: try the selected line
        return order.getSelectedPaymentline();
    }

    // ---- RPC helpers (private) ----

    async _createOrder(cid) {
        const order = this.pos.getOrder();
        const line = this._findPaymentLine(cid);
        const infos = {
            amount: parseInt(line.amount * 100, 10),
            additional_info: {
                external_reference: `${this.pos.config.current_session_id.id}_${line.payment_method_id.id}_${order.uuid}_${Date.now()}`,
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
        const line = this._findPaymentLine(this.pending_cid);
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_get",
            [[line.payment_method_id.id], this.mp_order.id]
        );
    }

    async _cancelOrder() {
        const line = this._findPaymentLine(this.pending_cid);
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_cancel",
            [[line.payment_method_id.id], this.mp_order.id]
        );
    }

    async _getPayment(payment_id) {
        const line = this._findPaymentLine(this.pending_cid);
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_get_payment_status",
            [[line.payment_method_id.id], payment_id]
        );
    }

    // ---- PaymentInterface overrides (camelCase required by Odoo 19) ----

    async sendPaymentRequest(cid) {
        this.pending_cid = cid;
        const line = this._findPaymentLine(cid);
        try {
            line.setPaymentStatus("waitingCapture");
            console.log("MercadoPago: Sending order...", { amount: line.amount });
            const mp_response = await this._createOrder(cid);
            console.log("MercadoPago: Order response:", mp_response);

            if (!mp_response || !("id" in mp_response)) {
                const msg = mp_response?.errorMessage || mp_response?.message || "Unknown error from Mercado Pago";
                this._showMsg(msg, "error");
                return false;
            }
            this.mp_order = mp_response;
            line.setPaymentStatus("waitingCard");
            return await new Promise((resolve) => {
                this.webhook_resolver = resolve;
            });
        } catch (error) {
            this._showMsg(error?.message || String(error), "System error");
            return false;
        }
    }

    async sendPaymentCancel(order, cid) {
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
        const line = this._findPaymentLine(this.pending_cid);
        if (!line) return;
        const MAX_RETRY = 5;
        const RETRY_DELAY = 1000;

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

        if (!("id" in this.mp_order)) {
            return;
        }

        let last_status_order = await this._getOrderStatus();

        if (this.mp_order.id != last_status_order.id) {
            return;
        }

        if (["processed", "finished", "canceled", "failed", "expired"].includes(last_status_order.status)) {
            return await handleFinishedPayment(last_status_order);
        }

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

registry.category("pos_payment_methods").add("mercado_pago_alpy", PaymentMercadoPago);