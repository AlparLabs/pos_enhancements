/* @odoo-module */

import { patch } from "@web/core/utils/patch";
import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { onMounted, onWillUnmount } from "@odoo/owl";
import { getNow, parseServerDatetime, formatDuration } from "./utils/time_utils";

patch(FloorScreen.prototype, {
    setup() {
        super.setup(...arguments);

        this.tableTimers = {};
        this.intervalId = null;

        if (this.pos.config.enable_table_timer) {
            onMounted(this.startTimer.bind(this));
            onWillUnmount(this.stopTimer.bind(this));
        }
    },

    startTimer() {
        this.intervalId = setInterval(() => {
            this.updateTimers();
        }, 1000);
    },

    stopTimer() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    },

    updateTimers() {
        if (!this.activeTables) return;

        const now = getNow();

        for (const table of this.activeTables) {
            const orders = this.pos.getTableOrders(table.id);

            if (orders.length && orders[0].start_time) {
                const start = parseServerDatetime(orders[0].start_time);
                const diffMs = now - start;
                this.tableTimers[table.id] = formatDuration(diffMs);
            } else {
                this.tableTimers[table.id] = "00:00:00";
            }
        }

        this.render();
    },

    getTableTimer(table) {
        return this.tableTimers[table.id] || "00:00:00";
    },
});