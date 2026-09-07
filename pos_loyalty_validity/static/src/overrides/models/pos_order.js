/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

const { DateTime } = luxon;

patch(PosOrder.prototype, {
    /**
     * Extends program applicability check with day-of-week and time slot filters.
     * Evaluates against the cashier terminal's local current time.
     *
     * @param {Object} program - loyalty.program record
     * @returns {boolean}
     */
    _programIsApplicable(program) {
        if (!super._programIsApplicable(program)) {
            return false;
        }

        const now = DateTime.now();

        // 1. Day of the week check (Luxon: 1 = Monday, ..., 7 = Sunday)
        if (program.filter_by_days) {
            const dayMap = {
                1: program.monday,
                2: program.tuesday,
                3: program.wednesday,
                4: program.thursday,
                5: program.friday,
                6: program.saturday,
                7: program.sunday,
            };
            if (!dayMap[now.weekday]) {
                return false;
            }
        }

        // 2. Time slot check (decimal hour comparison, e.g. 18.5 = 18:30)
        if (program.filter_by_hours) {
            const currentHour = now.hour + now.minute / 60.0;
            if (currentHour < program.hour_from || currentHour > program.hour_to) {
                return false;
            }
        }

        return true;
    },
});
