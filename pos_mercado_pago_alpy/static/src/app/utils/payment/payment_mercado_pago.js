import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { register_payment_method } from "@point_of_sale/app/store/pos_store";

export class PaymentMercadoPago extends PaymentInterface {
    setup(pos, payment_method_id) {
        super.setup(pos, payment_method_id);
        this.webhook_resolver = null;
        this.mp_order = {};
        this.pending_cid = null;
        this.poll_timer = null;
    }

    // Find the payment line by UUID (cid). In Odoo 18, send_payment_request
    // receives the payment line's UUID, not a selected-line reference.
    _findPaymentLine(cid) {
        const order = this.pos.get_order();
        if (cid) {
            const found = order.payment_ids.find((pl) => pl.uuid === cid);
            if (found) return found;
        }
        // Fallback: try the selected line
        return order.get_selected_paymentline();
    }

    // ---- RPC helpers (private) ----

    async _createOrder(cid) {
        const order = this.pos.get_order();
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

    // ---- PaymentInterface overrides (snake_case required by Odoo 18) ----

    async send_payment_request(cid) {
        this.pending_cid = cid;
        const line = this._findPaymentLine(cid);
        try {
            line.set_payment_status("waitingCapture");
            console.log("MercadoPago: Sending order...", { amount: line.amount });
            const mp_response = await this._createOrder(cid);
            console.log("MercadoPago: Order response:", mp_response);

            if (!mp_response || !("id" in mp_response)) {
                const msg = mp_response?.errorMessage || mp_response?.message || "Unknown error from Mercado Pago";
                this._showMsg(msg, "error");
                return false;
            }
            this.mp_order = mp_response;
            line.set_payment_status("waitingCard");
            return await new Promise((resolve) => {
                this.webhook_resolver = resolve;
                this._startPolling(line);
            });
        } catch (error) {
            this._showMsg(error?.message || String(error), "System error");
            return false;
        }
    }

    _startPolling(line) {
        this._stopPolling();
        const POLL_INTERVAL = 3000;
        this.poll_timer = setInterval(async () => {
             await this._checkStatus();
        }, POLL_INTERVAL);
    }

    _stopPolling() {
        if (this.poll_timer) {
            clearInterval(this.poll_timer);
            this.poll_timer = null;
        }
    }

    async _checkStatus() {
        const line = this._findPaymentLine(this.pending_cid);
        if (!line || !this.mp_order.id) {
            this._stopPolling();
            return;
        }

        try {
            const status = await this._getOrderStatus();
            const TERMINAL_STATUSES = ["processed", "finished", "canceled", "failed", "expired"];
            
            if (TERMINAL_STATUSES.includes(status.status)) {
                this._stopPolling();
                await this._handleFinishedResult(status, line);
            }
        } catch (error) {
            console.error("MercadoPago: Polling error", error);
        }
    }

    async _handleFinishedResult(status, line) {
        if (["processed", "finished"].includes(status.status)) {
            const payments = status.transactions?.payments || [];
            if (payments.length > 0) {
                const paymentId = payments[payments.length - 1].id;
                const payment = await this._getPayment(paymentId);
                if (payment.status === "approved") {
                    line.set_payment_status("done");
                    this.webhook_resolver?.(true);
                    return;
                }
            }
        }
        
        // Canceled, failed, expired or rejected
        const msg = status.status === "canceled" ? _t("Payment has been canceled") : _t("Payment has been rejected");
        this._showMsg(msg, "info");
        line.set_payment_status("retry");
        this.webhook_resolver?.(false);
    }

    async send_payment_cancel(order, cid) {
        this._stopPolling();
        if (!("id" in this.mp_order)) {
            return true;
        }
        try {
            const canceling_status = await this._cancelOrder();
            if (!canceling_status || "error" in canceling_status || "errorMessage" in canceling_status) {
                this._showMsg(_t("Could not cancel the order, please cancel directly on the terminal"), "info");
                return false;
            }
            const line = this._findPaymentLine(cid || this.pending_cid);
            if (line) {
                line.set_payment_status("retry");
            }
            this.webhook_resolver?.(false);
            return true;
        } catch (error) {
            this._showMsg(error?.message || String(error), "System error");
            return false;
        }
    }

    // ---- Webhook handler (called from pos_store.js) ----

    async handleMercadoPagoWebhook() {
        await this._checkStatus();
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