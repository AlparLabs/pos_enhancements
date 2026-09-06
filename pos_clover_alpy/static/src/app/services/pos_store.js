/** @odoo-module **/

import { PaymentClover } from "@pos_clover_alpy/app/utils/payment/payment_clover";
import { registry } from "@web/core/registry";
import * as PosStore from "@point_of_sale/app/services/pos_store";

if (typeof PosStore.register_payment_method === "function") {
    PosStore.register_payment_method("clover_fiserv", PaymentClover);
}

try {
    const providers = registry.category("pos_payment_providers");
    if (providers && !providers.contains("clover_fiserv")) {
        providers.add("clover_fiserv", PaymentClover);
    }
} catch (e) {
    // Category might not exist in some versions
}


