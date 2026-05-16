/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";
import { KpiDashboardModal } from "@pos_restaurant_kpi/app/kpi_dashboard_modal/kpi_dashboard_modal";

patch(FloorScreen.prototype, {
    /**
     * @returns {number}
     */
    get totalCustomers() {
        return this.pos.models["pos.order"]
            .filter((order) => order.state === "draft" && order.table_id)
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);
    },
    /**
     * @returns {number}
     */
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
    /**
     * @returns {number}
     */
    get sessionTotalCustomers() {
        return this.pos.models["pos.order"]
            .filter((order) => order.state !== "draft" && order.state !== "cancel" && order.table_id)
            .reduce((sum, order) => sum + (order.customer_count || 0), 0);
    },
    /**
     * @returns {number}
     */
    get sessionAvgConsumption() {
        const customers = this.sessionTotalCustomers;
        if (customers === 0) {
            return 0;
        }
        const totalAmount = this.pos.models["pos.order"]
            .filter((order) => order.state !== "draft" && order.state !== "cancel" && order.table_id)
            .reduce((sum, order) => sum + order.get_total_with_tax(), 0);
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
        // Approximation: count unique sessions or total done orders divided by total tables
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
            // Using creation_date, fallback to date_order if order has been synchronized somehow
            const orderDate = new Date(order.creation_date || order.date_order || now);
            const diffMs = now - orderDate;
            return sum + (diffMs / 60000); // converting to minutes
        }, 0);
        return Math.round(totalMinutes / activeOrders.length);
    },
    openKpiDashboard() {
        this.dialog.add(KpiDashboardModal, {
            occupancyRate: this.occupancyRate,
            turnoverRate: this.turnoverRate,
            openAmount: this.openAmount,
            avgTableTime: this.avgTableTime,
        });
    },
});
