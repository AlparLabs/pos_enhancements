/** @odoo-module **/

import { OrderChangeReceipt } from "@point_of_sale/app/store/order_change_receipt";
import { patch } from "@web/core/utils/patch";

patch(OrderChangeReceipt.prototype, {
    get changedByCourse() {
        const result = [];
        const newChanges = this.props.changes.new || {};
        const cancelledChanges = this.props.changes.cancelled || {};
        
        const newLines = Array.isArray(newChanges) ? newChanges : Object.values(newChanges);
        const cancelledLines = Array.isArray(cancelledChanges) ? cancelledChanges : Object.values(cancelledChanges);
        
        const lines = [...newLines, ...cancelledLines];
        const courseMap = {};

        for (const line of lines) {
            const course = line.course_id;
            // Use uuid as the primary key for grouping, especially for new courses
            const courseKey = course?.uuid || course?.id || 0;
            const courseName = course?.name || "";
            const courseSequence = course?.sequence || 999;
            
            if (!courseMap[courseKey]) {
                courseMap[courseKey] = {
                    id: courseKey,
                    name: courseName,
                    sequence: courseSequence,
                    lines: [],
                };
                result.push(courseMap[courseKey]);
            }
            courseMap[courseKey].lines.push(line);
        }
        
        // Sort courses by sequence, then by name
        return result.sort((a, b) => {
            if (a.id === 0) return 1;
            if (b.id === 0) return -1;
            if (a.sequence !== b.sequence) return a.sequence - b.sequence;
            return a.name.localeCompare(b.name);
        });
    },
});
