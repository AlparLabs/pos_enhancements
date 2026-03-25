/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";

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
});
