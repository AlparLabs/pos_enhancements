/** @odoo-module **/

import { OrderWidget } from "@point_of_sale/app/generic_components/order_widget/order_widget";
import { OrderCourse } from "@pos_restaurant_courses/app/components/order_course/order_course";
import { patch } from "@web/core/utils/patch";

patch(OrderWidget, {
    components: { ...OrderWidget.components, OrderCourse },
});
