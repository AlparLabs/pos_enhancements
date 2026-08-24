/** @odoo-module **/

import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import {
    canCreateConceptInvoice,
    openConceptInvoiceDialog,
} from "@pos_concept_invoice/app/utils/concept_invoice";

/**
 * Secondary entry point: invoice an older order from the ticket list, after
 * the cashier already left the post-payment screen. The primary one is the
 * ReceiptScreen button.
 */
patch(TicketScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this._conceptOrm = useService("orm");
        this._conceptDialog = useService("dialog");
        this._conceptNotification = useService("notification");
        this._conceptReport = useService("report");
        this._conceptInvoiced = useState({ uuids: new Set() });
    },

    /**
     * @param {object|null} order
     * @returns {boolean}
     */
    isConceptInvoiceAvailable(order) {
        return canCreateConceptInvoice(order, this._conceptInvoiced.uuids);
    },

    /**
     * @param {object} order – the selected synced (finalized) POS order
     */
    clickConceptInvoice(order) {
        openConceptInvoiceDialog({
            order,
            services: {
                orm: this._conceptOrm,
                dialog: this._conceptDialog,
                notification: this._conceptNotification,
                report: this._conceptReport,
            },
            onGenerated: (o) => this._conceptInvoiced.uuids.add(o.uuid),
        });
    },
});
