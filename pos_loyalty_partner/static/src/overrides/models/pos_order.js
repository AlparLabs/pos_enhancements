/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * Verifies whether a loyalty rule is applicable to the current order's partner.
     * If the rule defines no partner restrictions, it applies to any partner/order.
     * If the rule defines partner tags or specific partners, the order must have
     * an assigned partner that satisfies at least one of the conditions.
     *
     * @param {Object} rule - loyalty.rule model record
     * @returns {boolean}
     */
    _isRuleApplicableToPartner(rule) {
        const hasCategoryFilter = Boolean(rule.partner_category_ids && rule.partner_category_ids.length > 0);
        const hasPartnerFilter = Boolean(rule.partner_ids && rule.partner_ids.length > 0);

        // If no partner restriction is set, rule is open to all
        if (!hasCategoryFilter && !hasPartnerFilter) {
            return true;
        }

        const partner = this.getPartner();
        if (!partner) {
            return false;
        }

        const partnerId = partner.id;

        // Check specific partner IDs
        if (hasPartnerFilter) {
            const rulePartnerIds = rule.partner_ids.map((p) => (typeof p === "object" ? p.id : p));
            if (rulePartnerIds.includes(partnerId)) {
                return true;
            }
        }

        // Check partner categories/tags
        if (hasCategoryFilter) {
            const partnerCatIds = Array.isArray(partner.category_id)
                ? partner.category_id.map((c) => (typeof c === "object" ? c.id : c))
                : [];
            const ruleCatIds = rule.partner_category_ids.map((c) => (typeof c === "object" ? c.id : c));
            if (ruleCatIds.some((catId) => partnerCatIds.includes(catId))) {
                return true;
            }
        }

        return false;
    },

    /**
     * Check if a program is applicable to the order.
     * If all active rules in the program require specific partner eligibility
     * and none match the current order's partner, the program is considered inapplicable.
     */
    _programIsApplicable(program) {
        if (!super._programIsApplicable(program)) {
            return false;
        }
        if (program.rule_ids && program.rule_ids.length > 0) {
            const applicableRules = program.rule_ids.filter((rule) => {
                if (program.trigger === "auto") {
                    return (
                        rule.mode === "auto" ||
                        this.uiState.codeActivatedProgramRules.includes(rule.id)
                    );
                }
                return this.uiState.codeActivatedProgramRules.includes(rule.id);
            });
            if (
                applicableRules.length > 0 &&
                !applicableRules.some((rule) => this._isRuleApplicableToPartner(rule))
            ) {
                return false;
            }
        }
        return true;
    },

    /**
     * In points calculation, filter rules per program so that points are only
     * accumulated for rules where the customer is eligible.
     */
    pointsForPrograms(programs) {
        const originalRules = new Map();
        for (const program of programs) {
            if (program.rule_ids) {
                originalRules.set(program, program.rule_ids);
                program.rule_ids = program.rule_ids.filter((rule) =>
                    this._isRuleApplicableToPartner(rule)
                );
            }
        }
        try {
            return super.pointsForPrograms(programs);
        } finally {
            for (const [program, rules] of originalRules.entries()) {
                program.rule_ids = rules;
            }
        }
    },

    /**
     * Check if the order can generate rewards from a coupon program.
     */
    _canGenerateRewards(couponProgram, orderTotalWithTax, orderTotalWithoutTax) {
        for (const rule of couponProgram.rule_ids || []) {
            if (!this._isRuleApplicableToPartner(rule)) {
                return false;
            }
        }
        return super._canGenerateRewards(couponProgram, orderTotalWithTax, orderTotalWithoutTax);
    },

    /**
     * Compute items matching a rule. If the partner is not eligible for this rule, returns 0.
     */
    _computeNItems(rule) {
        if (!this._isRuleApplicableToPartner(rule)) {
            return 0;
        }
        return super._computeNItems(rule);
    },
});
