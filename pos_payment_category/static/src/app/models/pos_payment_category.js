/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Base } from "@point_of_sale/app/models/related_models";

export class PosPaymentCategory extends Base {
    static pythonModel = "pos.payment.category";
}

registry.category("pos_available_models").add(PosPaymentCategory.pythonModel, PosPaymentCategory);
