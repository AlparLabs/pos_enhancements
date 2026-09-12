/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/screens/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted, onWillUnmount } from "@odoo/owl";

patch(FloorScreen.prototype, {
    setup() {
        super.setup(...arguments);

        // Core Odoo 19 sets `selectedFloorId: floor ? floor.id : null`.
        // If currentFloor is null, undefined or detached during data sync,
        // selectedFloorId becomes null and FloorScreen renders completely blank
        // with no floor tab highlighted (even with 1 floor).
        // We auto-heal selectedFloorId immediately in setup before first render.
        const currentModelFloor = this.state.selectedFloorId
            ? this.pos.models?.["restaurant.floor"]?.get?.(this.state.selectedFloorId)
            : null;

        if (!currentModelFloor || !currentModelFloor.active) {
            const fallback = this._safeguardResolveFloor();
            if (fallback) {
                this.pos.currentFloor = fallback;
                this.state.selectedFloorId = fallback.id;
            }
        }

        this._onSafeguardVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                this._safeguardAutoHeal();
            }
        };

        onMounted(() => {
            document.addEventListener("visibilitychange", this._onSafeguardVisibilityChange);
            // Re-verify on mount in case an async order sync temporarily cleared selectedFloorId
            if (!this.state.selectedFloorId || !this.pos.models?.["restaurant.floor"]?.get?.(this.state.selectedFloorId)) {
                const fallback = this._safeguardResolveFloor();
                if (fallback) {
                    this.selectFloor(fallback);
                }
            }
            this._safeguardAutoHeal();
        });

        onWillUnmount(() => {
            document.removeEventListener("visibilitychange", this._onSafeguardVisibilityChange);
        });
    },

    /**
     * Resolves the active floor with cascading bulletproof fallbacks:
     * 1. pos.currentFloor (if valid, active, and present in models["restaurant.floor"])
     * 2. Floor of the table previously selected / active in this order
     * 3. First active floor from pos.config.floor_ids
     * 4. First active floor in restaurant.floor model
     */
    _safeguardResolveFloor() {
        // 1. Current floor if valid and active
        const current = this.pos.currentFloor;
        if (current) {
            const id = typeof current === "object" ? current.id : current;
            const floor = this.pos.models?.["restaurant.floor"]?.get?.(id);
            if (floor && floor.active) {
                return floor;
            }
        }

        // 2. Floor of selectedTable
        const table = this.pos.selectedTable;
        if (table?.floor_id) {
            const id = typeof table.floor_id === "object" ? table.floor_id.id : table.floor_id;
            const floor = this.pos.models?.["restaurant.floor"]?.get?.(id);
            if (floor && floor.active) {
                return floor;
            }
        }

        // 3. First active floor in pos.config.floor_ids
        const configFloors = this.pos.config?.floor_ids || [];
        const activeConfigFloor = (Array.isArray(configFloors) ? configFloors : Object.values(configFloors))
            .find?.((f) => f.active) || configFloors[0];
        if (activeConfigFloor) {
            const id = typeof activeConfigFloor === "object" ? activeConfigFloor.id : activeConfigFloor;
            const floor = this.pos.models?.["restaurant.floor"]?.get?.(id);
            if (floor) {
                return floor;
            }
        }

        // 4. First active floor in restaurant.floor model
        const modelFloors = this.pos.models?.["restaurant.floor"];
        if (modelFloors) {
            const firstActive = modelFloors.find?.((f) => f.active) || modelFloors.getFirst?.();
            if (firstActive) {
                return firstActive;
            }
        }

        return null;
    },

    /**
     * Fallback protection: if activeFloor would ever return null while floors exist,
     * immediately resolve and return the active fallback floor.
     */
    get activeFloor() {
        const floor = super.activeFloor;
        if (floor && floor.active) {
            return floor;
        }

        const fallback = this._safeguardResolveFloor();
        if (fallback) {
            this.pos.currentFloor = fallback;
            return fallback;
        }

        return floor;
    },

    /**
     * Auto-heal mechanism against zombie WebSockets, blank floor screens, and missed order updates.
     * Waking up a tablet or switching back to the POS tab triggers a throttled
     * verification of active draft orders for this session.
     */
    async _safeguardAutoHeal() {
        const now = Date.now();
        if (this.pos._lastSafeguardHeal && now - this.pos._lastSafeguardHeal < 10000) {
            return;
        }
        this.pos._lastSafeguardHeal = now;

        // Auto-heal floor selection if blank/null
        if (!this.state.selectedFloorId || !this.pos.models?.["restaurant.floor"]?.get?.(this.state.selectedFloorId)) {
            const fallback = this._safeguardResolveFloor();
            if (fallback) {
                this.selectFloor(fallback);
            }
        }

        try {
            // Refrescar silenciosamente las órdenes borrador de mesas para esta sesión
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
                    let missingTableOrder = false;
                    for (const sOrder of serverOrders) {
                        const tableId = Array.isArray(sOrder.table_id) ? sOrder.table_id[0] : sOrder.table_id;
                        const table = this.pos.models?.["restaurant.table"]?.get?.(tableId);
                        if (table && !table.getOrder?.()) {
                            missingTableOrder = true;
                            break;
                        }
                    }
                    if (missingTableOrder && this.pos.deviceSync?.readDataFromServer) {
                        await this.pos.deviceSync.readDataFromServer();
                    }
                }
            }
        } catch (err) {
            // Falla silenciosa: si no hay conexión o hay microcorte, no interrumpimos al cajero
            console.warn("[pos_restaurant_sync_safeguard] Auto-heal silencioso:", err);
        }
    },
});
