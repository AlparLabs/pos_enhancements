# POS Product List View

Adds a list view mode to the Odoo 19 POS product screen, alongside the native card grid.
The cashier switches between the two with one button; the grid is left untouched.

## Why

The native product card shows three things and no more: the image, the product name and
the cart quantity badge
(`point_of_sale/static/src/app/components/product_card/product_card.xml:12-27`). No price,
no internal reference, no unit of measure. The only other element in that template is the
combo extra price, which renders inside the combo popup, not on the product screen.

That is fine for a coffee shop with forty visually distinct products. It stops helping at a
hardware counter with six hundred SKUs where "Cable 2x1.5mm" and "Cable 2x2.5mm" are the
same grey rectangle with the same photo, and the cashier has to remember which one costs
what. The list mode trades the image-first layout for aligned columns you can scan
vertically.

## What it shows

| Column | Default | Notes |
| --- | --- | --- |
| Product name | Always on | Truncates rather than wrapping, so the row height never changes |
| Price | Always on | Priced through the order's pricelist and fiscal position, tax-in or tax-out per `iface_tax_included` — the same number the orderline will charge |
| Thumbnail | Shown | 32x32, from the product's own image |
| Internal reference | Shown | `default_code` |
| Unit of measure | Hidden | |
| Barcode | Hidden | |

Barcodes are hidden on purpose. A barcode is scanned, not read: on a tablet the column
costs 9rem of width that the product name needs far more, and the cashier who is reading it
off the screen is doing something the scanner should have done. The column exists for the
setups that genuinely need it — turn it on and it lines up with the rest.

Rows keep the native behaviour end to end: click adds the product to the order, keyboard
Space does the same, and long-press opens the product info popup. The list reuses the
product screen's own `addProductToOrder` and its `longPressHandlers` instance rather than
reimplementing either, so there is no second code path to keep in sync.

## Why there is no stock column

Because there is no honest way to render one.

`qty_available` is not among the fields the POS loads into the frontend —
`point_of_sale/models/product_template.py:170-176` lists them, and stock is not there.
The only way to reach it from the POS is the `get_product_info_pos` RPC
(`point_of_sale/models/product_template.py:349`), which is one round trip per product and
returns a per-warehouse breakdown assembled at call time (`:391-399`).

Loading stock at session start to fill a column would produce a number frozen at the moment
the register opened. On a busy day that column is wrong by mid-morning, and a wrong stock
figure on screen is worse than no figure at all, because the cashier believes it.

**Long-press a row instead.** That opens the native product info popup with per-warehouse
on-hand, free and forecasted quantities, every pricelist's price, and the margin — read
live, at the moment you ask. It is the same path the card grid offers, and it is the right
one: stock is a question you ask about one product, not a column you scan.

## Settings

**Point of Sale → Configuration → Settings → Product & PoS categories → Product List View**

- **Default Product View** — Grid or List. Per POS.
- **Show thumbnail** / **Show internal reference** / **Show unit of measure** /
  **Show barcode** — per POS column toggles.

The default view is a seed, not a lock. Whichever view the cashier switches to is remembered
per device in `localStorage`, and the device's choice wins over the POS default on the next
session. That is deliberate: the same POS configuration is often driven from a small tablet
on the floor and a wide screen at the counter, and the tablet can sit in list mode while the
counter stays on the grid, with no second `pos.config` record to maintain.

## Maintenance

The module's only contact surface with core is
`static/src/app/overrides/product_screen.xml` — two XPath expressions against
`point_of_sale.ProductScreen`:

1. `//CategorySelector` (position `before`) — where the view toggle is inserted. It must
   stay outside the product container, otherwise switching to list mode would remove the
   only way back to the grid.
2. `//div[hasclass('product-list')]` (position `replace`) — the native grid container
   (`point_of_sale/static/src/app/screens/product_screen/product_screen.xml:32`), wrapped in
   a `t-if`/`t-else` so the original node is preserved rather than reimplemented.

When porting to a new Odoo version, check those two anchors first. Everything else is
self-contained components.

### ⚠️ `$0` must stay on a single line, with no surrounding whitespace

In `product_screen.xml`:

```xml
<t t-else="">$0</t>
```

Do not reformat this line. Do not let an XML formatter indent it. Do not "tidy" it into:

```xml
<t t-else="">
    $0
</t>
```

The substitution is found with the XPath `.//*[text()='$0']`
(`web/static/src/core/template_inheritance.js:268`), and an XPath string comparison uses the
text node's **full** string-value. The file carries `xml:space="preserve"`, so the indented
form has the value `"\n    $0\n"` and the element no longer matches.

The failure is silent and total. On a miss the substitution loop simply does not run, but
`target.replaceWith(...nodes)` executes regardless and deletes the native product grid.
Grid mode then renders the literal text `$0` and zero products — nothing thrown, nothing in
the console. This module's one guarantee is to be inert in grid mode; a stray indent inverts
that into a complete break of the native screen.

The tour (`static/tours/product_list_view_tour.js`) carries a step asserting
`.rightpane div.product-list` still exists in grid mode. That step is the only thing that
makes this failure loud. Do not remove it either.

### Watch item: core's dormant list mode

`point_of_sale/static/src/app/services/pos_store.js:747-753` defines a `productViewMode`
getter that reads `this.productListView`. That property is never assigned anywhere in the
Odoo 19 tree — `productListView` appears exactly once, in the getter that reads it — and the
getter only ever returns Bootstrap flex utility classes for the mobile card layout. It looks
like the start of a list mode Odoo began and did not finish.

This module does not build on it, and uses distinct identifiers
(`productListViewMode`, `isProductListView`, `toggleProductListView`) so there is no runtime
collision. But if a future version wires that property up, this module is the thing to
re-evaluate first.

## Tests

- `tests/test_pos_config_defaults.py` — field defaults and the settings write-through.
- `tests/test_product_list_view_tour.py` + `static/tours/product_list_view_tour.js` —
  the critical path: grid renders natively, toggle switches to the list, a row click
  produces the same orderline the grid would, long-press opens the product info popup.
- `static/tests/` — unit tests for the view-mode resolution and the price helpers.
