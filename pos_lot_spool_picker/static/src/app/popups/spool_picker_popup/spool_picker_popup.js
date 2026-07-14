/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { suggestAllocation, allocatedTotal } from "@pos_lot_spool_picker/app/spool_allocation";

/**
 * @typedef {Object} SpoolLot
 * @property {number} id
 * @property {string} name
 * @property {number} remaining
 * @property {string} location_name
 */

export class SpoolPickerPopup extends Component {
    static template = "pos_lot_spool_picker.SpoolPickerPopup";
    static components = { Dialog };
    static props = {
        productName: String,
        requested: Number,
        lots: Array, // SpoolLot[]
        enforceStock: { type: Boolean, optional: true },
        refresh: { type: Function, optional: true }, // async () => SpoolLot[]
        getPayload: Function,
        close: Function,
    };

    setup() {
        const suggested = suggestAllocation(this.props.lots, this.props.requested);
        const qtyById = Object.fromEntries(suggested.map((a) => [a.id, a.qty]));
        this.state = useState({
            requested: this.props.requested,
            lots: this.props.lots.map((l) => ({ ...l, qty: qtyById[l.id] || 0 })),
            vanishedNotice: "",
        });
    }

    get assigned() {
        return allocatedTotal(this.state.lots);
    }

    get isComplete() {
        return this.assigned > 0 && Math.abs(this.assigned - this.state.requested) < 1e-6;
    }

    get isUnder() {
        return this.assigned + 1e-6 < this.state.requested;
    }

    lotOverStock(lot) {
        return (lot.qty || 0) - lot.remaining > 1e-6;
    }

    get anyOverStock() {
        return this.state.lots.some((l) => this.lotOverStock(l));
    }

    get canConfirm() {
        if (this.assigned <= 0) {
            return false;
        }
        return this.props.enforceStock ? !this.anyOverStock : true;
    }

    setQty(lot, value) {
        lot.qty = parseFloat(value) || 0;
    }

    setRequested(value) {
        this.state.requested = parseFloat(value) || 0;
    }

    async onRefresh() {
        if (!this.props.refresh) {
            return;
        }
        const fresh = await this.props.refresh();
        const freshIds = new Set(fresh.map((l) => l.id));
        const qtyById = Object.fromEntries(this.state.lots.map((l) => [l.id, l.qty]));
        const vanished = this.state.lots.filter((l) => l.qty > 0 && !freshIds.has(l.id));
        this.state.vanishedNotice = vanished.length
            ? _t("No longer available, assigned meters removed: %(names)s", {
                  names: vanished.map((l) => l.name).join(", "),
              })
            : "";
        this.state.lots = fresh.map((l) => ({ ...l, qty: qtyById[l.id] || 0 }));
    }

    confirm() {
        if (!this.canConfirm) {
            return;
        }
        const allocation = this.state.lots
            .filter((l) => (l.qty || 0) > 0)
            .map((l) => ({ lot_name: l.name, id: l.id, qty: l.qty }));
        this.props.getPayload(allocation);
        this.props.close();
    }

    cancel() {
        this.props.close();
    }

    warningText(lot) {
        if (!this.lotOverStock(lot)) {
            return "";
        }
        return _t("Assigning %(qty)s but only %(rem)s in stock", {
            qty: lot.qty,
            rem: lot.remaining,
        });
    }
}
