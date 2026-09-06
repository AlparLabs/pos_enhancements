/** @odoo-module **/

import { registry } from "@web/core/registry";
import { PaymentClover } from "@pos_clover_alpy/app/utils/payment/payment_clover";

if (!registry.category("pos_payment_providers").contains("clover_fiserv")) {
    registry.category("pos_payment_providers").add("clover_fiserv", PaymentClover);
}

