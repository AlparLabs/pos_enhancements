/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";
import { useState, onMounted, onWillUnmount } from "@odoo/owl";

patch(FloorScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.tableTimeState = useState({ times: {} });
        
        onMounted(() => {
            this.updateAllTableTimes();
            this.timer = setInterval(() => this.updateAllTableTimes(), 60000);
        });
        
        onWillUnmount(() => {
            if (this.timer) {
                clearInterval(this.timer);
            }
        });
    },

    updateAllTableTimes() {
        if (!this.activeTables) return;
        
        const now = new Date();
        const newTimes = {};
        
        for (const table of this.activeTables) {
            const order = this.pos.models["pos.order"].find(
                (o) => o.table_id?.id === table.id && o.state === 'draft'
            );
            
            if (!order) {
                newTimes[table.id] = "";
                continue;
            }
            
            const rawDate = order.creation_date || order.date_order;
            if (!rawDate) {
                newTimes[table.id] = "";
                continue;
            }
            
            let orderDate = now;
            if (rawDate instanceof Date) {
                orderDate = rawDate;
            } else if (rawDate.isLuxonDateTime) {
                orderDate = rawDate.toJSDate();
            } else if (typeof rawDate === "string") {
                if (rawDate.includes("T")) {
                    orderDate = new Date(rawDate);
                } else {
                    orderDate = new Date(rawDate.replace(" ", "T") + "Z");
                }
            }
            
            let diffMs = now - orderDate;
            if (diffMs < 0) diffMs = 0;
            
            const minutes = Math.floor(diffMs / 60000);
            
            if (minutes < 60) {
                newTimes[table.id] = `${minutes} min`;
            } else {
                const hours = Math.floor(minutes / 60);
                const remainingMins = minutes % 60;
                newTimes[table.id] = `${hours}h ${remainingMins}m`;
            }
        }
        
        // Update state to trigger re-render if necessary
        this.tableTimeState.times = newTimes;
    },

    getTableTimeDisplay(table) {
        return this.tableTimeState.times[table.id] || "";
    }
});
