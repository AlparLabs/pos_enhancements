/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Dialog } from "@web/core/dialog/dialog";

export class KpiDashboardModal extends Component {
    static template = "pos_restaurant_kpi.KpiDashboardModal";
    static components = { Dialog };
    static props = {
        close: Function,
        occupancyRate:         { type: Number, optional: true },
        turnoverRate:          { type: Number, optional: true },
        openAmount:            { type: Number, optional: true },
        avgTableTime:          { type: Number, optional: true },
        totalCustomers:        { type: Number, optional: true },
        avgConsumption:        { type: Number, optional: true },
        sessionTotalCustomers: { type: Number, optional: true },
        sessionAvgConsumption: { type: Number, optional: true },
        sessionTotalAmount:    { type: Number, optional: true },
        singleDinerTables:     { type: Number, optional: true },
    };

    setup() {
        this.pos = usePos();
    }
}
