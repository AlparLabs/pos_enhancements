/** @odoo-module **/

import { Component } from "@odoo/owl";

export class KpiDashboardModal extends Component {
    static template = "pos_restaurant_kpi.KpiDashboardModal";
    static props = {
        close: Function,
        occupancyRate: { type: Number, optional: true },
        turnoverRate: { type: Number, optional: true },
        openAmount: { type: Number, optional: true },
        avgTableTime: { type: Number, optional: true },
    };
    
    setup() {
        super.setup();
    }
}
