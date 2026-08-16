# POS Product List View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un modo de vista en lista a la pantalla de productos del POS de Odoo 19, con columnas alineadas (producto, referencia, UdM, código de barras, precio), activable por el cajero y con default configurable por POS.

**Architecture:** Dos xpath sobre `point_of_sale.ProductScreen`. El primero reemplaza el contenedor de productos por un `t-if` que elige entre la grilla nativa (preservada con `$0`) y un componente `ProductList` propio; el segundo inserta el botón de toggle. `ProductList` consume la misma fuente (`pos.productToDisplayByCateg`) y recibe por props el mismo handler de alta (`addProductToOrder`) y el mismo objeto `longPressHandlers` que usa el card nativo. El estado del modo vive en un patch de `PosStore`, respaldado por helpers puros testeables.

**Tech Stack:** Odoo 19, OWL 2, Hoot (tests unitarios JS), `TestPoSCommon` / `TestPointOfSaleHttpCommon` (tests Python y tour).

**Spec:** `docs/superpowers/specs/2026-08-16-pos-product-list-view-design.md`

---

## Referencia de APIs del core (verificadas en `odoo-19.0` el 2026-08-16)

Estas rutas y firmas fueron leídas del fuente. No inventar variantes.

| Qué | Dónde |
|---|---|
| Template a heredar | `point_of_sale.ProductScreen` en `point_of_sale/static/src/app/screens/product_screen/product_screen.xml` |
| Contenedor de productos | `<div class="product-list d-grid ...">` con `t-foreach="pos.productToDisplayByCateg"` (línea 32) |
| Alta de producto | `ProductScreen.addProductToOrder(product)` — recibe un **`product.template`** (`product_screen.js:418`) |
| Nombre a mostrar | `ProductScreen.getProductName(product)` (`product_screen.js:207`) |
| Long-press | `ProductScreen.longPressHandlers` = `useLongPress((product) => pos.onProductInfoClick(product))` (`product_screen.js:114`) |
| Cantidad en carrito | `ProductScreen.state.quantityByProductTmplId` (`product_screen.js:62`) |
| Hook POS | `usePos` de `@point_of_sale/app/hooks/pos_hook` |
| Detalle de impuestos | `productTemplate.getTaxDetails({ pricelist, fiscalPosition })` → `{ total_included, total_excluded }` (`models/accounting/product_template_accounting.js:194`) |
| Formato de moneda | `formatCurrency` de `@web/core/currency` |
| Tarifa / posición fiscal activas | `pos.getOrder()?.pricelist_id`, `pos.getOrder()?.fiscal_position_id` |
| Bloque de ajustes | `<block id="product_and_category_block">` en `point_of_sale/views/res_config_settings_views.xml:183` |

**Trampa conocida:** existe un getter `product.displayPriceUnit` que parece resolver esto solo. **No usarlo.** Llama a `getTaxDetails()` sin opciones, y `getPrice(pricelist=false)` retorna `list_price` crudo (`product_template_accounting.js:81-83`), ignorando la tarifa activa. Con una tarifa configurada mostraría precios incorrectos.

**Trampa conocida 2:** `pos.config` no define `_load_pos_data_fields`, y el mixin hace `read([])`, que en Odoo lee todos los campos. Los campos nuevos llegan al front solos. **No agregar un override.**

---

## Estructura de archivos

```
pos_product_list_view/
├── __init__.py                                   → from . import models
├── __manifest__.py
├── README.md
├── models/
│   ├── __init__.py
│   ├── pos_config.py                             → los 5 campos
│   └── res_config_settings.py                    → 5 related fields
├── views/
│   └── res_config_settings_views.xml
├── tests/
│   ├── __init__.py
│   ├── test_pos_config_defaults.py               → defaults de los campos
│   └── test_product_list_view_tour.py            → lanza el tour
└── static/
    ├── src/
    │   ├── app/
    │   │   ├── view_mode.js                      → helpers puros de modo/localStorage
    │   │   ├── product_price.js                  → helpers puros de precio
    │   │   ├── pos_store_patch.js                → estado del modo en PosStore
    │   │   ├── product_row/
    │   │   │   ├── product_row.js
    │   │   │   └── product_row.xml
    │   │   ├── product_list/
    │   │   │   ├── product_list.js
    │   │   │   └── product_list.xml
    │   │   ├── view_toggle/
    │   │   │   ├── view_toggle.js
    │   │   │   └── view_toggle.xml
    │   │   └── overrides/
    │   │       ├── product_screen.xml            → los dos xpath
    │   │       └── product_screen_patch.js       → registra los componentes
    │   └── scss/
    │       └── product_list.scss
    ├── tests/
    │   ├── view_mode.test.js
    │   └── product_price.test.js
    └── tours/
        └── product_list_view_tour.js
```

**Por qué los helpers puros están separados:** `view_mode.js` y `product_price.js` no importan nada del POS ni de OWL. Eso los hace testeables con Hoot sin levantar un entorno POS, que es el patrón que ya usa `pos_lot_spool_picker/static/tests/spool_allocation.test.js`. Los componentes quedan como cascarones finos sobre esos helpers.

---

### Task 1: Módulo base y campos de configuración

**Files:**
- Create: `pos_product_list_view/__init__.py`
- Create: `pos_product_list_view/__manifest__.py`
- Create: `pos_product_list_view/models/__init__.py`
- Create: `pos_product_list_view/models/pos_config.py`
- Create: `pos_product_list_view/models/res_config_settings.py`
- Create: `pos_product_list_view/views/res_config_settings_views.xml`
- Test: `pos_product_list_view/tests/__init__.py`, `pos_product_list_view/tests/test_pos_config_defaults.py`

- [ ] **Step 1: Escribir el test que falla**

`pos_product_list_view/tests/__init__.py`:

```python
from . import test_pos_config_defaults
```

`pos_product_list_view/tests/test_pos_config_defaults.py`:

```python
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


class TestProductListViewConfig(TestPoSCommon):

    def setUp(self):
        super().setUp()
        self.config = self.basic_config

    def test_defaults_are_grid_with_image_and_ref(self):
        self.assertEqual(self.config.product_view_default, 'grid')
        self.assertTrue(self.config.product_list_show_image)
        self.assertTrue(self.config.product_list_show_ref)
        self.assertFalse(self.config.product_list_show_uom)
        self.assertFalse(self.config.product_list_show_barcode)

    def test_settings_related_fields_write_through_to_config(self):
        settings = self.env['res.config.settings'].create({
            'pos_config_id': self.config.id,
            'pos_product_view_default': 'list',
            'pos_product_list_show_uom': True,
        })
        settings.execute()
        self.assertEqual(self.config.product_view_default, 'list')
        self.assertTrue(self.config.product_list_show_uom)
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `odoo -d <db> -i pos_product_list_view --test-enable --test-tags /pos_product_list_view --stop-after-init`
Expected: FAIL — el módulo no existe todavía.

- [ ] **Step 3: Crear el módulo**

`pos_product_list_view/__init__.py`:

```python
from . import models
```

`pos_product_list_view/models/__init__.py`:

```python
from . import pos_config
from . import res_config_settings
```

`pos_product_list_view/models/pos_config.py`:

```python
from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # Semilla para dispositivos nuevos. El cajero puede cambiar de vista en cualquier
    # momento; su eleccion se guarda en localStorage y pisa este valor.
    product_view_default = fields.Selection(
        selection=[('grid', 'Grid'), ('list', 'List')],
        string='Default Product View',
        help='Initial product view for devices that have not chosen one yet. '
             'The cashier can always switch, and their choice is remembered per device.',
        default='grid',
        required=True,
    )
    product_list_show_image = fields.Boolean(
        string='List View: Show Thumbnail',
        default=True,
    )
    product_list_show_ref = fields.Boolean(
        string='List View: Show Internal Reference',
        default=True,
    )
    product_list_show_uom = fields.Boolean(
        string='List View: Show Unit of Measure',
        default=False,
    )
    # Off by default: barcodes are scanned, not read. The column exists for the
    # setups that genuinely need it, but it costs width and earns little.
    product_list_show_barcode = fields.Boolean(
        string='List View: Show Barcode',
        default=False,
    )
```

`pos_product_list_view/models/res_config_settings.py`:

```python
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Odoo's Settings screen only renders fields declared directly on res.config.settings.
    # pos.config fields do NOT appear there automatically, so every setting needs a related
    # field here, prefixed with pos_. Without these the view below fails validation.
    pos_product_view_default = fields.Selection(
        related='pos_config_id.product_view_default',
        readonly=False,
    )
    pos_product_list_show_image = fields.Boolean(
        related='pos_config_id.product_list_show_image',
        readonly=False,
    )
    pos_product_list_show_ref = fields.Boolean(
        related='pos_config_id.product_list_show_ref',
        readonly=False,
    )
    pos_product_list_show_uom = fields.Boolean(
        related='pos_config_id.product_list_show_uom',
        readonly=False,
    )
    pos_product_list_show_barcode = fields.Boolean(
        related='pos_config_id.product_list_show_barcode',
        readonly=False,
    )
```

`pos_product_list_view/views/res_config_settings_views.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="res_config_settings_view_form_product_list" model="ir.ui.view">
        <field name="name">res.config.settings.view.form.product.list.view</field>
        <field name="model">res.config.settings</field>
        <field name="inherit_id" ref="point_of_sale.res_config_settings_view_form"/>
        <field name="arch" type="xml">
            <xpath expr="//block[@id='product_and_category_block']" position="inside">
                <setting id="product_list_view_setting"
                         string="Product List View"
                         help="Show products as an aligned list instead of a card grid.">
                    <field name="pos_config_id" invisible="1"/>
                    <field name="pos_product_view_default"/>
                    <div class="content-group mt16">
                        <div>
                            <field name="pos_product_list_show_image"/>
                            <label for="pos_product_list_show_image" string="Show thumbnail" class="fw-normal me-1"/>
                        </div>
                        <div>
                            <field name="pos_product_list_show_ref"/>
                            <label for="pos_product_list_show_ref" string="Show internal reference" class="fw-normal me-1"/>
                        </div>
                        <div>
                            <field name="pos_product_list_show_uom"/>
                            <label for="pos_product_list_show_uom" string="Show unit of measure" class="fw-normal me-1"/>
                        </div>
                        <div>
                            <field name="pos_product_list_show_barcode"/>
                            <label for="pos_product_list_show_barcode" string="Show barcode" class="fw-normal me-1"/>
                        </div>
                    </div>
                </setting>
            </xpath>
        </field>
    </record>
</odoo>
```

`pos_product_list_view/__manifest__.py`:

```python
{
    'name': 'POS Product List View',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Alternative list view for POS products, with internal reference, UoM, barcode and price columns.',
    'description': """
Adds a list view mode to the POS product screen, alongside the native card grid:
- Aligned columns: product, internal reference, unit of measure, barcode, price.
- The native grid shows no price at all; the list does.
- Each column is toggled from the POS settings; the default view is per POS, and the
  cashier's choice is remembered per device.
- Rows keep the native click-to-add and long-press-for-product-info behaviour.
    """,
    'author': 'AlparData',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_product_list_view/static/src/app/**/*',
            'pos_product_list_view/static/src/scss/**/*',
        ],
        'web.assets_unit_tests': [
            'pos_product_list_view/static/tests/**/*',
        ],
        'web.assets_tests': [
            'pos_product_list_view/static/tours/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `odoo -d <db> -i pos_product_list_view --test-enable --test-tags /pos_product_list_view --stop-after-init`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add pos_product_list_view
git commit -m "feat(pos_product_list_view): module skeleton with view settings"
```

---

### Task 2: Helpers puros de modo de vista

Aíslan la única lógica con reglas propias: cuál es el modo inicial y cómo persiste. Sin OWL, sin POS.

**Files:**
- Create: `pos_product_list_view/static/src/app/view_mode.js`
- Test: `pos_product_list_view/static/tests/view_mode.test.js`

- [ ] **Step 1: Escribir el test que falla**

`pos_product_list_view/static/tests/view_mode.test.js`:

```javascript
import { describe, expect, test } from "@odoo/hoot";
import {
    GRID,
    LIST,
    STORAGE_KEY,
    readStoredMode,
    resolveInitialMode,
    storeMode,
} from "@pos_product_list_view/app/view_mode";

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => {
            data[k] = String(v);
        },
        _data: data,
    };
}

describe("resolveInitialMode", () => {
    test("uses the stored mode when there is one", () => {
        expect(resolveInitialMode(LIST, GRID)).toBe(LIST);
        expect(resolveInitialMode(GRID, LIST)).toBe(GRID);
    });

    test("falls back to the config default when nothing is stored", () => {
        expect(resolveInitialMode(null, LIST)).toBe(LIST);
        expect(resolveInitialMode(null, GRID)).toBe(GRID);
    });

    test("falls back to grid when the config default is missing or unknown", () => {
        expect(resolveInitialMode(null, undefined)).toBe(GRID);
        expect(resolveInitialMode(null, "kanban")).toBe(GRID);
    });

    test("ignores a corrupted stored value and uses the config default", () => {
        expect(resolveInitialMode("bogus", LIST)).toBe(LIST);
    });
});

describe("readStoredMode", () => {
    test("returns null when nothing was ever stored", () => {
        expect(readStoredMode(fakeStorage())).toBe(null);
    });

    test("returns the stored mode", () => {
        expect(readStoredMode(fakeStorage({ [STORAGE_KEY]: LIST }))).toBe(LIST);
    });

    test("returns null when storage throws", () => {
        const hostile = {
            getItem() {
                throw new Error("SecurityError");
            },
        };
        expect(readStoredMode(hostile)).toBe(null);
    });
});

describe("storeMode", () => {
    test("writes the mode under the storage key", () => {
        const storage = fakeStorage();
        storeMode(storage, LIST);
        expect(storage._data[STORAGE_KEY]).toBe(LIST);
    });

    test("does not throw when storage is unavailable", () => {
        const hostile = {
            setItem() {
                throw new Error("QuotaExceededError");
            },
        };
        expect(() => storeMode(hostile, LIST)).not.toThrow();
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `odoo -d <db> --test-enable --test-tags /pos_product_list_view:HootTest --stop-after-init`
Expected: FAIL — no se puede resolver `@pos_product_list_view/app/view_mode`.

- [ ] **Step 3: Escribir la implementación mínima**

`pos_product_list_view/static/src/app/view_mode.js`:

```javascript
export const GRID = "grid";
export const LIST = "list";
export const STORAGE_KEY = "pos_product_list_view.mode";

const VALID_MODES = [GRID, LIST];

function isValid(mode) {
    return VALID_MODES.includes(mode);
}

/**
 * Read the mode this device chose last time, if any.
 * Storage can throw (private browsing, disabled cookies); treat that as "nothing stored".
 * @param {Storage} storage
 * @returns {string|null}
 */
export function readStoredMode(storage) {
    try {
        return storage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

/**
 * Persist this device's choice. Never let a storage failure break the toggle.
 * @param {Storage} storage
 * @param {string} mode
 */
export function storeMode(storage, mode) {
    try {
        storage.setItem(STORAGE_KEY, mode);
    } catch {
        // Losing persistence is acceptable; losing the toggle is not.
    }
}

/**
 * The device's choice wins over the POS default. The POS default is a seed for
 * devices that have not chosen yet, not a lock.
 * @param {string|null} storedMode
 * @param {string|undefined} configDefault
 * @returns {string}
 */
export function resolveInitialMode(storedMode, configDefault) {
    if (isValid(storedMode)) {
        return storedMode;
    }
    return isValid(configDefault) ? configDefault : GRID;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `odoo -d <db> --test-enable --test-tags /pos_product_list_view:HootTest --stop-after-init`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add pos_product_list_view/static/src/app/view_mode.js pos_product_list_view/static/tests/view_mode.test.js
git commit -m "feat(pos_product_list_view): view mode resolution and persistence helpers"
```

---

### Task 3: Helpers puros de precio

**Files:**
- Create: `pos_product_list_view/static/src/app/product_price.js`
- Test: `pos_product_list_view/static/tests/product_price.test.js`

- [ ] **Step 1: Escribir el test que falla**

`pos_product_list_view/static/tests/product_price.test.js`:

```javascript
import { describe, expect, test } from "@odoo/hoot";
import { pickTaxTotal, priceOptionsFromOrder } from "@pos_product_list_view/app/product_price";

describe("pickTaxTotal", () => {
    const details = { total_included: 121, total_excluded: 100 };

    test("returns the tax-included total when the POS displays taxes in prices", () => {
        expect(pickTaxTotal(details, "total")).toBe(121);
    });

    test("returns the tax-excluded total otherwise", () => {
        expect(pickTaxTotal(details, "subtotal")).toBe(100);
    });

    test("treats a missing setting as tax-included", () => {
        expect(pickTaxTotal(details, undefined)).toBe(121);
    });

    test("treats an unrecognised setting as tax-included", () => {
        expect(pickTaxTotal(details, "kanban")).toBe(121);
    });

    test("returns 0 when there are no tax details", () => {
        expect(pickTaxTotal(null, "total")).toBe(0);
    });
});

describe("priceOptionsFromOrder", () => {
    test("takes pricelist and fiscal position from the current order", () => {
        const pricelist = { id: 7 };
        const fiscalPosition = { id: 3 };
        const order = { pricelist_id: pricelist, fiscal_position_id: fiscalPosition };
        expect(priceOptionsFromOrder(order)).toEqual({ pricelist, fiscalPosition });
    });

    test("returns false for both when there is no order", () => {
        expect(priceOptionsFromOrder(null)).toEqual({
            pricelist: false,
            fiscalPosition: false,
        });
    });

    test("returns false for a field the order leaves unset", () => {
        expect(priceOptionsFromOrder({ pricelist_id: false, fiscal_position_id: false })).toEqual({
            pricelist: false,
            fiscalPosition: false,
        });
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `odoo -d <db> --test-enable --test-tags /pos_product_list_view:HootTest --stop-after-init`
Expected: FAIL — no se puede resolver `@pos_product_list_view/app/product_price`.

- [ ] **Step 3: Escribir la implementación mínima**

`pos_product_list_view/static/src/app/product_price.js`:

```javascript
/**
 * Pick the total the POS is configured to display.
 * `iface_tax_included` is "total" (tax-included) or "subtotal" (tax-excluded).
 * @param {{total_included: number, total_excluded: number}|null} taxDetails
 * @param {string|undefined} ifaceTaxIncluded
 * @returns {number}
 */
export function pickTaxTotal(taxDetails, ifaceTaxIncluded) {
    if (!taxDetails) {
        return 0;
    }
    // Mirrors the core default: pos.config.iface_tax_included is required with
    // default='total' (point_of_sale/models/pos_config.py:111). Anything that is not an
    // explicit "subtotal" falls back to the tax-included price. Falling back the other
    // way would quote the customer a price lower than the register charges.
    return ifaceTaxIncluded === "subtotal"
        ? taxDetails.total_excluded
        : taxDetails.total_included;
}

/**
 * Build the options getTaxDetails needs so the listed price matches what the order
 * line will charge. Passing no pricelist makes getPrice return the raw list_price,
 * which is why product.displayPriceUnit cannot be used here.
 * @param {object|null|undefined} order
 * @returns {{pricelist: object|false, fiscalPosition: object|false}}
 */
export function priceOptionsFromOrder(order) {
    return {
        pricelist: order?.pricelist_id || false,
        fiscalPosition: order?.fiscal_position_id || false,
    };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `odoo -d <db> --test-enable --test-tags /pos_product_list_view:HootTest --stop-after-init`
Expected: PASS, 7 tests nuevos.

- [ ] **Step 5: Commit**

```bash
git add pos_product_list_view/static/src/app/product_price.js pos_product_list_view/static/tests/product_price.test.js
git commit -m "feat(pos_product_list_view): pricelist-aware price helpers"
```

---

### Task 4: Estado del modo en PosStore

**Files:**
- Create: `pos_product_list_view/static/src/app/pos_store_patch.js`

No lleva test unitario propio: es cableado de tres líneas sobre helpers ya testeados en la Task 2. El tour de la Task 9 cubre el comportamiento.

- [ ] **Step 1: Escribir el patch**

`pos_product_list_view/static/src/app/pos_store_patch.js`:

```javascript
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import {
    GRID,
    LIST,
    readStoredMode,
    resolveInitialMode,
    storeMode,
} from "@pos_product_list_view/app/view_mode";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        // PosStore is reactive (core mutates pos.scanning from templates the same way),
        // so assigning this property re-renders the product screen.
        this.productListViewMode = resolveInitialMode(
            readStoredMode(window.localStorage),
            this.config.product_view_default
        );
    },

    get isProductListView() {
        return this.productListViewMode === LIST;
    },

    toggleProductListView() {
        this.productListViewMode = this.isProductListView ? GRID : LIST;
        storeMode(window.localStorage, this.productListViewMode);
    },
});
```

- [ ] **Step 2: Commit**

```bash
git add pos_product_list_view/static/src/app/pos_store_patch.js
git commit -m "feat(pos_product_list_view): hold view mode on PosStore"
```

---

### Task 5: Componente ProductRow

**Files:**
- Create: `pos_product_list_view/static/src/app/product_row/product_row.js`
- Create: `pos_product_list_view/static/src/app/product_row/product_row.xml`

- [ ] **Step 1: Escribir el componente**

`pos_product_list_view/static/src/app/product_row/product_row.js`:

```javascript
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
        // getBaseLine reads opts.overridedValues, NOT the top level
        // (product_template_accounting.js:179). Passing {pricelist, fiscalPosition}
        // flat would silently drop both and fall back to raw list_price. Core wraps it
        // the same way at pos_store.js:1713.
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
```

`pos_product_list_view/static/src/app/product_row/product_row.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<templates id="template" xml:space="preserve">

    <t t-name="pos_product_list_view.ProductRow">
        <article tabindex="0"
            role="button"
            class="o_pos_product_row d-flex align-items-center gap-2 px-2 btn btn-light rounded-0 text-start cursor-pointer"
            t-att-data-product-id="props.product.id"
            t-on-click.stop="props.onClick"
            t-on-keypress="(event) => event.code === 'Space' ? props.onClick(event) : ()=>{}"
            t-on-mousedown="(event) => props.longPressHandlers.onMouseDown(event, props.product)"
            t-on-mouseup="props.longPressHandlers.onMouseUp"
            t-on-touchstart="() => props.longPressHandlers.onTouchStart(props.product)"
            t-on-touchend="props.longPressHandlers.onTouchEnd">

            <div t-if="config.product_list_show_image" class="o_pos_product_row_img flex-shrink-0">
                <img t-if="imageUrl" t-att-src="imageUrl" t-att-alt="props.name"
                     class="w-100 h-100 object-fit-cover rounded pe-none" draggable="false"/>
            </div>

            <div class="o_pos_product_row_name flex-grow-1 text-truncate" t-esc="props.name"/>

            <div t-if="config.product_list_show_ref"
                 class="o_pos_product_row_ref flex-shrink-0 text-muted text-truncate"
                 t-esc="props.product.default_code or ''"/>

            <div t-if="config.product_list_show_barcode"
                 class="o_pos_product_row_barcode flex-shrink-0 text-muted text-truncate"
                 t-esc="props.product.barcode or ''"/>

            <div t-if="config.product_list_show_uom"
                 class="o_pos_product_row_uom flex-shrink-0 text-muted text-truncate"
                 t-esc="props.product.uom_id?.name or ''"/>

            <div class="o_pos_product_row_price flex-shrink-0 text-end" t-esc="price"/>

            <span t-if="props.cartQty"
                  class="o_pos_product_row_qty flex-shrink-0 px-2 rounded bg-black text-white fw-bolder"
                  t-out="formattedCartQty"/>
        </article>
    </t>

</templates>
```

- [ ] **Step 2: Commit**

```bash
git add pos_product_list_view/static/src/app/product_row
git commit -m "feat(pos_product_list_view): ProductRow component"
```

---

### Task 6: Componente ProductList

**Files:**
- Create: `pos_product_list_view/static/src/app/product_list/product_list.js`
- Create: `pos_product_list_view/static/src/app/product_list/product_list.xml`

`productToDisplayByCateg` retorna `[[categId, products[]], ...]`. Cuando `iface_group_by_categ` está apagado retorna un único grupo con id `"0"` (`pos_store.js:2926`). El encabezado de categoría solo se muestra cuando el agrupamiento está activo.

- [ ] **Step 1: Escribir el componente**

`pos_product_list_view/static/src/app/product_list/product_list.js`:

```javascript
import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { ProductRow } from "@pos_product_list_view/app/product_row/product_row";

const UNCATEGORIZED = "0";

export class ProductList extends Component {
    static template = "pos_product_list_view.ProductList";
    static components = { ProductRow };
    static props = {
        // ProductScreen.addProductToOrder — takes a product.template, not a variant.
        onProductClick: Function,
        // ProductScreen.getProductName
        getProductName: Function,
        // ProductScreen.longPressHandlers. Passed down rather than recreated with
        // useLongPress: the scroll container cancels long-press through THIS object,
        // so a second instance would keep firing the popup while the cashier scrolls.
        longPressHandlers: Object,
        quantityByProductTmplId: Object,
    };

    setup() {
        this.pos = usePos();
    }

    get config() {
        return this.pos.config;
    }

    getCategoryName(categId) {
        // "0" is a sentinel core pushes for products with no category, mixed in with
        // real numeric ids (pos_store.js:2957-2959). Looking it up would return nothing
        // and the group would render with a blank header.
        if (categId === UNCATEGORIZED) {
            return _t("Without category");
        }
        return this.pos.models["pos.category"].get(categId)?.name || "";
    }
}
```

`pos_product_list_view/static/src/app/product_list/product_list.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<templates id="template" xml:space="preserve">

    <t t-name="pos_product_list_view.ProductList">
        <div class="o_pos_product_list d-flex flex-column px-2 pb-2">
            <t t-foreach="pos.productToDisplayByCateg" t-as="productCateg" t-key="productCateg[0]">

                <div t-if="config.iface_group_by_categ"
                     class="o_pos_product_list_categ fw-bold text-muted px-2 pt-2"
                     t-esc="getCategoryName(productCateg[0])"/>

                <div class="o_pos_product_list_head d-flex align-items-center gap-2 px-2 text-muted">
                    <div t-if="config.product_list_show_image" class="o_pos_product_row_img flex-shrink-0"/>
                    <div class="o_pos_product_row_name flex-grow-1">Product</div>
                    <div t-if="config.product_list_show_ref" class="o_pos_product_row_ref flex-shrink-0">Ref.</div>
                    <div t-if="config.product_list_show_barcode" class="o_pos_product_row_barcode flex-shrink-0">Barcode</div>
                    <div t-if="config.product_list_show_uom" class="o_pos_product_row_uom flex-shrink-0">UoM</div>
                    <div class="o_pos_product_row_price flex-shrink-0 text-end">Price</div>
                </div>

                <ProductRow
                    t-foreach="productCateg[1]" t-as="product" t-key="product.id"
                    product="product"
                    name="props.getProductName(product)"
                    cartQty="props.quantityByProductTmplId[product.id]"
                    longPressHandlers="props.longPressHandlers"
                    onClick="() => props.onProductClick(product)"/>
            </t>
        </div>
    </t>

</templates>
```

- [ ] **Step 2: Commit**

```bash
git add pos_product_list_view/static/src/app/product_list
git commit -m "feat(pos_product_list_view): ProductList container with category grouping"
```

---

### Task 7: Botón de toggle

**Files:**
- Create: `pos_product_list_view/static/src/app/view_toggle/view_toggle.js`
- Create: `pos_product_list_view/static/src/app/view_toggle/view_toggle.xml`

- [ ] **Step 1: Escribir el componente**

`pos_product_list_view/static/src/app/view_toggle/view_toggle.js`:

```javascript
import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

export class ProductViewToggle extends Component {
    static template = "pos_product_list_view.ProductViewToggle";
    static props = {};

    setup() {
        this.pos = usePos();
    }

    get label() {
        return this.pos.isProductListView ? _t("Switch to grid view") : _t("Switch to list view");
    }

    get icon() {
        return this.pos.isProductListView ? "fa-th-large" : "fa-list";
    }
}
```

`pos_product_list_view/static/src/app/view_toggle/view_toggle.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<templates id="template" xml:space="preserve">

    <t t-name="pos_product_list_view.ProductViewToggle">
        <div class="o_pos_view_toggle d-flex justify-content-end px-2 pt-2">
            <button class="btn btn-light o_pos_view_toggle_btn"
                    t-att-title="label"
                    t-att-aria-label="label"
                    t-on-click="() => pos.toggleProductListView()">
                <i class="fa" t-att-class="icon" role="img" aria-hidden="true"/>
            </button>
        </div>
    </t>

</templates>
```

- [ ] **Step 2: Commit**

```bash
git add pos_product_list_view/static/src/app/view_toggle
git commit -m "feat(pos_product_list_view): grid/list toggle button"
```

---

### Task 8: Los dos xpath y los estilos

Este es el único punto de contacto con el core. Cuando salga Odoo 20, verificar **este archivo** contra el fuente.

**Files:**
- Create: `pos_product_list_view/static/src/app/overrides/product_screen.xml`
- Create: `pos_product_list_view/static/src/app/overrides/product_screen_patch.js`
- Create: `pos_product_list_view/static/src/scss/product_list.scss`

- [ ] **Step 1: Escribir el override**

`pos_product_list_view/static/src/app/overrides/product_screen.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">

    <t t-name="pos_product_list_view.ProductScreen"
       t-inherit="point_of_sale.ProductScreen"
       t-inherit-mode="extension">

        <!-- Toggle sits above the category selector: it must live OUTSIDE the product
             container, otherwise there would be no way back from grid mode. -->
        <xpath expr="//CategorySelector" position="before">
            <ProductViewToggle t-if="pos.productsToDisplay.length > 0"/>
        </xpath>

        <!-- $0 is the original node: the native grid is preserved untouched in the
             else branch, not reimplemented. The matched div is the one carrying
             t-foreach="pos.productToDisplayByCateg".

             $0 MUST sit on one line with no surrounding whitespace. The substitution
             XPath is .//*[text()='$0'] (template_inheritance.js:268), which compares the
             text node's string-value — indentation makes it "\n    $0\n" and it does not
             match. When it does not match, line 280 still deletes the original node, so
             the native grid vanishes and the literal text $0 renders, with no error
             thrown. All 33 uses of $0 in the Odoo 19 tree are on one line. -->
        <xpath expr="//div[hasclass('product-list')]" position="replace">
            <t t-if="pos.isProductListView">
                <ProductList
                    onProductClick.bind="addProductToOrder"
                    getProductName.bind="getProductName"
                    longPressHandlers="longPressHandlers"
                    quantityByProductTmplId="state.quantityByProductTmplId"/>
            </t>
            <t t-else="">$0</t>
        </xpath>

    </t>

</templates>
```

- [ ] **Step 2: Registrar los componentes en ProductScreen**

Un `t-inherit` puede insertar etiquetas de componentes, pero el componente tiene que estar en `static components` de la clase. Crear `pos_product_list_view/static/src/app/overrides/product_screen_patch.js`:

```javascript
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { patch } from "@web/core/utils/patch";
import { ProductList } from "@pos_product_list_view/app/product_list/product_list";
import { ProductViewToggle } from "@pos_product_list_view/app/view_toggle/view_toggle";

patch(ProductScreen, {
    components: { ...ProductScreen.components, ProductList, ProductViewToggle },
});
```

- [ ] **Step 3: Escribir los estilos**

`pos_product_list_view/static/src/scss/product_list.scss`:

```scss
.o_pos_product_row {
    // ~48px keeps the row a comfortable touch target on a tablet. Density is not
    // the goal here; legibility is.
    min-height: 48px;
    border-bottom: 1px solid var(--border-color, #dee2e6);
}

.o_pos_product_row_img {
    width: 32px;
    height: 32px;
}

.o_pos_product_row_ref,
.o_pos_product_row_barcode {
    width: 110px;
}

.o_pos_product_row_uom {
    width: 60px;
}

.o_pos_product_row_price {
    width: 110px;
}

.o_pos_product_list_head {
    min-height: 32px;
    font-size: 0.85rem;
}
```

- [ ] **Step 4: Verificar a mano en el POS**

Reiniciar Odoo con `-u pos_product_list_view`, abrir el POS y comprobar:
1. El botón de toggle aparece arriba a la derecha, sobre las categorías.
2. Al tocarlo la grilla se convierte en lista con columnas alineadas.
3. Recargar la página: sigue en lista.
4. Volver a grilla: los cards se ven exactamente igual que antes de instalar el módulo.

- [ ] **Step 5: Commit**

```bash
git add pos_product_list_view/static/src/app/overrides pos_product_list_view/static/src/scss
git commit -m "feat(pos_product_list_view): wire list view into ProductScreen"
```

---

### Task 9: Tour del camino crítico

**Files:**
- Create: `pos_product_list_view/static/tours/product_list_view_tour.js`
- Create: `pos_product_list_view/tests/test_product_list_view_tour.py`
- Modify: `pos_product_list_view/tests/__init__.py`

- [ ] **Step 1: Escribir el tour**

`pos_product_list_view/static/tours/product_list_view_tour.js`:

Los helpers viven en dos carpetas distintas: `chrome_util` bajo `tests/pos/tours/utils/`,
`dialog_util` bajo `tests/generic_helpers/`. `Chrome.startPoS()` y los helpers de
`ProductScreen` devuelven **arrays** de pasos, por eso el array final lleva `.flat()`.

```javascript
import { registry } from "@web/core/registry";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";

registry.category("web_tour.tours").add("ProductListViewTour", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            {
                content: "switch the product screen to list view",
                trigger: ".o_pos_view_toggle_btn",
                run: "click",
            },
            {
                content: "the list is rendered with rows",
                trigger: ".o_pos_product_list .o_pos_product_row",
            },
            {
                content: "clicking a row adds the product to the order",
                trigger: ".o_pos_product_row:contains('Letter Tray')",
                run: "click",
            },
            // Asserts through the core helper, so the list has to produce exactly the
            // same orderline the grid would.
            ProductScreen.selectedOrderlineHas("Letter Tray", "1.0"),
            {
                content: "long-press a row opens the product info popup",
                trigger: ".o_pos_product_row:contains('Letter Tray')",
                run: "press_and_hold",
            },
            {
                content: "the product info popup is shown",
                trigger: ".modal .product-info",
            },
            Chrome.endTour(),
        ].flat(),
});
```

`Letter Tray` es un producto que crea `TestPointOfSaleHttpCommon`
(`point_of_sale/tests/test_frontend.py:200`), así que existe en la base de pruebas.

Si el paso de long-press falla porque `press_and_hold` no está disponible como acción de
tour en esta versión, reemplazarlo por un `run` explícito que dispare `mousedown`, espere
el `LONG_PRESS_DURATION` de `@point_of_sale/utils` y dispare `mouseup`. Verificar la
constante antes de hardcodear un número.

- [ ] **Step 2: Escribir el test que lanza el tour**

`pos_product_list_view/tests/test_product_list_view_tour.py`:

```python
from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon


class TestProductListViewTour(TestPointOfSaleHttpCommon):

    def test_list_view_adds_product_to_order(self):
        self.main_pos_config.write({'product_view_default': 'grid'})
        self.main_pos_config.with_user(self.pos_user).open_ui()
        self.start_pos_tour("ProductListViewTour")
```

`pos_product_list_view/tests/__init__.py`:

```python
from . import test_pos_config_defaults
from . import test_product_list_view_tour
```

- [ ] **Step 3: Correr el tour**

Run: `odoo -d <db> -u pos_product_list_view --test-enable --test-tags /pos_product_list_view --stop-after-init`
Expected: PASS.

Si el paso del producto falla porque `Letter Tray` no existe en los datos de demo de esa base, reemplazar por un producto que sí esté disponible en el POS — revisar qué productos crea `TestPointOfSaleHttpCommon` en la base de pruebas antes de cambiar el selector.

- [ ] **Step 4: Commit**

```bash
git add pos_product_list_view/static/tours pos_product_list_view/tests
git commit -m "test(pos_product_list_view): tour covering list view add-to-order"
```

---

### Task 10: README

**Files:**
- Create: `pos_product_list_view/README.md`

- [ ] **Step 1: Escribir el README**

```markdown
# POS Product List View

Adds a list view mode to the POS product screen, alongside the native card grid.

## Why

The native card in Odoo 19 shows the product name, its image and the quantity already
in the cart — and nothing else. No price, no internal reference, no unit of measure.
That works for a small catalogue. With hundreds of visually similar SKUs the grid stops
helping: images distinguish nothing, names truncate, and the cashier falls back to the
search box.

## What it shows

| Column | Configurable | Default |
|---|---|---|
| Product name | no | always |
| Price | no | always |
| Thumbnail | yes | shown |
| Internal reference | yes | shown |
| Unit of measure | yes | hidden |
| Barcode | yes | hidden |

Barcodes are hidden by default on purpose: they are scanned, not read.

## Stock is deliberately absent

`qty_available` is not loaded into the POS front end. It is only reachable through the
`get_product_info_pos` RPC, one call per product. Loading it at session start would
produce a column frozen at opening time — a number that looks authoritative and goes
stale within hours.

**Long-press a row** to open the product info popup, with per-warehouse stock, prices
and margins. That is the same path the card grid offers, and it reads live data.

## Settings

Point of Sale → Configuration → Settings → Product & PoS categories → Product List View.

The default view is per POS. The cashier can switch at any time, and their choice is
remembered **per device** (`localStorage`) — so a small tablet can use the list while the
big counter screen stays on the grid.

## Maintenance

The only contact surface with core is
`static/src/app/overrides/product_screen.xml`: two xpath against
`point_of_sale.ProductScreen`. When porting to a new Odoo version, check those two
anchors against the core template first.

Note `pos_store.js` carries a dormant `productViewMode` getter reading a `productListView`
property that core never assigns. Odoo started a list mode and left it unfinished. This
module does not build on that hook, but it is worth watching in future versions.
```

- [ ] **Step 2: Commit**

```bash
git add pos_product_list_view/README.md
git commit -m "docs(pos_product_list_view): README"
```

---

## Self-review de cobertura del spec

| Requisito del spec | Task |
|---|---|
| Columnas fijas producto + precio | 5 |
| Columnas opcionales imagen / ref / UdM / barcode | 1 (campos), 5 (render) |
| Cinco campos en `pos.config` + `res.config.settings` | 1 |
| Sin override de `_load_pos_data_fields` | 1 (documentado en el manifest y el README) |
| Persistencia por dispositivo en `localStorage` | 2, 4 |
| Default de `pos.config` como semilla, no candado | 2 (`resolveInitialMode`), 4 |
| Dos xpath en un solo archivo | 8 |
| Grilla nativa intacta en modo grilla | 8 (`$0`) |
| Agrupamiento por categoría respetado | 6 |
| Click → `addProductToOrder` | 6, 8 |
| Long-press → `ProductInfoPopup` | 5 (handlers), 6 (prop compartida) |
| Precio con tarifa e impuestos | 3, 5 |
| Altura de fila ~48px | 8 (scss) |
| Tests del servicio de modo | 2 |
| Tests de visibilidad de columnas y precio | 3 (helpers puros); el render se cubre en el tour |
| Tour: lista → click → línea agregada | 9 |
| Riesgo: precio divergente de la línea de pedido | 3 (`priceOptionsFromOrder` usa la tarifa de la orden) |

**Desvío consciente respecto del spec:** el spec habla de un "servicio `view_mode`". Se implementa como patch de `PosStore` más helpers puros, no como servicio OWL registrado. La propiedad que el spec pedía —un único dueño del estado— se mantiene, y evita el boilerplate de registrar un servicio para tres líneas de estado. `PosStore` ya es reactivo y ya está disponible en todos los componentes.
