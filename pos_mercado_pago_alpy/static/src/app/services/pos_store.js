import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

const MP_ALL_TERMINAL_TYPES = [
    "mercado_pago_alpy",
    "mercado_pago_qr_local",
    "mercado_pago_qr_screen",
    "mercado_pago_qr_hybrid",
];

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this.data.connectWebSocket("MERCADO_PAGO_LATEST_MESSAGE", (payload) => {
            if (payload.config_id === this.config.id) {
                const pendingLine = MP_ALL_TERMINAL_TYPES.reduce((found, type) => {
                    return found || this.getPendingPaymentLine(type);
                }, null);
                if (pendingLine) {
                    pendingLine.payment_method_id.payment_terminal.handleMercadoPagoWebhook();
                }
            }
        });
    },
});
