/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { KpiDashboardModal } from "@pos_restaurant_kpi/app/kpi_dashboard_modal/kpi_dashboard_modal";

patch(FloorScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
        this.kpiState = useState({
            sessionTotalCustomers: 0,
            sessionTotalAmount: 0,
            turnoverRate: 0,
            doneOrdersCount: 0,
        });

        onMounted(() => {
            this.fetchSessionKpis();
        });
    },

    async fetchSessionKpis() {
        if (!this.pos || !this.pos.pos_session) return;
        try {
            const domain = [
                ["session_id", "=", this.pos.pos_session.id],
                ["state", "in", ["paid", "done", "invoiced"]],
                ["table_id", "!=", false]
            ];
            
            const records = await this.orm.searchRead("pos.order", domain, ["customer_count", "amount_total"]);
            let totalCustomers = 0;
            let totalAmount = 0;
            for (const rec of records) {
                totalCustomers += (rec.customer_count || 0);
                totalAmount += (rec.amount_total || 0);
            }
            
            this.kpiState.sessionTotalCustomers = totalCustomers;
            this.kpiState.sessionTotalAmount = totalAmount;
            this.kpiState.doneOrdersCount = records.length;
            
            const totalTables = this.pos.models["restaurant.table"].length;
            if (totalTables > 0) {
                this.kpiState.turnoverRate = parseFloat((records.length / totalTables).toFixed(1));
            } else {
                this.kpiState.turnoverRate = 0;
            }
        } catch (e) {
            console.error("Failed to fetch KPIs:", e);
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
        if (!this.pos?.pos_session) return this.kpiState?.sessionTotalCustomers || 0;
        // Find local paid orders that haven't been synchronized yet from the current session
        const localPaidOrders = this.pos.models["pos.order"].filter((order) => {
            const sId = order.session_id?.id ?? order.session_id;
            return order.state !== "draft" && order.state !== "cancel" && order.table_id && sId === this.pos.pos_session.id && !order.server_id && typeof order.id === "string";
        });
        const localCustomers = localPaidOrders.reduce((sum, order) => sum + (order.customer_count || 0), 0);
        return (this.kpiState?.sessionTotalCustomers || 0) + localCustomers;
    },
    get sessionAvgConsumption() {
        if (!this.pos?.pos_session) return 0;
        const localPaidOrders = this.pos.models["pos.order"].filter((order) => {
            const sId = order.session_id?.id ?? order.session_id;
            return order.state !== "draft" && order.state !== "cancel" && order.table_id && sId === this.pos.pos_session.id && !order.server_id && typeof order.id === "string";
        });
        
        const localCustomers = localPaidOrders.reduce((sum, order) => sum + (order.customer_count || 0), 0);
        const localAmount = localPaidOrders.reduce((sum, order) => sum + order.get_total_with_tax(), 0);
        
        const totalCustomers = (this.kpiState?.sessionTotalCustomers || 0) + localCustomers;
        const totalAmount = (this.kpiState?.sessionTotalAmount || 0) + localAmount;

        if (totalCustomers === 0) {
            return 0;
        }
        return totalAmount / totalCustomers;
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
        if (!this.pos?.pos_session) return 0;
        const localPaidCount = this.pos.models["pos.order"].filter((order) => {
            const sId = order.session_id?.id ?? order.session_id;
            return order.state !== "draft" && order.state !== "cancel" && order.table_id && sId === this.pos.pos_session.id && !order.server_id && typeof order.id === "string";
        }).length;
        
        const totalDone = (this.kpiState?.doneOrdersCount || 0) + localPaidCount;
        const totalTables = this.pos.models["restaurant.table"].length;
        
        if (!totalTables) return 0;
        return parseFloat((totalDone / totalTables).toFixed(1));
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
            // Using creation_date, fallback to date_order if order has been synchronized somehow
            const orderDate = new Date(order.creation_date || order.date_order || now);
            const diffMs = now - orderDate;
            return sum + (diffMs / 60000); // converting to minutes
        }, 0);
        return Math.round(totalMinutes / activeOrders.length);
    },
    openKpiDashboard() {
        this.env.services.dialog.add(KpiDashboardModal, {
            occupancyRate: this.occupancyRate,
            turnoverRate: this.turnoverRate,
            openAmount: this.openAmount,
            avgTableTime: this.avgTableTime,
        });
    },
});
