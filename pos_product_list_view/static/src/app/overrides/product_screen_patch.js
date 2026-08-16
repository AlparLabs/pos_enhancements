import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { patch } from "@web/core/utils/patch";
import { ProductList } from "@pos_product_list_view/app/product_list/product_list";
import { ProductViewToggle } from "@pos_product_list_view/app/view_toggle/view_toggle";

// The CLASS, not the prototype: `components` is a static property, and patching the
// prototype would leave ProductScreen.components untouched, so OWL would not resolve
// <ProductList/> or <ProductViewToggle/> in the inherited template. Spreading the
// existing map first keeps every native child component registered — same shape as
// core's own pos_restaurant/.../control_buttons.js:44-49.
patch(ProductScreen, {
    components: { ...ProductScreen.components, ProductList, ProductViewToggle },
});
