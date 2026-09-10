/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/screens/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";
import { KpiDashboardModal } from "@pos_restaurant_kpi/app/kpi_dashboard_modal/kpi_dashboard_modal";
import { useState, onMounted } from "@odoo/owl";

const SESSION_ORDERS_TTL = 60000; // 60 segundos de caché para llamadas al backend

patch(FloorScreen.prototype, {
    setup() {
        super.setup(...arguments);
        if (!this.pos.kpiSessionState) {
            this.pos.kpiSessionState = {
                sessionPaidOrders: [],
                lastFetch: 0,
            };
        }
        this.kpiState = useState({
            sessionPaidOrders: this.pos.kpiSessionState.sessionPaidOrders,
        });
        onMounted(() => this._loadSessionPaidOrders(false));
    },

    _getAllTables() {
        const raw = this.pos.models?.["restaurant.table"];
        if (!raw) return [];
        if (typeof raw.getAll === "function") {
            return raw.getAll();
        }
        if (Array.isArray(raw)) {
            return raw;
        }
        if (typeof raw === "object") {
            return Object.values(raw);
        }
        return [];
    },

    _getActiveTableOrders() {
        const tables = this._getAllTables();
        const activeOrders = [];
        const seenOrderIds = new Set();

        for (const table of tables) {
            // Resolver la orden activa de la mesa en O(1) vía backLink de pos_restaurant
            const order = table.getOrder?.();

            if (order && order.state === "draft" && !order.finalized) {
                const orderKey = order.uuid || order.id || order;
                if (!seenOrderIds.has(orderKey)) {
                    seenOrderIds.add(orderKey);
                    activeOrders.push(order);
                }
            }
        }
        return activeOrders;
    },

    async _loadSessionPaidOrders(force = false) {
        const now = Date.now();
        const lastFetch = this.pos.kpiSessionState?.lastFetch || 0;
        if (!force && (now - lastFetch < SESSION_ORDERS_TTL)) {
            this.kpiState.sessionPaidOrders = this.pos.kpiSessionState.sessionPaidOrders;
            return;
        }

        try {
            const sessionId = this.pos.session?.id || this.pos.pos_session?.id;
            if (!sessionId) {
                this.kpiState.sessionPaidOrders = [];
                if (this.pos.kpiSessionState) {
                    this.pos.kpiSessionState.sessionPaidOrders = [];
                    this.pos.kpiSessionState.lastFetch = now;
                }
                return;
            }
            const records = await this.pos.data.orm.searchRead(
                "pos.order",
                [
                    ["session_id", "=", sessionId],
                    ["state", "in", ["paid", "done", "invoiced"]],
                    ["table_id", "!=", false],
                ],
                ["id", "customer_count", "amount_total"]
            );
            const paidOrders = records || [];
            if (this.pos.kpiSessionState) {
                this.pos.kpiSessionState.sessionPaidOrders = paidOrders;
                this.pos.kpiSessionState.lastFetch = now;
            }
            this.kpiState.sessionPaidOrders = paidOrders;
        } catch (e) {
            console.warn("[pos_restaurant_kpi] No se pudieron cargar las órdenes pagadas de la sesión:", e);
            if (this.pos.kpiSessionState?.sessionPaidOrders?.length) {
                this.kpiState.sessionPaidOrders = this.pos.kpiSessionState.sessionPaidOrders;
            } else {
                this.kpiState.sessionPaidOrders = [];
            }
        }
    },

    get totalCustomers() {
        return this._getActiveTableOrders()
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);
    },

    get avgConsumption() {
        const customers = this.totalCustomers;
        if (customers === 0) {
            return 0;
        }
        const totalAmount = this._getActiveTableOrders()
            .reduce((sum, order) => sum + (order.priceIncl ?? order.amount_total ?? 0), 0);
        return totalAmount / customers;
    },

    get sessionTotalCustomers() {
        return (this.kpiState.sessionPaidOrders || [])
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);
    },

    get sessionTotalAmount() {
        return (this.kpiState.sessionPaidOrders || [])
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
        const totalTables = this._getAllTables().length;
        if (!totalTables) return 0;
        return Math.round((this._getActiveTableOrders().length / totalTables) * 100);
    },

    get turnoverRate() {
        const totalTables = this._getAllTables().length;
        if (!totalTables) return 0;
        const doneOrdersCount = (this.kpiState.sessionPaidOrders || []).length;
        return parseFloat((doneOrdersCount / totalTables).toFixed(1));
    },

    get openAmount() {
        return this._getActiveTableOrders()
            .reduce((sum, order) => sum + (order.priceIncl ?? order.amount_total ?? 0), 0);
    },

    get avgTableTime() {
        const activeOrders = this._getActiveTableOrders();
        if (!activeOrders.length) return 0;

        const now = new Date();
        const totalMinutes = activeOrders.reduce((sum, order) => {
            let orderDate = now;
            const rawDate = order.date_order || order.creation_date;
            
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
        return this._getActiveTableOrders()
            .filter((order) => (order.customer_count || 0) === 1)
            .length;
    },

    async openKpiDashboard() {
        // Prevent stacking multiple instances of the dialog
        if (this._kpiDialogOpen) {
            return;
        }
        this._kpiDialogOpen = true;
        // Refrescar órdenes pagadas de la sesión antes de abrir modal (forzar llamada fresca)
        await this._loadSessionPaidOrders(true);
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

