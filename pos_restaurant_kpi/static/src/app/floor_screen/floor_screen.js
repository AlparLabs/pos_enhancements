/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/screens/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";
import { KpiDashboardModal } from "@pos_restaurant_kpi/app/kpi_dashboard_modal/kpi_dashboard_modal";
import { useState, onMounted } from "@odoo/owl";

patch(FloorScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.kpiState = useState({ sessionPaidOrders: [] });
        onMounted(() => this._loadSessionPaidOrders());
    },

    _getSessionId() {
        return this.pos.session?.id ?? this.pos.pos_session?.id;
    },

    _isOrderInCurrentSession(order, sessionId) {
        if (!order) return false;
        const sId = order.session_id?.id ?? (typeof order.session_id === "number" ? order.session_id : (Array.isArray(order.session_id) ? order.session_id[0] : null));
        // Local orders created in current session may not have session_id set yet
        if (!sId && !order.server_id && typeof order.id === "string") {
            return true;
        }
        return sId === sessionId;
    },

    _isTableOrder(order) {
        if (!order || !order.table_id) return false;
        const tableId = order.table_id?.id ?? (Array.isArray(order.table_id) ? order.table_id[0] : order.table_id);
        return Boolean(tableId);
    },

    _isDraftOrder(order) {
        if (!order) return false;
        return order.state === "draft" && !order.finalized && order.state !== "cancel" && order.state !== "cancelled";
    },

    _isPaidOrder(order) {
        if (!order) return false;
        if (order.state === "cancel" || order.state === "cancelled") return false;
        if (order.state === "draft" && !order.finalized) return false;
        return order.state !== "draft" || Boolean(order.finalized);
    },

    _getActiveDraftOrders() {
        const sessionId = this._getSessionId();
        const tables = this.pos.models["restaurant.table"] || [];
        const validTableIds = new Set(tables.map((t) => t.id));

        return (this.pos.models["pos.order"] || []).filter((order) => {
            if (!this._isOrderInCurrentSession(order, sessionId)) {
                return false;
            }
            if (!this._isTableOrder(order)) {
                return false;
            }
            if (!this._isDraftOrder(order)) {
                return false;
            }
            const tableId = order.table_id?.id ?? (Array.isArray(order.table_id) ? order.table_id[0] : order.table_id);
            if (validTableIds.size > 0 && !validTableIds.has(tableId)) {
                return false;
            }
            return true;
        });
    },

    _getSessionPaidOrdersList() {
        const sessionId = this._getSessionId();
        const serverOrders = this.kpiState?.sessionPaidOrders || [];
        const paidOrdersMap = new Map();

        // 1. Agregar órdenes pagadas del servidor correspondientes a la sesión
        for (const rec of serverOrders) {
            if (rec && rec.id) {
                paidOrdersMap.set(`server_${rec.id}`, {
                    id: rec.id,
                    customer_count: rec.customer_count || 0,
                    amount_total: rec.amount_total || 0,
                });
            }
        }

        // 2. Agregar o fusionar órdenes pagadas en memoria de la sesión
        const memoryPaidOrders = (this.pos.models["pos.order"] || []).filter((order) => {
            return (
                this._isOrderInCurrentSession(order, sessionId) &&
                this._isTableOrder(order) &&
                this._isPaidOrder(order)
            );
        });

        for (const order of memoryPaidOrders) {
            const serverId = (typeof order.id === "number" ? order.id : null) || order.server_id;
            const key = serverId ? `server_${serverId}` : `local_${order.uuid || order.id}`;
            const amount = order.priceIncl ?? order.amount_total ?? order.get_total_with_tax?.() ?? 0;

            paidOrdersMap.set(key, {
                id: order.id,
                customer_count: order.customer_count || 0,
                amount_total: amount,
            });
        }

        return Array.from(paidOrdersMap.values());
    },

    async _loadSessionPaidOrders() {
        try {
            const sessionId = this._getSessionId();
            if (!sessionId) {
                this.kpiState.sessionPaidOrders = [];
                return;
            }
            const records = await this.pos.data.orm.searchRead(
                "pos.order",
                [
                    ["session_id", "=", sessionId],
                    ["state", "not in", ["draft", "cancel"]],
                    ["table_id", "!=", false],
                ],
                ["id", "customer_count", "amount_total"]
            );
            this.kpiState.sessionPaidOrders = records || [];
        } catch (e) {
            console.warn("[pos_restaurant_kpi] No se pudieron cargar las órdenes pagadas de la sesión:", e);
            this.kpiState.sessionPaidOrders = [];
        }
    },

    get totalCustomers() {
        return this._getActiveDraftOrders()
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);
    },

    get avgConsumption() {
        const customers = this.totalCustomers;
        if (customers === 0) {
            return 0;
        }
        const totalAmount = this._getActiveDraftOrders()
            .reduce((sum, order) => sum + (order.priceIncl ?? order.get_total_with_tax?.() ?? 0), 0);
        return totalAmount / customers;
    },

    get sessionTotalCustomers() {
        return this._getSessionPaidOrdersList()
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);
    },

    get sessionTotalAmount() {
        return this._getSessionPaidOrdersList()
            .reduce((sum, order) => sum + (order.amount_total || 0), 0);
    },

    get sessionAvgConsumption() {
        const customers = this.sessionTotalCustomers;
        if (customers === 0) {
            return 0;
        }

        return this.sessionTotalAmount / customers;
    },

    get occupancyRate() {
        const totalTables = this.pos.models["restaurant.table"]?.length || 0;
        if (!totalTables) return 0;
        const occupiedTables = new Set(
            this._getActiveDraftOrders()
                .map((order) => order.table_id?.id ?? (Array.isArray(order.table_id) ? order.table_id[0] : order.table_id))
                .filter(Boolean)
        ).size;
        return Math.round((occupiedTables / totalTables) * 100);
    },

    get turnoverRate() {
        const totalTables = this.pos.models["restaurant.table"]?.length || 0;
        if (!totalTables) return 0;
        const doneOrdersCount = this._getSessionPaidOrdersList().length;
        return parseFloat((doneOrdersCount / totalTables).toFixed(1));
    },

    get openAmount() {
        return this._getActiveDraftOrders()
            .reduce((sum, order) => sum + (order.priceIncl ?? order.get_total_with_tax?.() ?? 0), 0);
    },

    get avgTableTime() {
        const activeOrders = this._getActiveDraftOrders();
        if (!activeOrders.length) return 0;

        const now = new Date();
        const totalMinutes = activeOrders.reduce((sum, order) => {
            let orderDate = now;
            const rawDate = order.creation_date || order.date_order;
            
            if (rawDate) {
                if (rawDate instanceof Date) {
                    orderDate = rawDate;
                } else if (rawDate.isLuxonDateTime) {
                    orderDate = rawDate.toJSDate();
                } else if (typeof rawDate === "string") {
                    if (rawDate.includes("T")) {
                        orderDate = new Date(rawDate);
                    } else {
                        // Odoo DB string is in UTC: "YYYY-MM-DD HH:mm:ss"
                        orderDate = new Date(rawDate.replace(" ", "T") + "Z");
                    }
                }
            }
            
            // Si por algún motivo el tiempo es negativo (futuro cercano por desajuste de reloj), lo limitamos a 0
            let diffMs = now - orderDate;
            if (diffMs < 0) diffMs = 0;
            
            return sum + (diffMs / 60000);
        }, 0);
        return Math.round(totalMinutes / activeOrders.length);
    },

    get singleDinerTables() {
        // Mesas activas con exactamente 1 comensal
        return this._getActiveDraftOrders()
            .filter((order) => (order.customer_count || 0) === 1)
            .length;
    },

    openKpiDashboard() {
        // Prevent stacking multiple instances of the dialog
        if (this._kpiDialogOpen) {
            return;
        }
        this._kpiDialogOpen = true;
        this.dialog.add(KpiDashboardModal, {
            occupancyRate: this.occupancyRate,
            turnoverRate: this.turnoverRate,
            openAmount: this.openAmount,
            avgTableTime: this.avgTableTime,
            totalCustomers: this.totalCustomers,
            avgConsumption: this.avgConsumption,
            sessionTotalCustomers: this.sessionTotalCustomers,
            sessionAvgConsumption: this.sessionAvgConsumption,
            sessionTotalAmount: this.sessionTotalAmount,
            singleDinerTables: this.singleDinerTables,
        }, {
            onClose: () => {
                this._kpiDialogOpen = false;
            },
        });
    },
});

