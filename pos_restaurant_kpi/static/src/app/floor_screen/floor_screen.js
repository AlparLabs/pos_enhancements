/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";
import { KpiDashboardModal } from "@pos_restaurant_kpi/app/kpi_dashboard_modal/kpi_dashboard_modal";
import { useState, onMounted } from "@odoo/owl";

patch(FloorScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.kpiState = useState({ sessionPaidOrders: [] });
        onMounted(() => this._loadSessionPaidOrders());
    },

    async _loadSessionPaidOrders() {
        try {
            const sessionId = this.pos.session.id;
            const records = await this.env.services.orm.searchRead(
                "pos.order",
                [
                    ["session_id", "=", sessionId],
                    ["state", "not in", ["draft", "cancel"]],
                    ["table_id", "!=", false],
                ],
                ["customer_count", "amount_total"]
            );
            this.kpiState.sessionPaidOrders = records;
        } catch (e) {
            console.warn("[pos_restaurant_kpi] No se pudieron cargar las órdenes pagadas de la sesión:", e);
            this.kpiState.sessionPaidOrders = [];
        }
    },

    get totalCustomers() {
        return this.pos.models["pos.order"]
            .filter((order) => order.state === "draft" && order.table_id)
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);
    },

    get avgConsumption() {
        const customers = this.totalCustomers;
        if (customers === 0) {
            return 0;
        }
        const totalAmount = this.pos.models["pos.order"]
            .filter((order) => order.state === "draft" && order.table_id)
            .reduce((sum, order) => sum + order.get_total_with_tax(), 0);
        return totalAmount / customers;
    },

    get sessionTotalCustomers() {
        // Órdenes en memoria ya pagadas de esta sesión (cargadas al entrar a Orders)
        const sessionId = this.pos.session.id;
        const fromMemory = this.pos.models["pos.order"]
            .filter((order) =>
                order.state !== "draft" &&
                order.state !== "cancel" &&
                order.table_id &&
                order.session_id?.id === sessionId
            )
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);

        // Fallback: órdenes cargadas desde el servidor al montar (evita el 0 inicial)
        const fromServer = this.kpiState.sessionPaidOrders
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);

        // Usamos el mayor de los dos para evitar doble-conteo pero garantizar datos
        return Math.max(fromMemory, fromServer);
    },

    get sessionAvgConsumption() {
        const customers = this.sessionTotalCustomers;
        if (customers === 0) {
            return 0;
        }

        const sessionId = this.pos.session.id;
        const fromMemory = this.pos.models["pos.order"]
            .filter((order) =>
                order.state !== "draft" &&
                order.state !== "cancel" &&
                order.table_id &&
                order.session_id?.id === sessionId
            )
            .reduce((sum, order) => sum + order.get_total_with_tax(), 0);

        const fromServer = this.kpiState.sessionPaidOrders
            .reduce((sum, order) => sum + (order.amount_total || 0), 0);

        const totalAmount = Math.max(fromMemory, fromServer);
        return totalAmount / customers;
    },

    get occupancyRate() {
        const totalTables = this.pos.models["restaurant.table"].length;
        if (!totalTables) return 0;
        const occupiedTables = new Set(
            this.pos.models["pos.order"]
                .filter((order) => order.state === "draft" && order.table_id)
                .map((order) => order.table_id.id)
        ).size;
        return Math.round((occupiedTables / totalTables) * 100);
    },

    get turnoverRate() {
        const totalTables = this.pos.models["restaurant.table"].length;
        if (!totalTables) return 0;
        const doneOrders = this.pos.models["pos.order"]
            .filter((order) => order.state !== "draft" && order.state !== "cancel" && order.table_id).length;
        return parseFloat((doneOrders / totalTables).toFixed(1));
    },

    get openAmount() {
        return this.pos.models["pos.order"]
            .filter((order) => order.state === "draft" && order.table_id)
            .reduce((sum, order) => sum + order.get_total_with_tax(), 0);
    },

    get avgTableTime() {
        const activeOrders = this.pos.models["pos.order"].filter((order) => order.state === "draft" && order.table_id);
        if (!activeOrders.length) return 0;

        const now = new Date();
        const totalMinutes = activeOrders.reduce((sum, order) => {
            const orderDate = new Date(order.creation_date || order.date_order || now);
            const diffMs = now - orderDate;
            return sum + (diffMs / 60000);
        }, 0);
        return Math.round(totalMinutes / activeOrders.length);
    },

    get singleDinerTables() {
        // Mesas activas con exactamente 1 comensal
        return this.pos.models["pos.order"]
            .filter((order) => order.state === "draft" && order.table_id && order.customer_count === 1)
            .length;
    },

    openKpiDashboard() {
        this.env.services.dialog.add(KpiDashboardModal, {
            occupancyRate: this.occupancyRate,
            turnoverRate: this.turnoverRate,
            openAmount: this.openAmount,
            avgTableTime: this.avgTableTime,
            totalCustomers: this.totalCustomers,
            avgConsumption: this.avgConsumption,
            sessionTotalCustomers: this.sessionTotalCustomers,
            sessionAvgConsumption: this.sessionAvgConsumption,
            singleDinerTables: this.singleDinerTables,
        });
    },
});

