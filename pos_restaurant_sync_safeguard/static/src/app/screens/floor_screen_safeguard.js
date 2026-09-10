/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/screens/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted, onWillUnmount } from "@odoo/owl";

patch(FloorScreen.prototype, {
    setup() {
        super.setup(...arguments);

        this._onSafeguardVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                this._safeguardAutoHeal();
            }
        };

        onMounted(() => {
            document.addEventListener("visibilitychange", this._onSafeguardVisibilityChange);
            this._safeguardAutoHeal();
        });

        onWillUnmount(() => {
            document.removeEventListener("visibilitychange", this._onSafeguardVisibilityChange);
        });
    },

    /**
     * Auto-heal mechanism against zombie WebSockets and missed order updates.
     * Waking up a tablet or switching back to the POS tab triggers a throttled
     * verification of active draft orders for this session.
     */
    async _safeguardAutoHeal() {
        const now = Date.now();
        if (this.pos._lastSafeguardHeal && now - this.pos._lastSafeguardHeal < 10000) {
            return;
        }
        this.pos._lastSafeguardHeal = now;

        try {
            // 1. Si la terminal tiene órdenes pendientes en cola local, disparar subida
            if (this.pos.synch?.uploadPendingOrders) {
                await this.pos.synch.uploadPendingOrders();
            }

            // 2. Refrescar silenciosamente las órdenes borrador de mesas para esta sesión
            const sessionId = this.pos.session?.id || this.pos.pos_session?.id;
            if (sessionId && this.pos.data?.orm) {
                const serverOrders = await this.pos.data.orm.searchRead(
                    "pos.order",
                    [
                        ["session_id", "=", sessionId],
                        ["state", "=", "draft"],
                        ["table_id", "!=", false],
                    ],
                    ["id", "uuid", "table_id", "state", "customer_count"]
                );

                if (serverOrders?.length) {
                    let needsRender = false;
                    for (const sOrder of serverOrders) {
                        const tableId = Array.isArray(sOrder.table_id) ? sOrder.table_id[0] : sOrder.table_id;
                        const table = this.pos.models?.["restaurant.table"]?.get?.(tableId);
                        if (table && !table.getOrder?.()) {
                            needsRender = true;
                        }
                    }
                    if (needsRender) {
                        this.render();
                    }
                }
            }
        } catch (err) {
            // Falla silenciosa: si no hay conexión o hay microcorte, no interrumpimos al cajero
            console.warn("[pos_restaurant_sync_safeguard] Auto-heal silencioso:", err);
        }
    },
});
