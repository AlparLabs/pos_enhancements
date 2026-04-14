/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { Orderline } from "@pos_preparation_display/app/components/orderline/orderline";
import { useService } from "@web/core/utils/hooks"; // Import useService for ORM access
import { PreparationDisplay } from "@pos_preparation_display/app/models/preparation_display";


// A utility function to pause for a given number of milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


patch(PreparationDisplay.prototype, {
    async checkOrderlineVisibility(orderline) {

        const selectedCategories = this.selectedCategories;
        const selectedProducts = this.selectedProducts;

        // Access ORM service
//        const orm = useService("orm");

        try {
            // Fetch KOT details for the specific orderline
            const kotDetails = await this.orm.call("pos.order.line", "get_kot_details", [
                orderline.order.posOrderId,
                orderline.productId,
            ]);

    await sleep(200);
            // Update the orderline directly with the fetched KOT details
            orderline.kot_note = kotDetails.kot_note || '';
            orderline.kot_is_set = kotDetails.kot_is_set || false;

            // Manually trigger a re-render to apply the changes
//            this.render();
        } catch (error) {
            console.error("Error fetching KOT details:", error);
        }

        // Visibility logic based on categories, products, or default view
        return (
            orderline.productCategoryIds.some((categoryId) => selectedCategories.has(categoryId)) ||
            selectedProducts.has(orderline.productId) ||
            (selectedCategories.size === 0 && selectedProducts.size === 0)
        );
    },
});