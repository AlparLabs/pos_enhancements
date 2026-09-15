/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * Determines whether an order line has already received a loyalty discount or promotion
     * from another reward currently applied to the order.
     *
     * @param {Object} line - pos.order.line record
     * @param {Object} currentReward - loyalty.reward record currently being evaluated
     * @returns {boolean}
     */
    _isLineDiscountedByOtherReward(line, currentReward) {
        const orderLines = this.getOrderlines();
        const otherRewardLines = orderLines.filter(
            (l) => (l.is_reward_line || l.reward_id) && l.reward_id && l.reward_id.id !== currentReward.id
        );

        if (!otherRewardLines.length) {
            return false;
        }

        const lineProductId = line.getProduct()?.id;
        const comboProductId = line.combo_parent_id?.product_id?.id;
        const targetProductIds = [lineProductId, comboProductId].filter(Boolean);

        for (const rewardLine of otherRewardLines) {
            const otherReward = rewardLine.reward_id;
            if (!otherReward) {
                continue;
            }

            // 1. Free product rewards (reward_type === 'product')
            if (otherReward.reward_type === "product") {
                const rewardedProductId =
                    rewardLine._reward_product_id?.id || otherReward.reward_product_id?.id;
                if (rewardedProductId && targetProductIds.includes(rewardedProductId)) {
                    return true;
                }
                const freeProductIds = (otherReward.reward_product_ids || []).map((p) =>
                    typeof p === "object" ? p.id : p
                );
                if (freeProductIds.some((id) => targetProductIds.includes(id))) {
                    return true;
                }
            }

            // 2. Discount rewards (reward_type === 'discount')
            if (otherReward.reward_type === "discount") {
                // 2a. Specific product discounts
                if (otherReward.discount_applicability === "specific") {
                    const specificProductIds = (otherReward.all_discount_product_ids || []).map((p) =>
                        typeof p === "object" ? p.id : p
                    );
                    if (targetProductIds.some((id) => specificProductIds.includes(id))) {
                        return true;
                    }
                }

                // 2b. Cheapest product discount
                if (otherReward.discount_applicability === "cheapest") {
                    const cheapestLine = this._getCheapestLine(otherReward);
                    if (
                        cheapestLine &&
                        (cheapestLine === line ||
                            cheapestLine.uuid === line.uuid ||
                            cheapestLine.id === line.id)
                    ) {
                        return true;
                    }
                }

                // 2c. Order-level discount
                // Only consider the line discounted by an order-level discount if currentReward
                // is ALSO an order-level discount (prevent stacking multiple global discounts).
                // Specific product discounts take priority over order discounts and must not be blocked by them.
                if (otherReward.discount_applicability === "order") {
                    if (currentReward.discount_applicability === "order") {
                        return true;
                    }
                }
            }
        }

        return false;
    },

    /**
     * Checks if a reward line belongs to an excluded product or category.
     * Used when stacking is permitted (exclude_already_discounted is false) to ensure
     * that discounts on excluded products do not artificially reduce the base of other products.
     *
     * @param {Object} rewardLine - pos.order.line record (is_reward_line === true)
     * @param {Object} reward - loyalty.reward record
     * @returns {boolean}
     */
    _isRewardLineExcluded(rewardLine, reward) {
        if (!reward.all_excluded_product_ids || !reward.all_excluded_product_ids.length) {
            return false;
        }
        const excludedIds = new Set(
            reward.all_excluded_product_ids.map((p) => (typeof p === "object" ? p.id : p))
        );
        const rewardedProdId = rewardLine._reward_product_id?.id || rewardLine.getProduct()?.id;
        if (rewardedProdId && excludedIds.has(rewardedProdId)) {
            return true;
        }
        const lineReward = rewardLine.reward_id;
        if (lineReward && lineReward.discount_applicability === "specific") {
            const specificIds = (lineReward.all_discount_product_ids || []).map((p) =>
                typeof p === "object" ? p.id : p
            );
            if (specificIds.some((id) => excludedIds.has(id))) {
                return true;
            }
        }
        return false;
    },

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

        // Reward lines themselves are never discounted as products
        if (line.is_reward_line || line.reward_id) {
            return true;
        }

        // 1. Excluded products & categories
        if (reward.all_excluded_product_ids && reward.all_excluded_product_ids.length > 0) {
            const excludedIds = new Set(
                reward.all_excluded_product_ids.map((p) => (typeof p === "object" ? p.id : p))
            );
            const productId = line.getProduct()?.id;
            const parentProductId = line.combo_parent_id?.product_id?.id;
            if (
                (productId && excludedIds.has(productId)) ||
                (parentProductId && excludedIds.has(parentProductId))
            ) {
                return true;
            }
        }

        // 2. Non-stacking: Exclude lines with existing discount or previous promotion
        if (reward.exclude_already_discounted) {
            // Check manual or pricelist discount percentage on the line
            if (line.discount > 0 || (line.get_discount && line.get_discount() > 0)) {
                return true;
            }
            if (line._reward_product_id) {
                return true;
            }
            // Check if this line already received a discount or gift from another loyalty reward
            if (this._isLineDiscountedByOtherReward(line, reward)) {
                return true;
            }
        }

        return false;
    },

    /**
     * Computes discountable amount for order-level discounts,
     * skipping any line that matches exclusion criteria or has already been discounted.
     */
    _getDiscountableOnOrder(reward) {
        let discountable = 0;
        const discountablePerTax = {};
        for (const line of this.getOrderlines()) {
            if (!line.getQuantity()) {
                continue;
            }
            if (line.is_reward_line || line.reward_id) {
                // Skip reward lines of this reward itself
                if (line.reward_id?.id === reward.id) {
                    continue;
                }
                // When exclude_already_discounted is enabled, previous reward lines must NOT
                // be subtracted from the discountable base of eligible products
                if (reward.exclude_already_discounted) {
                    continue;
                }
                // When stacking is allowed, only include reward lines if the discounted item is not excluded
                if (this._isRewardLineExcluded(line, reward)) {
                    continue;
                }
            } else if (this._isLineExcludedFromReward(line, reward)) {
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
     * Computes discountable amount on specific products, respecting excluded items
     * and preventing stacking if exclude_already_discounted is active.
     */
    _getDiscountableOnSpecific(reward) {
        const applicableProductIds = new Set(reward.all_discount_product_ids.map((p) => p.id));
        const linesToDiscount = [];
        const discountLinesPerReward = {};
        const orderLines = this.getOrderlines();
        const orderProducts = orderLines.map((line) => line.product_id.id);
        const remainingAmountPerLine = {};
        for (const line of orderLines) {
            if (!line.getQuantity() || !line.price_unit) {
                continue;
            }
            remainingAmountPerLine[line.uuid] = line.prices.total_included;
            const product_id = line.combo_parent_id?.product_id.id || line.getProduct().id;
            if (
                applicableProductIds.has(product_id) ||
                (line._reward_product_id && applicableProductIds.has(line._reward_product_id.id))
            ) {
                if (!this._isLineExcludedFromReward(line, reward)) {
                    linesToDiscount.push(line);
                }
            } else if (line.reward_id) {
                const lineReward = line.reward_id;
                const lineRewardApplicableProductsIds = new Set(
                    lineReward.all_discount_product_ids.map((p) => p.id)
                );
                if (
                    lineReward.id === reward.id ||
                    (orderProducts.some(
                        (product) =>
                            lineRewardApplicableProductsIds.has(product) &&
                            applicableProductIds.has(product)
                    ) &&
                        lineReward.reward_type === "discount" &&
                        lineReward.discount_mode != "percent")
                ) {
                    linesToDiscount.push(line);
                }
                if (!discountLinesPerReward[line.reward_identifier_code]) {
                    discountLinesPerReward[line.reward_identifier_code] = [];
                }
                discountLinesPerReward[line.reward_identifier_code].push(line);
            }
        }

        let cheapestLine = false;
        for (const lines of Object.values(discountLinesPerReward)) {
            const lineReward = lines[0].reward_id;
            if (lineReward.reward_type !== "discount") {
                continue;
            }
            // If reward excludes already discounted, an order-level discount does not reduce the specific discount base
            if (lineReward.discount_applicability === "order" && reward.exclude_already_discounted) {
                continue;
            }
            let discountedLines = orderLines;
            if (lineReward.discount_applicability === "cheapest") {
                cheapestLine = cheapestLine || this._getCheapestLine(lineReward);
                discountedLines = [cheapestLine];
            } else if (lineReward.discount_applicability === "specific") {
                discountedLines = this._getSpecificDiscountableLines(lineReward);
            }
            if (!discountedLines.length) {
                continue;
            }
            if (lineReward.discount_mode === "percent") {
                const discount = lineReward.discount / 100;
                for (const line of discountedLines) {
                    if (line.reward_id) {
                        continue;
                    }
                    if (lineReward.discount_applicability === "cheapest") {
                        remainingAmountPerLine[line.uuid] *= 1 - discount / line.getQuantity();
                    } else {
                        remainingAmountPerLine[line.uuid] *= 1 - discount;
                    }
                }
            }
        }

        let discountable = 0;
        const discountablePerTax = {};
        for (const line of linesToDiscount) {
            discountable += remainingAmountPerLine[line.uuid];
            const taxKey = ["ewallet", "gift_card"].includes(reward.program_id.program_type)
                ? line.tax_ids.map((t) => t.id)
                : line.tax_ids.filter((t) => t.amount_type !== "fixed").map((t) => t.id);
            if (!discountablePerTax[taxKey]) {
                discountablePerTax[taxKey] = 0;
            }
            discountablePerTax[taxKey] +=
                line.basePrice * (remainingAmountPerLine[line.uuid] / line.prices.total_included);
        }
        return { discountable, discountablePerTax };
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

    /**
     * Refreshes the currently applied rewards.
     * Orders rewards so specific product promotions are evaluated BEFORE order-level promotions,
     * ensuring non-stacking exclusions work reliably regardless of the order in which coupons were added.
     */
    _updateRewardLines() {
        if (!this.lines.length) {
            return;
        }
        const rewardLines = this._get_reward_lines();
        if (!rewardLines.length) {
            return;
        }
        const productRewards = [];
        const otherRewards = [];
        const paymentRewards = []; // Gift card and ewallet rewards are considered payments and must stay at the end
        for (const line of rewardLines) {
            const claimedReward = {
                reward: line.reward_id,
                coupon_id: line.coupon_id?.id,
                args: {
                    product: line._reward_product_id,
                    price: line.price_unit,
                    quantity: line.qty,
                    cost: line.points_cost,
                },
                reward_identifier_code: line.reward_identifier_code,
            };
            if (
                claimedReward.reward.program_id.program_type === "gift_card" ||
                claimedReward.reward.program_id.program_type === "ewallet"
            ) {
                paymentRewards.push(claimedReward);
            } else if (claimedReward.reward.reward_type === "product") {
                productRewards.push(claimedReward);
            } else if (
                !otherRewards.some(
                    (reward) =>
                        reward.reward_identifier_code === claimedReward.reward_identifier_code
                )
            ) {
                otherRewards.push(claimedReward);
            }
            line.delete();
        }

        // Hierarchy of discounts:
        // Priority 1: Specific product discounts
        // Priority 2: Cheapest product discounts
        // Priority 3: Order-level discounts
        const getRewardPriority = (r) => {
            if (r.reward.discount_applicability === "specific") {
                return 1;
            }
            if (r.reward.discount_applicability === "cheapest") {
                return 2;
            }
            return 3; // "order"
        };
        otherRewards.sort((a, b) => getRewardPriority(a) - getRewardPriority(b));

        const allRewards = productRewards.concat(otherRewards).concat(paymentRewards);
        const allRewardsMerged = [];
        allRewards.forEach((reward) => {
            if (reward.reward.reward_type == "discount") {
                allRewardsMerged.push(reward);
            } else {
                const reward_index = allRewardsMerged.findIndex(
                    (item) =>
                        item.reward.id === reward.reward.id && item.args.price === reward.args.price
                );
                if (reward_index > -1) {
                    allRewardsMerged[reward_index].args.quantity += reward.args.quantity;
                    allRewardsMerged[reward_index].args.cost += reward.args.cost;
                } else {
                    allRewardsMerged.push(reward);
                }
            }
        });
        let changed = false;
        for (const claimedReward of allRewardsMerged) {
            // For existing coupons check that they are still claimed, they can exist in either `couponPointChanges` or `codeActivatedCoupons`
            if (
                !this._code_activated_coupon_ids.find(
                    (coupon) => coupon.id === claimedReward.coupon_id
                ) &&
                !this.uiState.couponPointChanges[claimedReward.coupon_id]
            ) {
                continue;
            }
            if (
                claimedReward.reward.program_id.program_type === "coupons" &&
                this.lines.find(
                    (rewardline) => rewardline.reward_id?.id === claimedReward.reward.id
                )
            ) {
                continue;
            }

            // If there is only one possible reward we try to claim the most possible out of it
            if (
                claimedReward.reward.reward_product_ids?.length === 1 &&
                allRewardsMerged.filter(
                    (reward) => reward.reward.program_id.id === claimedReward.reward.program_id.id
                ).length === 1
            ) {
                delete claimedReward.args["quantity"];
            }
            this._applyReward(claimedReward.reward, claimedReward.coupon_id, claimedReward.args);

            const newRewardLines = this._get_reward_lines();
            const number_of_line_changed = newRewardLines.length !== rewardLines.length;
            const reward_amount_changed =
                newRewardLines.reduce((sum, line) => sum + line.qty * line.price_unit, 0) !==
                rewardLines.reduce((sum, line) => sum + line.qty * line.price_unit, 0);
            if (number_of_line_changed || reward_amount_changed) {
                changed = true;
            }
        }
        return changed;
    },
});
