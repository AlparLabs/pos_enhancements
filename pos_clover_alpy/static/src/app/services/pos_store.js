/** @odoo-module **/

import { register_payment_method } from "@point_of_sale/app/services/pos_store";
import { PaymentClover } from "@pos_clover_alpy/app/utils/payment/payment_clover";

register_payment_method("clover_fiserv", PaymentClover);
