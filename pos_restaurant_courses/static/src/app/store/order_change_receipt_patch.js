/** @odoo-module **/

import { OrderChangeReceipt } from "@point_of_sale/app/store/order_change_receipt";
import { patch } from "@web/core/utils/patch";

patch(OrderChangeReceipt.prototype, {
    get changedByCourse() {
        const result = [];
        const lines = [...this.props.changes.new, ...this.props.changes.cancelled];
        const courseMap = {};

        for (const line of lines) {
            const courseId = line.course_id?.id || 0;
            const courseName = line.course_id?.name || "";
            if (!courseMap[courseId]) {
                courseMap[courseId] = {
                    id: courseId,
                    name: courseName,
                    lines: [],
                };
                result.push(courseMap[courseId]);
            }
            courseMap[courseId].lines.push(line);
        }
        // Sort courses by index if possible, otherwise by name
        return result.sort((a, b) => (a.id === 0 ? 1 : b.id === 0 ? -1 : a.id - b.id));
    },
});
