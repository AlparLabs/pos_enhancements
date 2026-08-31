/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

export class PaymentClover extends PaymentInterface {
    setup(pos, payment_method_id) {
        super.setup(pos, payment_method_id);
        this.pending_cid = null;
        this.current_external_id = null;
    }

    // ── Helper to find the payment line ──────────────────────────────────────

    _findPaymentLine(cid) {
        const order = this.pos.getOrder();
        if (!order) return undefined;
        if (cid) {
            return order.payment_ids.find((pl) => pl.uuid === cid || pl.cid === cid);
        }
        return order.getSelectedPaymentline();
    }

    // ── Payment Request Workflow ─────────────────────────────────────────────

    async send_payment_request(cid) {
        await super.send_payment_request(cid);
        const line = this._findPaymentLine(cid);
        const order = this.pos.getOrder();

        if (!line || !order) {
            return false;
        }

        this.pending_cid = cid;

        // Ensure amount is positive
        if (line.amount <= 0) {
            this._showError(
                _t("Monto Inválido"),
                _t("El monto a cobrar con Clover debe ser mayor a cero.")
            );
            line.set_payment_status("retry");
            return false;
        }

        const sessionId =
            this.pos.session?.id ||
            this.pos.pos_session?.id ||
            this.pos.config?.current_session_id?.id ||
            this.pos.config?.current_session_id ||
            "0";

        const extPaymentId = `CLV_${sessionId}_${line.payment_method_id.id}_${order.uuid || Date.now()}_${Math.floor(Date.now() / 1000)}`;
        this.current_external_id = extPaymentId;

        // Persist external ID on line
        line.update?.({ clover_external_payment_id: extPaymentId });

        // Change payment status to waitingCard on the POS screen
        line.set_payment_status("waitingCard");

        try {
            const currencyCode = (this.pos.currency && this.pos.currency.name) || "ARS";
            const amountCents = Math.round(line.amount * 100);

            const payload = {
                amount: amountCents,
                external_payment_id: extPaymentId,
                currency_code: currencyCode,
                invoice_number: order.name || "",
            };

            const response = await this.env.services.orm.silent.call(
                "pos.payment.method",
                "clover_payment_create",
                [[line.payment_method_id.id], payload]
            );

            return this._handlePaymentResponse(line, response);

        } catch (error) {
            console.error("Clover Payment Exception:", error);
            this._showError(
                _t("Error de Comunicación con Clover"),
                error.message?.data?.message || error.message || _t("Ocurrió un error inesperado al conectar con el terminal Clover.")
            );
            line.set_payment_status("retry");
            return false;
        }
    }

    // ── Process Response from Clover ─────────────────────────────────────────

    _handlePaymentResponse(line, response) {
        if (!response) {
            this._showError(
                _t("Sin Respuesta"),
                _t("No se recibió respuesta del terminal Clover.")
            );
            line.set_payment_status("retry");
            return false;
        }

        // Handle User Cancel on Terminal
        if (response.status === "canceled" || response.code === "user_canceled") {
            this.pos.dialog?.add(AlertDialog, {
                title: _t("Operación Cancelada"),
                body: _t("La operación fue cancelada en el terminal Clover por el cliente o cajero."),
            });
            line.set_payment_status("retry");
            return false;
        }

        // Handle Errors from Clover
        if (response.status === "error" || response.type === "api_error") {
            const msg = response.message || response.code || _t("Error desconocido retornado por Clover.");
            this._showError(_t("Pago Rechazado por Clover"), msg);
            line.set_payment_status("retry");
            return false;
        }

        // Handle Success
        // Clover returns { payment: { id, result, amount, cardTransaction, ... } }
        const payment = response.payment || response;
        const cardTx = payment.cardTransaction || {};

        if (payment.result === "SUCCESS" || cardTx.state === "CLOSED" || cardTx.type === "AUTH" || payment.id) {
            const cardBrand = cardTx.cardType || "TARJETA";
            const last4 = cardTx.last4 || "";
            const authCode = cardTx.authCode || "";
            const txNo = cardTx.transactionNo || "";
            const refId = cardTx.referenceId || "";
            const entryType = cardTx.entryType || "";
            const cardholder = cardTx.cardholderName || "";

            // Update line fields for storage and receipt printing
            const updateDict = {
                clover_payment_id: payment.id || "",
                clover_auth_code: authCode,
                clover_card_brand: cardBrand,
                clover_card_last4: last4,
                clover_transaction_no: txNo,
                clover_reference_id: refId,
                clover_entry_type: entryType,
                clover_cardholder_name: cardholder,
                clover_external_payment_id: this.current_external_id,
            };

            if (line.update) {
                line.update(updateDict);
            } else {
                Object.assign(line, updateDict);
            }

            line.set_payment_status("done");
            return true;
        }

        // Fallback for unexpected format
        this._showError(
            _t("Estado Desconocido"),
            _t("La respuesta de Clover no pudo ser validada. Verifique la transacción en el portal de Clover.")
        );
        line.set_payment_status("retry");
        return false;
    }

    // ── Cancel Payment Workflow ──────────────────────────────────────────────

    async send_payment_cancel(order, cid) {
        await super.send_payment_cancel(order, cid);
        const line = this._findPaymentLine(cid);
        if (!line) return true;

        try {
            await this.env.services.orm.silent.call(
                "pos.payment.method",
                "clover_payment_cancel",
                [[line.payment_method_id.id]]
            );
        } catch (err) {
            console.warn("Could not cancel on Clover terminal:", err);
        }

        line.set_payment_status("retry");
        return true;
    }

    // ── Reversal / Refund Workflow ───────────────────────────────────────────

    async send_payment_reversal(cid) {
        await super.send_payment_reversal(cid);
        const line = this._findPaymentLine(cid);
        if (!line || !line.clover_payment_id) {
            return true;
        }

        try {
            const amountCents = Math.round(line.amount * 100);
            await this.env.services.orm.silent.call(
                "pos.payment.method",
                "clover_payment_void",
                [[line.payment_method_id.id], line.clover_payment_id, "USER_CANCEL"]
            );
            return true;
        } catch (err) {
            console.error("Error reversing Clover payment:", err);
            this._showError(
                _t("Error al Anular Pago"),
                err.message?.data?.message || err.message || _t("No se pudo anular la transacción en Clover.")
            );
            return false;
        }
    }

    // ── Helper to display error modal ────────────────────────────────────────

    _showError(title, message) {
        this.pos.dialog?.add(AlertDialog, {
            title: title || _t("Error Clover"),
            body: message || _t("Ocurrió un error al procesar el pago."),
        });
    }
}
