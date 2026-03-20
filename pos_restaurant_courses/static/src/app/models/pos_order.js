/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    setup() {
        super.setup(...arguments);
        this.uiState.selected_course_uuid = undefined;
    },
    cleanCourses() {
        if (!this.hasCourses()) {
            return;
        }
        let lastFiredIndex = -1;
        const courses = this.courses;
        for (let i = courses.length - 1; i >= 0; i--) {
            if (courses[i].fired) {
                lastFiredIndex = i;
                break;
            }
        }
        const originalLength = courses.length;
        const removedCourses = [];
        const cleanedCourses = courses
            .filter((course, index) => {
                const shouldKeep = index <= lastFiredIndex || !course.isEmpty();
                if (!shouldKeep) {
                    removedCourses.push(course);
                }
                return shouldKeep;
            })
            .map((course, newIndex) => {
                course.index = newIndex + 1;
                return course;
            });
        removedCourses.forEach((course) => {
            course.delete();
        });
        if (cleanedCourses.length !== originalLength) {
            this.course_ids = cleanedCourses;
        }
    },
    get courses() {
        return this.course_ids.toSorted((a, b) => a.index - b.index);
    },
    hasCourses() {
        return this.course_ids.length > 0;
    },
    getFirstCourse() {
        return this.courses[0];
    },
    getLastCourse() {
        return this.courses.at(-1);
    },
    ensureCourseSelection() {
        if (!this.hasCourses()) {
            return;
        }
        // Select the first non fired course
        const nonFiredCourse = this.courses.find((course) => !course.fired);
        this.selectCourse(nonFiredCourse ?? this.getLastCourse());
    },
    deselectCourse() {
        this.selectCourse(undefined);
    },
    selectCourse(course) {
        if (course) {
            this.uiState.selected_course_uuid = course.uuid;
            this.deselect_orderline();
        } else {
            this.uiState.selected_course_uuid = undefined;
        }
    },
    removeCourse(course) {
        const courseLines = this.get_orderlines().filter((l) => l.course_id?.uuid === course.uuid);
        for (const line of courseLines) {
            line.course_id = false;
        }
        this.course_ids.splice(
            this.course_ids.findIndex((c) => c.uuid === course.uuid),
            1
        );
        course.delete();
        if (this.uiState.selected_course_uuid === course.uuid) {
            this.uiState.selected_course_uuid = false;
            this.ensureCourseSelection();
        }
    },
    getSelectedCourse() {
        if (!this.uiState.selected_course_uuid) {
            return;
        }
        return this.course_ids.find((course) => course.uuid === this.uiState.selected_course_uuid);
    },
    getNextCourseIndex() {
        return (
            this.course_ids.reduce(
                (maxIndex, course) => (course.index > maxIndex ? course.index : maxIndex),
                0
            ) + 1
        );
    },
});
