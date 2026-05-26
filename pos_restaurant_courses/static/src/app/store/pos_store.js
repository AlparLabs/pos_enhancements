/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    set_order(order) {
        order?.ensureCourseSelection();
        super.set_order(...arguments);
    },
    addCourse({ backendCourse } = {}) {
        const order = this.getOrder();
        if (!order) {
            return;
        }
        const nextIdx = order.getNextCourseIndex();
        const course = this.models["restaurant.order.course"].create({
            order_id: order,
            index: nextIdx,
            course_id: backendCourse ? backendCourse : false,
            name: backendCourse ? backendCourse.name : _t("Course ") + nextIdx,
        });
        let selectedCourse = course;
        if (order.course_ids.length === 1 && order.getOrderlines().length > 0) {
            // Assign existing order lines to the first course
            order.getOrderlines().forEach((line) => (line.course_id = course));
            // Create a second empty course and select it
            selectedCourse = this.models["restaurant.order.course"].create({
                order_id: order,
                index: order.getNextCourseIndex(),
                name: _t("Course ") + order.getNextCourseIndex(),
            });
        }
        order.selectCourse(selectedCourse);
        return course;
    },
});
