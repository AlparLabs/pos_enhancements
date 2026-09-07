/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * Determines whether an order line should be excluded from a loyalty reward.
     * Checks:
     * 1. If the line is already a reward line.
     * 2. If the product is in the reward's pre-computed excluded products list.
     * 3. If exclude_already_discounted is enabled, excludes lines with manual/pricelist discounts
     *    or lines already rewarded by another promotion.
     *
     * @param {Object} line - pos.order.line record
     * @param {Object} reward - loyalty.reward record
     * @returns {boolean}
     */
    _isLineExcludedFromReward(line, reward) {
        if (!line || !reward) {
            return false;
        }

        // Reward lines themselves are never discounted
        if (line.is_reward_line) {
            return true;
        }

        // 1. Excluded products & categories
        if (reward.all_excluded_product_ids && reward.all_excluded_product_ids.length > 0) {
            const excludedIds = reward.all_excluded_product_ids.map((p) =>
                typeof p === "object" ? p.id : p
            );
            const productId = line.getProduct()?.id;
            if (productId && excludedIds.includes(productId)) {
                return true;
            }
        }

        // 2. Non-stacking: Exclude lines with existing discount or previous promotion
        if (reward.exclude_already_discounted) {
            if (line.discount > 0) {
                return true;
            }
            if (line._reward_product_id) {
                return true;
            }
        }

        return false;
    },

    /**
     * Computes discountable amount for order-level discounts,
     * skipping any line that matches exclusion criteria.
     */
    _getDiscountableOnOrder(reward) {
        let discountable = 0;
        const discountablePerTax = {};
        for (const line of this.getOrderlines()) {
            if (!line.getQuantity() || this._isLineExcludedFromReward(line, reward)) {
                continue;
            }
            const taxKey = ["ewallet", "gift_card"].includes(reward.program_id.program_type)
                ? line.tax_ids.map((t) => t.id)
                : line.tax_ids.filter((t) => t.amount_type !== "fixed").map((t) => t.id);
            discountable += line.prices.total_included;
            if (!discountablePerTax[taxKey]) {
                discountablePerTax[taxKey] = 0;
            }
            discountablePerTax[taxKey] += line.basePrice;
        }
        return { discountable, discountablePerTax };
    },

    /**
     * Computes specific discountable lines, filtering out any excluded lines.
     */
    _getSpecificDiscountableLines(reward) {
        const lines = super._getSpecificDiscountableLines(reward);
        return lines.filter((line) => !this._isLineExcludedFromReward(line, reward));
    },

    /**
     * Selects the cheapest line for a reward, filtering out any excluded lines.
     */
    _getCheapestLine(reward) {
        const applicableProductIds = new Set(reward.all_discount_product_ids.map((p) => p.id));
        const filteredLines = this.getOrderlines().filter(
            (line) =>
                !line.combo_parent_id &&
                !line.reward_id &&
                line.getQuantity() &&
                applicableProductIds.has(line.getProduct().id) &&
                !this._isLineExcludedFromReward(line, reward)
        );
        return filteredLines.toSorted(
            (lineA, lineB) => lineA.comboTotalPrice / lineA.qty - lineB.comboTotalPrice / lineB.qty
        )[0];
    },

    /**
     * Checks if a reward product is part of rules, taking exclusions into account.
     */
    _isRewardProductPartOfRules(reward, product) {
        if (reward.all_excluded_product_ids && reward.all_excluded_product_ids.length > 0) {
            const excludedIds = reward.all_excluded_product_ids.map((p) =>
                typeof p === "object" ? p.id : p
            );
            if (excludedIds.includes(product.id)) {
                return false;
            }
        }
        return super._isRewardProductPartOfRules(reward, product);
    },
});
