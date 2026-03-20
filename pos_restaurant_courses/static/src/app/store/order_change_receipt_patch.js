/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    updateLastOrderChange() {
        super.updateLastOrderChange(...arguments);
        const changes = this.last_order_preparation_change?.lines || {};
        for (const line of this.get_orderlines()) {
            if (changes[line.preparationKey] && line.course_id) {
                changes[line.preparationKey].course = {
                    id: line.course_id.uuid || line.course_id.id,
                    name: line.course_id.name,
                    sequence: line.course_id.index || 999
                };
            }
        }
    }
});

patch(PosStore.prototype, {
    async getRenderedReceipt(order, title, lines, fullReceipt = false, diningModeUpdate) {
        const oldChanges = order.last_order_preparation_change?.lines || {};
        
        const enrichedLines = lines.map(line => {
            const orderline = order.get_orderlines().find(l => l.uuid === line.uuid);
            
            let course = { id: 0, name: "", sequence: 999 };
            if (orderline && orderline.course_id) {
                course = {
                    id: orderline.course_id.uuid || orderline.course_id.id,
                    name: orderline.course_id.name,
                    sequence: orderline.course_id.index || 999
                };
            } else {
                const key = Object.keys(oldChanges).find(k => k.startsWith(line.uuid));
                if (key && oldChanges[key].course) {
                    course = oldChanges[key].course;
                }
            }
            
            return {
                ...line,
                course: course,
            };
        });

        const result = [];
        const courseMap = {};

        for (const line of enrichedLines) {
            const courseKey = line.course.id;
            
            if (!courseMap[courseKey]) {
                courseMap[courseKey] = {
                    id: courseKey,
                    name: line.course.name,
                    sequence: line.course.sequence,
                    lines: [],
                };
                result.push(courseMap[courseKey]);
            }
            courseMap[courseKey].lines.push(line);
        }
        
        const changedByCourse = result.sort((a, b) => {
            if (a.id === 0) return 1;
            if (b.id === 0) return -1;
            if (a.sequence !== b.sequence) return a.sequence - b.sequence;
            return a.name.localeCompare(b.name);
        });

        lines.changedByCourse = changedByCourse;

        return super.getRenderedReceipt(order, title, lines, fullReceipt, diningModeUpdate);
    }
});
