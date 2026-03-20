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
        const order = this.get_order();
        if (!order) {
            return;
        }
        const nextIdx = order.getNextCourseIndex();
        const course = this.data.models["restaurant.order.course"].create({
            order_id: order,
            index: nextIdx,
            course_id: backendCourse ? backendCourse : false,
            name: backendCourse ? backendCourse.name : _t("Course ") + nextIdx,
        });
        let selectedCourse = course;
        if (order.course_ids.length === 1 && order.get_orderlines().length > 0) {
            // Assign existing order lines to the first course
            order.get_orderlines().forEach((line) => (line.course_id = course));
            // Create a second empty course and select it
            selectedCourse = this.data.models["restaurant.order.course"].create({
                order_id: order,
                index: order.getNextCourseIndex(),
                name: _t("Course ") + order.getNextCourseIndex(),
            });
        }
        order.selectCourse(selectedCourse);
        return course;
    },
    // In Odoo 18, addLineToCurrentOrder might be slightly different.
    // We override it to ensure new lines get assigned to the selected course.
    async addLineToCurrentOrder(vals, opts = {}) {
        const order = this.get_order();
        if (order && order.hasCourses()) {
            let course = order.getSelectedCourse();
            if (!course) {
                course = order.getLastCourse();
            }
            if (course) {
                vals = { ...vals, course_id: course };
                order.selectCourse(course);
            }
        }
        return await super.addLineToCurrentOrder(vals, opts);
    },
});
