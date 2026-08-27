/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * @typedef {Object} ConceptInvoicePopupProps
 * @property {Object} order - The current POS order (used to pre-fill the partner)
 * @property {(payload: {concept: string, partnerId: number|false}) => Promise<void>} onConfirm
 * @property {() => void} close - OWL dialog close callback
 */

/**
 * @typedef {Object} ConceptInvoicePopupState
 * @property {string} concept
 * @property {string} partnerQuery
 * @property {number|false} partnerId
 * @property {string} partnerName
 * @property {Array<{id: number, name: string}>} searchResults
 * @property {boolean} searching
 * @property {boolean} showResults
 * @property {boolean} loading
 */

export class ConceptInvoicePopup extends Component {
    static template = "pos_concept_invoice.ConceptInvoicePopup";
    static components = { Dialog };
    static props = {
        order: Object,
        onConfirm: { type: Function, optional: true },
        getPayload: { type: Function, optional: true },
        close: Function,
    };

    setup() {
        this.orm = useService("orm");
        this._searchTimeout = null;

        const orderPartner = this.props.order?.partner_id;
        /** @type {ConceptInvoicePopupState} */
        this.state = useState({
            concept: this.props.order?.concept_invoice_name || "",
            partnerQuery: orderPartner?.name || "",
            partnerId: orderPartner?.id || false,
            partnerName: orderPartner?.name || "",
            searchResults: [],
            searching: false,
            showResults: false,
            loading: false,
        });
    }

    // ── Partner search ────────────────────────────────────────────────────────

    /**
     * @param {InputEvent} ev
     */
    onPartnerInput(ev) {
        const query = ev.target.value;
        this.state.partnerQuery = query;
        this.state.partnerId = false;
        this.state.partnerName = "";

        clearTimeout(this._searchTimeout);

        if (!query || query.trim().length < 2) {
            this.state.searchResults = [];
            this.state.showResults = false;
            return;
        }

        this.state.searching = true;
        this.state.showResults = true;
        this._searchTimeout = setTimeout(async () => {
            const trimmed = query.trim();
            try {
                this.state.searchResults = await this.orm.searchRead(
                    "res.partner",
                    [
                        ["name", "ilike", trimmed],
                        "|",
                        ["customer_rank", ">", 0],
                        ["is_company", "=", true],
                    ],
                    ["id", "name"],
                    { limit: 8 }
                );
            } catch {
                this.state.searchResults = [];
            } finally {
                this.state.searching = false;
            }
        }, 300);
    }

    /**
     * @param {{ id: number, name: string }} partner
     */
    selectPartner(partner) {
        this.state.partnerId = partner.id;
        this.state.partnerName = partner.name;
        this.state.partnerQuery = partner.name;
        this.state.searchResults = [];
        this.state.showResults = false;
    }

    clearPartner() {
        this.state.partnerId = false;
        this.state.partnerName = "";
        this.state.partnerQuery = "";
        this.state.searchResults = [];
        this.state.showResults = false;
    }

    // ── Validation ────────────────────────────────────────────────────────────

    get canConfirm() {
        return this.state.concept.trim().length > 0 && this.state.partnerId && !this.state.loading;
    }

    // ── Confirm ───────────────────────────────────────────────────────────────

    async confirm() {
        if (!this.canConfirm) return;
        this.state.loading = true;
        const payload = {
            concept: this.state.concept.trim(),
            partnerId: this.state.partnerId,
        };
        try {
            if (this.props.onConfirm) {
                await this.props.onConfirm(payload);
            }
            if (this.props.getPayload) {
                this.props.getPayload(payload);
            }
        } finally {
            this.state.loading = false;
        }
        this.props.close();
    }
}
