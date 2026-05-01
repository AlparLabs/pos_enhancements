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
        this.mp_qr_order_id = null;  // Stores the in_store_order_id returned by MP for polling (fast path)
        this.mp_qr_ext_ref = null;   // Stores the external_reference for fallback polling when in_store_order_id is absent
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
        if (!order) return undefined;
        if (cid) {
            return order.payment_ids.find((pl) => pl.uuid === cid);
        }
        return order.get_selected_paymentline();
    }

    // ── RPC helpers (Terminal Smart) ─────────────────────────────────────────

    async _createOrder(cid) {
        const order = this.pos.get_order();
        const line = this._findPaymentLine(cid);
        if (!line) return null;
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
        if (!line) return null;
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_get",
            [[line.payment_method_id.id], this.mp_order.id]
        );
    }

    async _cancelOrder() {
        const line = this._findPaymentLine(this.pending_cid);
        if (!line) return null;
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_order_cancel",
            [[line.payment_method_id.id], this.mp_order.id]
        );
    }

    async _getPayment(payment_id) {
        const line = this._findPaymentLine(this.pending_cid);
        if (!line) return null;
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_get_payment_status",
            [[line.payment_method_id.id], payment_id]
        );
    }

    async _getMerchantOrderStatus(merchantOrderId) {
        const line = this._findPaymentLine(this.pending_cid);
        if (!line) return null;
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_qr_get_merchant_order",
            [[line.payment_method_id.id], merchantOrderId]
        );
    }

    async _searchMerchantOrder(externalReference) {
        const line = this._findPaymentLine(this.pending_cid);
        if (!line) return null;
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_qr_search_merchant_order",
            [[line.payment_method_id.id], externalReference]
        );
    }

    // ── RPC helpers (QR) ─────────────────────────────────────────────────────

    async _createQrOrder(cid) {
        const order = this.pos.get_order();
        const line = this._findPaymentLine(cid);
        if (!line) return null;
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

        const extRef = `${sessionId}_${line.payment_method_id.id}_${order.uuid}_${Date.now()}`;
        this.mp_qr_ext_ref = extRef; // Persist for fallback polling when in_store_order_id is absent
        const infos = {
            amount: parseInt(line.amount * 100, 10),
            external_reference: extRef,
            title: `Orden POS #${order.sequence_number || order.uid}`,
            items: items,
            notification_url: `${window.location.origin}/pos_mercado_pago_alpy/notification`,
        };
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_qr_order_create",
            [[line.payment_method_id.id], infos]
        );
    }

    async _deleteQrOrder(cid) {
        const line = this._findPaymentLine(cid);
        if (!line) return null;
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_qr_order_delete",
            [[line.payment_method_id.id]]
        );
    }

    // ── QR Popup management ──────────────────────────────────────────────────

    _openQrPopup(line, dynamicQrString = null) {
        // DEBUG — remove after fixing
        console.log("MercadoPago QR [DEBUG] payment_method_id:", JSON.stringify({
            id: this.payment_method_id?.id,
            name: this.payment_method_id?.name,
            use_payment_terminal: this.payment_method_id?.use_payment_terminal,
            mp_qr_string: this.payment_method_id?.mp_qr_string,
            mp_external_pos_id: this.payment_method_id?.mp_external_pos_id,
        }));
        console.log("MercadoPago QR [DEBUG] dynamicQrString:", dynamicQrString);
        const qrString = dynamicQrString || this.payment_method_id.mp_qr_string;
        if (!qrString) {
            console.error("MercadoPago QR: Error abriendo popup, falta el string QR");
            return false;
        }

        const amount = line.amount;
        const currency = this.pos.currency?.symbol || "$";

        // dialog.add() returns a close function in Odoo 18+
        const closeDialog = this.env.services.dialog.add(
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
        // Store the close function so we can programmatically dismiss the popup
        this._qr_popup_close = typeof closeDialog === "function" ? closeDialog : null;
        return true;
    }

    _closeQrPopup() {
        if (typeof this._qr_popup_close === "function") {
            this._qr_popup_close();
            this._qr_popup_close = null;
        }
    }

    /**
     * Returns true only if the response is a valid MP order/merchant-order object.
     * Accepts both new Orders API statuses ("paid", "created", ...) and old
     * merchant_order statuses ("opened", "closed").
     * MP error responses have a numeric `status` field (e.g. {status: 400}).
     */
    _isOrderResponseValid(resp) {
        return resp && typeof resp.status === "string";
    }

    /**
     * Returns true when an order/merchant-order response indicates the payment
     * was successfully approved.
     *   New Orders API : status === "processed" (status_detail === "accredited")
     *                    or status === "paid" / "finished"
     *   Old merchant_order: status === "closed" + payments[].status === "approved"
     */
    _isOrderApproved(resp) {
        if (!resp) return false;
        // New Orders API: "paid", "processed", or "finished" all indicate a successful payment.
        // QR instore flow returns "processed" with status_detail "accredited".
        if (["paid", "processed", "finished"].includes(resp.status)) return true;
        // Secondary check: status_detail === "accredited" regardless of the status string.
        // Provides a safety net against future Orders API status name variations.
        if (resp.status_detail === "accredited") return true;
        // Old merchant_order fallback
        if (resp.status === "closed") {
            return (resp.payments || []).some(
                (p) => p.status === "approved" || p.status_detail === "accredited"
            );
        }
        return false;
    }

    /**
     * Returns true when an order response indicates a terminal/rejected state.
     *   New Orders API : "expired", "cancelled", "rejected"
     *   Old merchant_order: "closed" without approved payments
     */
    _isOrderRejected(resp) {
        if (!resp) return false;
        if (["expired", "cancelled", "rejected"].includes(resp.status)) return true;
        if (resp.status === "closed") return !this._isOrderApproved(resp);
        return false;
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

        // Store the response as this.mp_order — shared with the terminal flow.
        // _getOrderStatus() and _cancelOrder() both read from this.mp_order.id.
        this.mp_order = mp_response;
        this.mp_qr_order_id = mp_response?.id || null;
        console.log("MercadoPago QR: order id stored for polling:", this.mp_qr_order_id);

        line.set_payment_status("waitingCard");

        // Show QR on screen if the modality requires it.
        // The new /v1/orders API does NOT return a dynamic qr_data — it uses
        // the static QR string (mp_qr_string) associated with the configured
        // external_pos_id. Keep the fallback checks in case a future API version
        // does return qr_data in the response body.
        const qrData = mp_response?.config?.qr?.qr_data || mp_response?.type_response?.qr_data || mp_response?.qr_data;
        if (this._showQrOnScreen) {
            const opened = this._openQrPopup(line, qrData);
            if (!opened) {
                // No QR string available — cancel the payment instead of leaving
                // the user stuck in waitingCard state with no visible QR code.
                this._showMsg(
                    _t("No se encontró el string QR. Por favor configure el campo 'QR URL / String' en el método de pago de Mercado Pago y vuelva a intentarlo."),
                    "error"
                );
                return false;
            }
        }

        return await new Promise((resolve) => {
            this.webhook_resolver = resolve;

            // Polling fallback — queries GET /merchant_orders/{id} every 5 seconds.
            // This resolves the payment even when the MP webhook does not arrive.
            let pollCount = 0;
            const pollInterval = setInterval(async () => {
                pollCount++;
                if (this.pending_cid !== cid) {
                    clearInterval(pollInterval);
                    return;
                }
                try {
                    // Primary: poll via shared _getOrderStatus() — reads this.mp_order.id
                    // Fallback: if order id is missing, search by external_reference.
                    let statusResp = null;
                    if (this.mp_order?.id) {
                        statusResp = await this._getOrderStatus();
                        if (!this._isOrderResponseValid(statusResp)) {
                            console.warn(
                                "MercadoPago QR: Poll by order id failed (status:",
                                statusResp?.status,
                                "), falling back to ext_ref search"
                            );
                            this.mp_order = {};
                            statusResp = null;
                        } else {
                            console.log("MercadoPago QR: Poll status:", statusResp.status);
                        }
                    }
                    if (!statusResp && this.mp_qr_ext_ref) {
                        statusResp = await this._searchMerchantOrder(this.mp_qr_ext_ref);
                        console.log("MercadoPago QR: ext_ref fallback status:", statusResp?.status);
                        if (statusResp?.id) {
                            this.mp_order = statusResp;
                        }
                    }

                    if (statusResp && this._isOrderApproved(statusResp)) {
                        clearInterval(pollInterval);
                        this._handleQrWebhook();
                    } else if (statusResp && this._isOrderRejected(statusResp)) {
                        clearInterval(pollInterval);
                        this._closeQrPopup();
                        this._showMsg(_t("El pago fue rechazado o cancelado."), "info");
                        resolve(false);
                    }
                } catch (e) {
                    /* ignore transient network errors */
                }
                if (pollCount > 60) {
                    // 5 minutes timeout — give up and close the popup
                    clearInterval(pollInterval);
                    this._closeQrPopup();
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
        this.pending_cid = null;

        if (this._isQr) {
            this._closeQrPopup();
            try {
                await this._cancelOrder(); // same as terminal — uses this.mp_order.id
            } catch (e) {
                console.warn("MercadoPago QR: could not cancel QR order", e);
            }
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

    /** QR webhook: verify the order is actually paid before resolving */
    async _handleQrWebhook() {
        const line = this._findPaymentLine(this.pending_cid);
        if (!line) return;

        // Always verify with Mercado Pago — never trust the webhook alone.
        let statusResp = null;
        try {
            if (this.mp_order?.id) {
                statusResp = await this._getOrderStatus(); // shared with terminal
                if (!this._isOrderResponseValid(statusResp)) {
                    console.warn(
                        "MercadoPago QR: webhook lookup failed (status:",
                        statusResp?.status,
                        "), falling back to ext_ref search"
                    );
                    this.mp_order = {};
                    statusResp = null;
                }
            }
            if (!statusResp && this.mp_qr_ext_ref) {
                statusResp = await this._searchMerchantOrder(this.mp_qr_ext_ref);
                if (statusResp?.id) {
                    this.mp_order = statusResp;
                }
            }
        } catch (e) {
            console.warn("MercadoPago QR: could not verify order on webhook", e);
            return;
        }

        if (!statusResp || !this._isOrderResponseValid(statusResp)) {
            console.log("MercadoPago QR: webhook received but order response invalid, status:", statusResp?.status);
            return;
        }

        if (!this._isOrderApproved(statusResp) && !this._isOrderRejected(statusResp)) {
            // Payment not yet confirmed — stay in waitingCard state, polling will handle it
            console.log("MercadoPago QR: webhook received but order not finalized yet, status:", statusResp.status);
            return;
        }

        // Close the QR popup so the POS screen is no longer blocked
        this._closeQrPopup();

        if (this._isOrderApproved(statusResp)) {
            line.set_payment_status("done");
            this.webhook_resolver?.(true);
            this.webhook_resolver = null;
        } else {
            this._showMsg(_t("El pago fue rechazado o cancelado."), "info");
            this.webhook_resolver?.(false);
            this.webhook_resolver = null;
        }
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