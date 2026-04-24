import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { register_payment_method } from "@point_of_sale/app/store/pos_store";
import { MercadoPagoQrPopup } from "@pos_mercado_pago_alpy/app/components/mercado_pago_qr_popup/mercado_pago_qr_popup";

// QR integration type identifiers
const QR_TYPES = ["mercado_pago_qr_local", "mercado_pago_qr_screen", "mercado_pago_qr_hybrid"];
const QR_SCREEN_TYPES = ["mercado_pago_qr_screen", "mercado_pago_qr_hybrid"];

export class PaymentMercadoPago extends PaymentInterface {
    setup(pos, payment_method_id) {
        super.setup(pos, payment_method_id);
        this.webhook_resolver = null;
        this.mp_order = {};
        this.pending_cid = null;
        this._qr_popup_close = null; // Reference to close the QR popup dialog
    }

    /** Returns true if this payment method uses any QR modality. */
    get _isQr() {
        return QR_TYPES.includes(this.payment_method_id.use_payment_terminal);
    }

    /** Returns true if this payment method should display the QR on screen. */
    get _showQrOnScreen() {
        return QR_SCREEN_TYPES.includes(this.payment_method_id.use_payment_terminal);
    }

    // ── Find payment line ────────────────────────────────────────────────────

    _findPaymentLine(cid) {
        const order = this.pos.get_order();
        if (cid) {
            const found = order.payment_ids.find((pl) => pl.uuid === cid);
            if (found) return found;
        }
        return order.get_selected_paymentline();
    }

    // ── RPC helpers (Terminal Smart) ─────────────────────────────────────────

    async _createOrder(cid) {
        const order = this.pos.get_order();
        const line = this._findPaymentLine(cid);
        const sessionId =
            this.pos.session?.id ||
            this.pos.pos_session?.id ||
            this.pos.config?.current_session_id?.id ||
            this.pos.config?.current_session_id ||
            "0";
        const infos = {
            amount: parseInt(line.amount * 100, 10),
            additional_info: {
                external_reference: `${sessionId}_${line.payment_method_id.id}_${order.uuid}_${Date.now()}`,
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

    // ── RPC helpers (QR) ─────────────────────────────────────────────────────

    async _createQrOrder(cid) {
        const order = this.pos.get_order();
        const line = this._findPaymentLine(cid);
        const sessionId =
            this.pos.session?.id ||
            this.pos.pos_session?.id ||
            this.pos.config?.current_session_id?.id ||
            this.pos.config?.current_session_id ||
            "0";

        // Build items from order lines
        const items = order.get_orderlines().map((ol) => {
            const unitPrice = Math.round(ol.get_unit_price() * 100) / 100;
            const qty = ol.get_quantity ? ol.get_quantity() : (ol.quantity || 1);
            const total = Math.round(unitPrice * qty * 100) / 100;
            return {
                sku_number: String(ol.product_id.id),
                category: "others",
                title: ol.product_id.display_name || ol.product_id.name,
                description: ol.product_id.display_name || ol.product_id.name,
                quantity: qty,
                unit_measure: "unit",
                unit_price: unitPrice,
                total_amount: total,
            };
        });

        const infos = {
            amount: parseInt(line.amount * 100, 10),
            external_reference: `${sessionId}_${line.payment_method_id.id}_${order.uuid}_${Date.now()}`,
            title: `Orden POS #${order.sequence_number || order.uid}`,
            items: items,
        };
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_qr_order_create",
            [[line.payment_method_id.id], infos]
        );
    }

    async _deleteQrOrder(cid) {
        const line = this._findPaymentLine(cid);
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_qr_order_delete",
            [[line.payment_method_id.id]]
        );
    }

    // ── QR Popup management ──────────────────────────────────────────────────

    _openQrPopup(line, dynamicQrString = null) {
        const qrString = dynamicQrString || this.payment_method_id.mp_qr_string;
        if (!qrString) {
            console.error("MercadoPago QR: Error abriendo popup, falta el string QR");
            return;
        }

        const amount = line.amount;
        const currency = this.pos.currency?.symbol || "$";

        this.env.services.dialog.add(
            MercadoPagoQrPopup,
            {
                qrString,
                amount,
                currency,
                onCancel: () => {
                    // Trigger cancel from the popup button
                    const currentLine = this._findPaymentLine(this.pending_cid);
                    if (currentLine) {
                        this.send_payment_cancel(this.pos.get_order(), this.pending_cid);
                    }
                },
            },
            {
                onClose: () => {
                    this._qr_popup_close = null;
                },
            }
        );
    }

    _closeQrPopup() {
        // Dialogs in Odoo 18 self-close when the component unmounts;
        // we trigger a re-render by removing the pending_cid flag.
        // The popup's onCancel already triggers send_payment_cancel which resolves the flow.
    }

    // ── PaymentInterface overrides ────────────────────────────────────────────

    async send_payment_request(cid) {
        this.pending_cid = cid;
        const line = this._findPaymentLine(cid);

        try {
            line.set_payment_status("waitingCapture");

            if (this._isQr) {
                return await this._sendQrPaymentRequest(cid, line);
            } else {
                return await this._sendTerminalPaymentRequest(cid, line);
            }
        } catch (error) {
            this._showMsg(error?.message || String(error), "System error");
            return false;
        }
    }

    /** QR payment flow */
    async _sendQrPaymentRequest(cid, line) {
        console.log("MercadoPago QR: Sending QR order...", { amount: line.amount });

        const mp_response = await this._createQrOrder(cid);
        console.log("MercadoPago QR: Order response:", mp_response);

        // The Instore QR PUT endpoint returns HTTP 204 (no content) on success;
        // our request helper returns an empty object {}. An error key means failure.
        if (mp_response && (mp_response.errorMessage || mp_response.message)) {
            this._showMsg(mp_response.errorMessage || mp_response.message, "error");
            return false;
        }

        line.set_payment_status("waitingCard");

        // Show QR on screen if the modality requires it
        if (this._showQrOnScreen) {
            this._openQrPopup(line, mp_response.qr_data);
        }

        return await new Promise((resolve) => {
            this.webhook_resolver = resolve;

            // Polling fallback
            let pollCount = 0;
            const pollInterval = setInterval(async () => {
                pollCount++;
                if (this.pending_cid !== cid) {
                    clearInterval(pollInterval);
                    return;
                }
                try {
                    // For QR, we poll merchant_orders via order_get using the stored mp_order.id
                    // mp_order may be empty (PUT returns no body), so we rely on webhook + cancel
                } catch (e) {
                    /* ignore */
                }
                if (pollCount > 60) {
                    // 5 minutes timeout
                    clearInterval(pollInterval);
                    resolve(false);
                }
            }, 5000);
        });
    }

    /** Terminal Smart payment flow (unchanged) */
    async _sendTerminalPaymentRequest(cid, line) {
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

            // Fallback polling for Odoo.sh or unstable networks
            let pollCount = 0;
            const pollInterval = setInterval(async () => {
                pollCount++;
                if (this.pending_cid !== cid) {
                    clearInterval(pollInterval);
                    return;
                }
                try {
                    const statusResp = await this._getOrderStatus();
                    if (
                        statusResp &&
                        ["processed", "finished", "canceled", "failed", "expired", "closed"].includes(
                            statusResp.status
                        )
                    ) {
                        clearInterval(pollInterval);
                        this.handleMercadoPagoWebhook();
                    }
                } catch (e) {
                    /* ignore */
                }
                if (pollCount > 18) {
                    clearInterval(pollInterval);
                }
            }, 5000);
        });
    }

    async send_payment_cancel(order, cid) {
        const resolverBackup = this.webhook_resolver;
        this.webhook_resolver = null;

        if (this._isQr) {
            try {
                await this._deleteQrOrder(cid || this.pending_cid);
            } catch (e) {
                _logger.warn("MercadoPago QR: could not delete QR order on cancel", e);
            }
            // Resolve the pending promise as false (cancelled)
            resolverBackup?.(false);
            return true;
        }

        // Terminal Smart cancel
        if (!("id" in this.mp_order)) {
            resolverBackup?.(false);
            return true;
        }
        try {
            const canceling_status = await this._cancelOrder();
            if (!canceling_status || "error" in canceling_status || "errorMessage" in canceling_status) {
                this._showMsg(
                    _t("Could not cancel the order, please cancel directly on the terminal"),
                    "info"
                );
                resolverBackup?.(false);
                return false;
            }
            resolverBackup?.(false);
            return true;
        } catch (error) {
            this._showMsg(error?.message || String(error), "System error");
            resolverBackup?.(false);
            return false;
        }
    }

    // ── Webhook handler (called from pos_store.js) ────────────────────────────

    async handleMercadoPagoWebhook() {
        if (this._isQr) {
            return await this._handleQrWebhook();
        }
        return await this._handleTerminalWebhook();
    }

    /** QR webhook: the merchant_order is closed → resolve as paid */
    async _handleQrWebhook() {
        const line = this._findPaymentLine(this.pending_cid);
        if (!line) return;

        line.set_payment_status("done");
        this.webhook_resolver?.(true);
        this.webhook_resolver = null;
    }

    /** Original Terminal Smart webhook handler */
    async _handleTerminalWebhook() {
        const line = this._findPaymentLine(this.pending_cid);
        if (!line) return;
        const MAX_RETRY = 5;
        const RETRY_DELAY = 1000;

        const showMessageAndResolve = (messageKey, status, resolverValue) => {
            if (!resolverValue) {
                this._showMsg(messageKey, status);
            }
            line.set_payment_status("done");
            this.webhook_resolver?.(resolverValue);
            this.webhook_resolver = null;
            return resolverValue;
        };

        const handleFinishedPayment = async (orderStatus) => {
            if (orderStatus.status === "canceled") {
                return showMessageAndResolve(_t("Payment has been canceled"), "info", false);
            }
            if (["processed", "finished", "closed"].includes(orderStatus.status)) {
                const payments = orderStatus.transactions?.payments || [];
                if (payments.length > 0) {
                    const lastPayment = payments[payments.length - 1];
                    const innerStatus = lastPayment.status || lastPayment.state;
                    const innerDetail = lastPayment.status_detail;
                    if (
                        ["approved", "accredited", "processed"].includes(innerStatus) ||
                        ["approved", "accredited"].includes(innerDetail)
                    ) {
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

        if (["closed", "processed", "finished", "canceled", "failed", "expired"].includes(last_status_order.status)) {
            return await handleFinishedPayment(last_status_order);
        }

        if (["created", "at_terminal", "action_required"].includes(last_status_order.status)) {
            return await new Promise((resolve) => {
                let retry_cnt = 0;
                const s = setInterval(async () => {
                    last_status_order = await this._getOrderStatus();
                    if (
                        ["closed", "processed", "finished", "canceled", "failed", "expired"].includes(
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

    // ── Private helpers ───────────────────────────────────────────────────────

    _showMsg(msg, title) {
        this.env.services.dialog.add(AlertDialog, {
            title: "Mercado Pago " + title,
            body: String(msg),
        });
    }
}

// Register all four terminal identifiers so Odoo loads this class for each
register_payment_method("mercado_pago_alpy", PaymentMercadoPago);
register_payment_method("mercado_pago_qr_local", PaymentMercadoPago);
register_payment_method("mercado_pago_qr_screen", PaymentMercadoPago);
register_payment_method("mercado_pago_qr_hybrid", PaymentMercadoPago);