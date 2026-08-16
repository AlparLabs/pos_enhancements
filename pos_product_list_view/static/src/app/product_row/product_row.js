import { Component } from "@odoo/owl";
import { formatCurrency } from "@web/core/currency";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { pickTaxTotal, priceOptionsFromOrder } from "@pos_product_list_view/app/product_price";

export class ProductRow extends Component {
    static template = "pos_product_list_view.ProductRow";
    static props = {
        product: Object,
        name: String,
        cartQty: { type: [Number, undefined], optional: true },
        onClick: Function,
        longPressHandlers: Object,
    };

    setup() {
        this.pos = usePos();
    }

    get config() {
        return this.pos.config;
    }

    get imageUrl() {
        // Core builds this URL in product.template.getImageUrl()
        // (models/product_template.js:101). Use the method rather than duplicating the
        // format, so a change in v20 lands here for free.
        return this.config.product_list_show_image ? this.props.product.getImageUrl() : false;
    }

    get price() {
        const product = this.props.product;
        // getTaxDetails reads pricelist/fiscalPosition out of `overridedValues`, not out of
        // the top-level options object (models/accounting/product_template_accounting.js:178-199).
        // Passing them at the top level silently prices at list_price with no fiscal mapping.
        const taxDetails = product.getTaxDetails({
            overridedValues: priceOptionsFromOrder(this.pos.getOrder()),
        });
        const amount = pickTaxTotal(taxDetails, this.config.iface_tax_included);
        return formatCurrency(amount, this.config.currency_id.id);
    }

    get formattedCartQty() {
        return this.env.utils.formatProductQty(this.props.cartQty ?? 0, false);
    }
}
