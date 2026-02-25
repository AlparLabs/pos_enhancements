/* global Sha1 */

/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

// Same helper as control_buttons.js — checks `_role` (underscore prefix), not `role`
async function requestSupervisorPin(pos, dialog, notification) {
    if (!pos.config.module_pos_hr) {
        return true;
    }
    const cashier = pos.get_cashier();
    if (cashier?._role === "manager") {
        return true;
    }
    const employees = pos.models["hr.employee"] || [];
    const managers = employees.filter((e) => e._role === "manager");
    if (!managers.length) {
        return true;
    }
    const inputPin = await makeAwaitable(dialog, NumberPopup, {
        formatDisplayedValue: (x) => x.replace(/./g, "•"),
        title: _t("Supervisor PIN Required"),
    });
    if (!inputPin) {
        return false;
    }
    const hashedPin = Sha1.hash(inputPin);
    const authorized = managers.some((m) => m._pin && m._pin === hashedPin);
    if (!authorized) {
        notification.add(_t("Incorrect PIN. Discount not authorized."), {
            type: "warning",
            title: _t("Access Denied"),
        });
        return false;
    }
    return true;
}

patch(ProductScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.notification = useService("notification");
    },

    async onNumpadClick(buttonValue) {
        if (buttonValue === "discount") {
            const authorized = await requestSupervisorPin(this.pos, this.dialog, this.notification);
            if (!authorized) {
                return;
            }
        }
        return super.onNumpadClick(...arguments);
    },
});
