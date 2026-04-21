/** @odoo-module **/

import { Table } from "@pos_restaurant/app/floor_screen/table";
import { patch } from "@web/core/utils/patch";
import { useState, onMounted, onWillUnmount } from "@odoo/owl";

patch(Table.prototype, {
    setup() {
        super.setup(...arguments);
        this.timeState = useState({ minutesPassed: 0 });
        
        onMounted(() => {
            this.updateTableTime();
            // Update the timer every 60 seconds
            this.timer = setInterval(() => this.updateTableTime(), 60000);
        });
        
        onWillUnmount(() => {
            if (this.timer) {
                clearInterval(this.timer);
            }
        });
    },

    updateTableTime() {
        const order = this.env.services.pos.models["pos.order"].find(
            (o) => o.table_id?.id === this.props.table.id && o.state === 'draft'
        );

        if (!order) {
            this.timeState.minutesPassed = 0;
            return;
        }

        const rawDate = order.creation_date || order.date_order;
        if (!rawDate) {
            this.timeState.minutesPassed = 0;
            return;
        }

        let orderDate = new Date();
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

        let diffMs = new Date() - orderDate;
        if (diffMs < 0) diffMs = 0;
        
        this.timeState.minutesPassed = Math.floor(diffMs / 60000);
    },

    get tableTimeDisplay() {
        if (!this.props.table) return "";
        const order = this.env.services.pos.models["pos.order"].find(
            (o) => o.table_id?.id === this.props.table.id && o.state === 'draft'
        );
        if (!order) return "";
        
        const minutes = this.timeState.minutesPassed;
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMins = minutes % 60;
            return `${hours}h ${remainingMins}m`;
        }
    }
});
