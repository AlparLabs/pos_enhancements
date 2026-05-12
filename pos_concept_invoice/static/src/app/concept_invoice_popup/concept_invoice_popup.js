/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * ConceptInvoicePopup
 *
 * Modal dialog that collects:
 *   - Concept description (required, free text)
 *   - Customer (required, search-as-you-type against res.partner)
 *
 * Pre-fills the partner field from the active POS order if one is already set.
 *
 * Props
 *   order     {Object}   – the current POS order (used to pre-fill the partner)
 *   onConfirm {Function} – called with { concept, partnerId } when the cashier confirms
 *   close     {Function} – OWL dialog close callback
 */
export class ConceptInvoicePopup extends Component {
    static template = "pos_concept_invoice.ConceptInvoicePopup";
    static components = { Dialog };
    static props = {
        order: Object,
        onConfirm: Function,
        close: Function,
    };

    setup() {
        this.orm = useService("orm");

        // Pre-fill partner from the POS order when available
        const orderPartner = this.props.order?.partner_id;
        this.state = useState({
            concept: "",
            partnerQuery: orderPartner?.name || "",
            partnerId: orderPartner?.id || false,
            partnerName: orderPartner?.name || "",
            searchResults: [],
            searching: false,
            showResults: false,
        });
    }

    // ── Partner search ────────────────────────────────────────────────────────

    async onPartnerInput(ev) {
        const query = ev.target.value;
        this.state.partnerQuery = query;
        this.state.partnerId = false;       // clear selection while typing
        this.state.partnerName = "";

        if (!query || query.trim().length < 2) {
            this.state.searchResults = [];
            this.state.showResults = false;
            return;
        }

        this.state.searching = true;
        this.state.showResults = true;
        try {
            this.state.searchResults = await this.orm.searchRead(
                "res.partner",
                [
                    ["name", "ilike", query.trim()],
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
    }

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
        return this.state.concept.trim().length > 0 && this.state.partnerId;
    }

    // ── Confirm ───────────────────────────────────────────────────────────────

    confirm() {
        if (!this.canConfirm) return;
        this.props.onConfirm({
            concept: this.state.concept.trim(),
            partnerId: this.state.partnerId,
        });
        this.props.close();
    }
}
