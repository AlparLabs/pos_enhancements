# POS Lot Spool Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Odoo 19 POS module that replaces the native lot popup with a spool picker showing available bobinas (remaining meters + location), auto-suggests the anti-retazo lot, allows splitting a sale across bobinas, and carries per-lot meters through to exact stock move lines — all while the customer still sees one order line.

**Architecture:** New module `pos_lot_spool_picker` (depends `point_of_sale`, `stock`). Backend: add a `qty` field to `pos.pack.operation.lot`, extend the native `get_existing_lots` RPC to return each lot's location, add a `pos.config` toggle, and override `stock.move._add_mls_related_to_order` so per-lot `qty` (not the whole line qty) drives each move line. Frontend: patch `PosStore.editLots` to open a new `SpoolPickerPopup`, and patch `PosStore.addLineToOrder` to set the line qty to the sum of allocated meters.

**Tech Stack:** Odoo 19, Python, OWL 2 (`@odoo/owl`), Odoo web `patch`, `makeAwaitable` dialogs.

---

## Reference: exact native anchors (Odoo 19 core, verified)

All paths under `odoo-19.0/addons/point_of_sale/`:

- **Lot popup trigger:** `static/src/app/services/pos_store.js` → `handleConfigurableProduct` block at ~L921-955 calls `pack_lot_ids = await this.editLots(values.product_id, packLotLinesToEdit)`.
- **Popup opener to patch:** `PosStore.editLots(product, packLotLinesToEdit)` at `pos_store.js:2567`. Returns `{ modifiedPackLotLines, newPackLotLines }`; opens `SelectLotPopup` via `makeAwaitable`. Uses `this.data.call("pos.order.line", "get_existing_lots", [company_id, config_id, product_id])`.
- **Line-qty seam:** `PosStore.addLineToOrder(...)` at `pos_store.js:869` returns `order.getSelectedOrderline()` (L1045). For `tracking === "lot"` it does NOT adjust qty (L1012 only recomputes price).
- **RPC to extend:** `pos.order.line.get_existing_lots(company_id, config_id, product_id)` at `models/pos_order.py:1678`. Returns `[{id, name, product_qty}]` grouped from `stock.quant` over `pos_config.picking_type_id.default_location_src_id.child_internal_location_ids`.
- **Pack-lot model:** `class PosPackOperationLot` at `models/pos_order.py:1971` — fields `lot_name`, `pos_order_line_id`, `order_id`, `product_id`; `_load_pos_data_fields` returns `['lot_name', 'pos_order_line_id', 'write_date']`.
- **Move-line creation to override:** `stock.move._add_mls_related_to_order(related_order_lines, are_qties_done=True)` at `models/stock_picking.py:237`. Both branches compute `qty = 1 if tracking=='serial' else abs(line.qty)` **per pack lot** (L281, L318-321) — the exact bug we fix by using `lot.qty`.
- **Frontend model:** `static/src/app/models/pos_order_line.js` → `setPackLotLines` (L188) creates `pos.pack.operation.lot` with only `{lot_name, pos_order_line_id}` (L206); `setQuantityByLot` (L311) sets qty = count of lots.

Suite conventions (from `pos_payment_card_details`, `pos_restaurant_courses`, `pos_payment_category`): manifest `version: '19.0.1.0.0'`, assets under `point_of_sale._assets_pos` glob `module/static/src/app/**/*`, OWL popups use `Dialog` + `getPayload`/`close` props opened with `makeAwaitable(this.dialog, Popup, {...})`, screen/store patches via `patch(Klass.prototype, {...})`.

---

## File Structure

```
pos_lot_spool_picker/
  __init__.py
  __manifest__.py
  README.md
  models/
    __init__.py
    pos_config.py              # spool_picker_enforce_stock toggle
    pos_pack_operation_lot.py  # qty field + load field
    pos_order_line.py          # extend get_existing_lots with location
    stock_move.py              # override _add_mls_related_to_order
  views/
    res_config_settings_views.xml   # POS settings toggle
  static/src/app/
    spool_allocation.js        # pure suggestion/allocation logic (unit-testable)
    popups/spool_picker_popup/
      spool_picker_popup.js
      spool_picker_popup.xml
    pos_store_patch.js         # patch editLots + addLineToOrder
  static/tests/
    spool_allocation.test.js   # hoot unit tests for suggestion logic
  tests/
    __init__.py
    test_spool_move_lines.py   # backend: per-lot qty -> move lines
```

---

## Task 1: Module scaffold

**Files:**
- Create: `pos_lot_spool_picker/__init__.py`
- Create: `pos_lot_spool_picker/__manifest__.py`
- Create: `pos_lot_spool_picker/models/__init__.py`
- Create: `pos_lot_spool_picker/README.md`

- [ ] **Step 1: Create `__manifest__.py`**

```python
{
    'name': 'POS Lot Spool Picker',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Pick lot-tracked products (cable spools) by remaining meters and location, split a sale across bobinas.',
    'description': """
Replaces the native POS lot popup for lot/serial-tracked products with a spool picker:
- Lists available lots (bobinas) with remaining meters and storage location.
- Auto-suggests the smallest lot that still covers the requested meters (anti-retazo).
- Splits one sale across several lots while keeping a single customer-facing line.
- Warns (default) or blocks (per POS config) when the assignment exceeds real stock.
    """,
    'author': 'AlparData',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'stock'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_lot_spool_picker/static/src/app/**/*',
        ],
        'web.assets_unit_tests': [
            'pos_lot_spool_picker/static/tests/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

- [ ] **Step 2: Create `__init__.py`**

```python
from . import models
```

- [ ] **Step 3: Create `models/__init__.py`**

```python
from . import pos_config
from . import pos_pack_operation_lot
from . import pos_order_line
from . import stock_move
```

- [ ] **Step 4: Create `README.md`**

```markdown
# POS Lot Spool Picker

Replaces the native POS lot popup for lot/serial-tracked products with a spool picker
tailored to selling by the meter from large spools (bobinas).

## Features
- Lists available lots with **remaining meters + storage location** (fresh per popup open
  via the native `get_existing_lots` RPC, extended to return location).
- Auto-suggests the **smallest lot whose remaining >= requested** (anti-retazo); falls back
  to combining partial lots when none covers alone.
- Splits one sale across several lots but keeps **one customer-facing order line** (invoice,
  ticket and pre-ticket all show a single line). The split lives only in the delivery picking
  as one stock move with several move lines.
- **Warn (default)** or **hard-block** when the assignment exceeds real stock, toggled per POS
  in Settings → Point of Sale → `Enforce spool stock`.

## Known limitations (v1)
- Stock figures are fetched when the popup opens. If another terminal dispatches from the same
  lot while the popup is open, the number can go stale; use **Actualizar** to refetch. The
  authoritative check still happens server-side at picking validation.
- Internal pre-ticket copy with per-bobina breakdown is not included (planned v2).
```

- [ ] **Step 5: Commit**

```bash
git add pos_lot_spool_picker/__init__.py pos_lot_spool_picker/__manifest__.py pos_lot_spool_picker/models/__init__.py pos_lot_spool_picker/README.md
git commit -m "feat(spool): scaffold pos_lot_spool_picker module"
```

---

## Task 2: Add `qty` to `pos.pack.operation.lot`

**Files:**
- Create: `pos_lot_spool_picker/models/pos_pack_operation_lot.py`

- [ ] **Step 1: Write the model extension**

```python
from odoo import api, fields, models


class PosPackOperationLot(models.Model):
    _inherit = 'pos.pack.operation.lot'

    # Meters (or units) taken from THIS lot for the order line. When set, it drives the
    # stock move line qty instead of the whole line qty. Defaults to 0.0 so native
    # single-lot behaviour (qty = line qty) is preserved when the field is untouched.
    qty = fields.Float('Lot Quantity', default=0.0, digits='Product Unit of Measure')

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if 'qty' not in fields_list:
            fields_list.append('qty')
        return fields_list
```

- [ ] **Step 2: Update the module (no test yet — field presence is verified indirectly in Task 5)**

Run: `odoo -c <conf> -d <db> -u pos_lot_spool_picker --stop-after-init`
Expected: module updates without error; `pos.pack.operation.lot` now has a `qty` column.

- [ ] **Step 3: Commit**

```bash
git add pos_lot_spool_picker/models/pos_pack_operation_lot.py
git commit -m "feat(spool): add qty field to pos.pack.operation.lot"
```

---

## Task 3: Extend `get_existing_lots` to return location

**Files:**
- Create: `pos_lot_spool_picker/models/pos_order_line.py`
- Test: `pos_lot_spool_picker/tests/test_spool_move_lines.py` (created here, expanded in Task 5)
- Create: `pos_lot_spool_picker/tests/__init__.py`

- [ ] **Step 1: Create `tests/__init__.py`**

```python
from . import test_spool_move_lines
```

- [ ] **Step 2: Write the failing test for location in get_existing_lots**

Create `pos_lot_spool_picker/tests/test_spool_move_lines.py`:

```python
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


class TestSpoolLots(TestPoSCommon):

    def setUp(self):
        super().setUp()
        self.config = self.basic_config
        self.product = self.create_product(
            'Cable 2x2.5', self.categ_basic, 10.0, 5.0,
        )
        self.product.write({'is_storable': True, 'tracking': 'lot'})
        self.src_loc = self.config.picking_type_id.default_location_src_id
        self.lotA = self.env['stock.lot'].create({
            'name': 'BOB-A', 'product_id': self.product.id,
        })
        self.env['stock.quant']._update_available_quantity(
            self.product, self.src_loc, 300.0, lot_id=self.lotA,
        )

    def test_get_existing_lots_includes_location(self):
        result = self.env['pos.order.line'].get_existing_lots(
            self.env.company.id, self.config.id, self.product.id,
        )
        self.assertEqual(len(result), 1)
        lot = result[0]
        self.assertEqual(lot['name'], 'BOB-A')
        self.assertEqual(lot['product_qty'], 300.0)
        self.assertIn('location_name', lot)
        self.assertEqual(lot['location_name'], self.src_loc.display_name)
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_lot_spool_picker --stop-after-init -i pos_lot_spool_picker`
Expected: FAIL with `KeyError: 'location_name'` (native result has no location).

- [ ] **Step 4: Write `models/pos_order_line.py` overriding get_existing_lots**

```python
from odoo import api, models


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    @api.model
    def get_existing_lots(self, company_id, config_id, product_id):
        """Extend the native result with each lot's storage location(s).

        Native groups stock.quant by lot_id summing quantity. We re-read the same
        quants to attach a human-readable location per lot for the spool picker.
        """
        result = super().get_existing_lots(company_id, config_id, product_id)
        if not result:
            return result

        pos_config = self.env['pos.config'].browse(config_id)
        src_loc = pos_config.picking_type_id.default_location_src_id
        lot_ids = [lot['id'] for lot in result]
        quants = self.sudo().env['stock.quant'].search([
            ('lot_id', 'in', lot_ids),
            ('location_id', 'in', src_loc.child_internal_location_ids.ids),
            ('quantity', '>', 0),
        ])
        # Pick the location holding the most quantity for each lot (the main spot).
        loc_by_lot = {}
        for lot_id in lot_ids:
            lot_quants = quants.filtered(lambda q: q.lot_id.id == lot_id)
            if lot_quants:
                main = max(lot_quants, key=lambda q: q.quantity)
                loc_by_lot[lot_id] = main.location_id.display_name
        for lot in result:
            lot['location_name'] = loc_by_lot.get(lot['id'], '')
        return result
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_lot_spool_picker --stop-after-init -u pos_lot_spool_picker`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pos_lot_spool_picker/models/pos_order_line.py pos_lot_spool_picker/tests/__init__.py pos_lot_spool_picker/tests/test_spool_move_lines.py
git commit -m "feat(spool): return lot location from get_existing_lots"
```

---

## Task 4: POS config toggle `spool_picker_enforce_stock`

**Files:**
- Create: `pos_lot_spool_picker/models/pos_config.py`
- Create: `pos_lot_spool_picker/views/res_config_settings_views.xml`

- [ ] **Step 1: Write `models/pos_config.py`**

```python
from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # When True the spool picker blocks confirming an allocation that exceeds a lot's
    # real remaining stock. Default False = warn but allow (cable meters never match exactly).
    spool_picker_enforce_stock = fields.Boolean(
        string='Enforce Spool Stock',
        help='If enabled, the spool picker prevents assigning more meters than a lot has '
             'in stock. If disabled, it only shows a warning and still allows confirming.',
        default=False,
    )
```

`pos.config` fields reach the POS automatically via the core `_load_pos_data_read` override (the base mixin returns `[]` and core adds config fields directly), so no `_load_pos_data_fields` change is needed here — matching the pattern documented in `pos_centralized_payment/models/pos_config.py`.

- [ ] **Step 2: Write `views/res_config_settings_views.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="res_config_settings_view_form_spool" model="ir.ui.view">
        <field name="name">res.config.settings.view.form.spool.picker</field>
        <field name="model">res.config.settings</field>
        <field name="inherit_id" ref="point_of_sale.res_config_settings_view_form"/>
        <field name="arch" type="xml">
            <xpath expr="//block[@id='pos_inventory_section']" position="inside">
                <setting id="spool_picker_enforce_stock_setting"
                         title="Block assigning more meters than a spool has in stock.">
                    <field name="pos_config_id" invisible="1"/>
                    <field name="spool_picker_enforce_stock"/>
                </setting>
            </xpath>
        </field>
    </record>
</odoo>
```

- [ ] **Step 3: Discovery — confirm the inventory block anchor id**

Run: `grep -n "pos_inventory_section\|Inventory\|id=\"inventory" "$POS/../point_of_sale/views/res_config_settings_views.xml"` (where `$POS` is the installed point_of_sale). If the block id differs in this build, replace `pos_inventory_section` in Step 2 with the actual id of the POS Inventory settings block. If no dedicated block exists, xpath onto any existing POS setting block instead (e.g. the block containing `iface_tipproduct`).

- [ ] **Step 4: Verify the setting renders**

Run: `odoo -c <conf> -d <db> -u pos_lot_spool_picker --stop-after-init`
Then open Settings → Point of Sale; confirm the "Enforce Spool Stock" toggle appears for a POS.
Expected: no view error on upgrade; toggle visible.

- [ ] **Step 5: Commit**

```bash
git add pos_lot_spool_picker/models/pos_config.py pos_lot_spool_picker/views/res_config_settings_views.xml
git commit -m "feat(spool): add per-POS enforce-stock toggle"
```

---

## Task 5: Override move-line creation to honor per-lot qty (CRITICAL)

**Files:**
- Create: `pos_lot_spool_picker/models/stock_move.py`
- Test: `pos_lot_spool_picker/tests/test_spool_move_lines.py` (expand)

- [ ] **Step 1: Write the failing test for split move lines**

Append to `pos_lot_spool_picker/tests/test_spool_move_lines.py` (inside `TestSpoolLots`):

```python
    def _make_paid_order_with_split(self):
        """One line of 500m of cable split across BOB-A (300) and BOB-B (200)."""
        self.lotB = self.env['stock.lot'].create({
            'name': 'BOB-B', 'product_id': self.product.id,
        })
        self.env['stock.quant']._update_available_quantity(
            self.product, self.src_loc, 250.0, lot_id=self.lotB,
        )
        order = self.env['pos.order'].create({
            'company_id': self.env.company.id,
            'session_id': self.open_new_session().id,
            'partner_id': False,
            'lines': [(0, 0, {
                'name': 'L1',
                'product_id': self.product.id,
                'qty': 500.0,
                'price_unit': 10.0,
                'price_subtotal': 5000.0,
                'price_subtotal_incl': 5000.0,
                'pack_lot_ids': [
                    (0, 0, {'lot_name': 'BOB-A', 'qty': 300.0}),
                    (0, 0, {'lot_name': 'BOB-B', 'qty': 200.0}),
                ],
            })],
            'amount_total': 5000.0, 'amount_tax': 0.0,
            'amount_paid': 0.0, 'amount_return': 0.0,
        })
        return order

    def test_split_creates_one_move_with_two_move_lines(self):
        order = self._make_paid_order_with_split()
        order.lines._launch_stock_rule_from_pos_order_lines()

        moves = order.picking_ids.move_ids.filtered(
            lambda m: m.product_id == self.product)
        self.assertEqual(len(moves), 1, "expected a single stock move for the line")
        mls = moves.move_line_ids
        by_lot = {ml.lot_id.name: ml.quantity for ml in mls}
        self.assertEqual(by_lot.get('BOB-A'), 300.0)
        self.assertEqual(by_lot.get('BOB-B'), 200.0)

    def test_single_lot_matches_native(self):
        order = self.env['pos.order'].create({
            'company_id': self.env.company.id,
            'session_id': self.open_new_session().id,
            'partner_id': False,
            'lines': [(0, 0, {
                'name': 'L1', 'product_id': self.product.id, 'qty': 120.0,
                'price_unit': 10.0, 'price_subtotal': 1200.0, 'price_subtotal_incl': 1200.0,
                'pack_lot_ids': [(0, 0, {'lot_name': 'BOB-A', 'qty': 0.0})],
            })],
            'amount_total': 1200.0, 'amount_tax': 0.0,
            'amount_paid': 0.0, 'amount_return': 0.0,
        })
        order.lines._launch_stock_rule_from_pos_order_lines()
        moves = order.picking_ids.move_ids.filtered(lambda m: m.product_id == self.product)
        mls = moves.move_line_ids
        self.assertEqual(len(mls), 1)
        self.assertEqual(mls.lot_id.name, 'BOB-A')
        self.assertEqual(mls.quantity, 120.0)
```

> Note: `_update_available_quantity` for BOB-A was 300 in setUp; the split test reads 300 from A and 200 from B (B has 250). Both are within stock, so the `are_qties_done=False` reservation path assigns cleanly.

- [ ] **Step 2: Run to verify failure**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_lot_spool_picker --stop-after-init -u pos_lot_spool_picker`
Expected: FAIL — native assigns `abs(line.qty)` (500) per lot, so BOB-A reserves 500 (over stock) or move lines don't match 300/200.

- [ ] **Step 3: Write `models/stock_move.py`**

The native method computes `qty = abs(line.qty)` for every pack lot (`stock_picking.py:281` and `:318-321`). We override so that when a pack lot carries a positive `qty`, that value is used instead. We reimplement the method scoped to Odoo 19.0 (no finer seam exists); the only behavioural change is the per-lot qty source.

```python
from odoo import models


class StockMove(models.Model):
    _inherit = 'stock.move'

    def _add_mls_related_to_order(self, related_order_lines, are_qties_done=True):
        """Same as core, but each pack lot consumes its own `qty` (meters) when set.

        Only lot-tracked lines whose pack lots carry a positive `qty` deviate from core;
        everything else is delegated to super so serial tracking and single-lot lines keep
        native behaviour. Pinned to Odoo 19.0 core logic — re-verify on version upgrade.
        """
        # Lines where our per-lot qty applies: lot tracking with at least one qty > 0.
        def uses_spool_qty(line):
            return (
                line.product_id.tracking == 'lot'
                and any(pl.qty for pl in line.pack_lot_ids.filtered(lambda l: l.lot_name))
            )

        spool_lines = related_order_lines.filtered(uses_spool_qty)
        if not spool_lines:
            return super()._add_mls_related_to_order(related_order_lines, are_qties_done=are_qties_done)

        other_lines = related_order_lines - spool_lines
        spool_products = spool_lines.product_id
        other_moves = self.filtered(lambda m: m.product_id not in spool_products)
        spool_moves = self - other_moves

        if other_lines or other_moves:
            other_moves._add_mls_related_to_order(other_lines, are_qties_done=are_qties_done)

        # Handle the spool moves with per-lot meters.
        lines_by_product = {}
        for line in spool_lines:
            lines_by_product.setdefault(line.product_id.id, self.env['pos.order.line'])
            lines_by_product[line.product_id.id] |= line

        existing_lots = spool_moves._create_production_lots_for_pos_order(spool_lines)
        move_lines_to_create = []
        for move in spool_moves:
            lines = lines_by_product.get(move.product_id.id)
            if not lines:
                continue
            if are_qties_done:
                move.move_line_ids.unlink()
            for line in lines:
                for lot in line.pack_lot_ids.filtered(lambda l: l.lot_name):
                    qty = abs(lot.qty) if lot.qty else abs(line.qty)
                    existing_lot = existing_lots.filtered_domain(
                        [('product_id', '=', line.product_id.id), ('name', '=', lot.lot_name)]
                    ) if existing_lots else self.env['stock.lot']
                    if are_qties_done:
                        if existing_lot:
                            quants = self.env['stock.quant'].search(
                                [('lot_id', '=', existing_lot.id), ('quantity', '>', '0.0'),
                                 ('location_id', 'child_of', move.location_id.id)],
                                order='id desc',
                            )
                            qty_left = qty
                            for quant in quants:
                                if qty_left <= 0:
                                    break
                                qty_chg = min(qty_left, quant.quantity)
                                ml_vals = dict(move._prepare_move_line_vals(qty_chg))
                                ml_vals.update({'quant_id': quant.id})
                                move_lines_to_create.append(ml_vals)
                                qty_left -= qty_chg
                            if qty_left > 0:
                                ml_vals = dict(move._prepare_move_line_vals(qty_left))
                                ml_vals.update({'lot_name': existing_lot.name, 'lot_id': existing_lot.id})
                                move_lines_to_create.append(ml_vals)
                        else:
                            ml_vals = dict(move._prepare_move_line_vals(qty))
                            ml_vals.update({'lot_name': lot.lot_name})
                            move_lines_to_create.append(ml_vals)
                    else:
                        if existing_lot:
                            move._update_reserved_quantity(qty, move.location_id, lot_id=existing_lot)

        if move_lines_to_create:
            self.env['stock.move.line'].create(move_lines_to_create)
```

- [ ] **Step 4: Run to verify pass**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_lot_spool_picker --stop-after-init -u pos_lot_spool_picker`
Expected: PASS — split test yields BOB-A/300 + BOB-B/200; single-lot test yields BOB-A/120.

- [ ] **Step 5: Commit**

```bash
git add pos_lot_spool_picker/models/stock_move.py pos_lot_spool_picker/tests/test_spool_move_lines.py
git commit -m "feat(spool): per-lot meters drive stock move lines"
```

---

## Task 6: Suggestion/allocation logic (pure, unit-tested)

**Files:**
- Create: `pos_lot_spool_picker/static/src/app/spool_allocation.js`
- Test: `pos_lot_spool_picker/static/tests/spool_allocation.test.js`

- [ ] **Step 1: Write the failing hoot test**

```javascript
import { describe, expect, test } from "@odoo/hoot";
import { suggestAllocation } from "@pos_lot_spool_picker/app/spool_allocation";

describe("suggestAllocation", () => {
    test("picks the smallest single lot that covers the request", () => {
        const lots = [
            { id: 1, name: "A", remaining: 250 },
            { id: 2, name: "B", remaining: 600 },
            { id: 3, name: "C", remaining: 520 },
        ];
        const alloc = suggestAllocation(lots, 500);
        expect(alloc).toEqual([{ id: 3, name: "C", remaining: 520, qty: 500 }]);
    });

    test("combines partials from smallest up when none covers alone", () => {
        const lots = [
            { id: 1, name: "A", remaining: 150 },
            { id: 2, name: "B", remaining: 200 },
            { id: 3, name: "C", remaining: 300 },
        ];
        const alloc = suggestAllocation(lots, 500);
        expect(alloc).toEqual([
            { id: 1, name: "A", remaining: 150, qty: 150 },
            { id: 2, name: "B", remaining: 200, qty: 200 },
            { id: 3, name: "C", remaining: 300, qty: 150 },
        ]);
    });

    test("returns empty allocation for non-positive request", () => {
        expect(suggestAllocation([{ id: 1, name: "A", remaining: 100 }], 0)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_lot_spool_picker:web --stop-after-init -i pos_lot_spool_picker` (or the project's JS test runner for `web.assets_unit_tests`).
Expected: FAIL — module `spool_allocation` not found.

- [ ] **Step 3: Write `static/src/app/spool_allocation.js`**

```javascript
/** @odoo-module **/

/**
 * Suggest how to fulfil `requested` meters from `lots`.
 * Rule: if any single lot's remaining >= requested, use the SMALLEST such lot
 * (anti-retazo). Otherwise combine partial lots from smallest remaining upward
 * until the request is covered (or lots run out).
 *
 * @param {{id:number, name:string, remaining:number}[]} lots
 * @param {number} requested
 * @returns {{id:number, name:string, remaining:number, qty:number}[]}
 */
export function suggestAllocation(lots, requested) {
    if (!requested || requested <= 0) {
        return [];
    }
    const sorted = [...lots]
        .filter((l) => l.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining);

    const covering = sorted.find((l) => l.remaining >= requested);
    if (covering) {
        return [{ ...covering, qty: requested }];
    }

    const allocation = [];
    let left = requested;
    for (const lot of sorted) {
        if (left <= 0) {
            break;
        }
        const qty = Math.min(left, lot.remaining);
        allocation.push({ ...lot, qty });
        left -= qty;
    }
    return allocation;
}

/**
 * Total meters assigned across an allocation.
 * @param {{qty:number}[]} allocation
 * @returns {number}
 */
export function allocatedTotal(allocation) {
    return allocation.reduce((sum, a) => sum + (a.qty || 0), 0);
}
```

- [ ] **Step 4: Run to verify pass**

Run: same command as Step 2.
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add pos_lot_spool_picker/static/src/app/spool_allocation.js pos_lot_spool_picker/static/tests/spool_allocation.test.js
git commit -m "feat(spool): suggestion/allocation logic with unit tests"
```

---

## Task 7: `SpoolPickerPopup` component

**Files:**
- Create: `pos_lot_spool_picker/static/src/app/popups/spool_picker_popup/spool_picker_popup.js`
- Create: `pos_lot_spool_picker/static/src/app/popups/spool_picker_popup/spool_picker_popup.xml`

- [ ] **Step 1: Write `spool_picker_popup.js`**

```javascript
/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { suggestAllocation, allocatedTotal } from "@pos_lot_spool_picker/app/spool_allocation";

/**
 * @typedef {Object} SpoolLot
 * @property {number} id
 * @property {string} name
 * @property {number} remaining
 * @property {string} location_name
 */

export class SpoolPickerPopup extends Component {
    static template = "pos_lot_spool_picker.SpoolPickerPopup";
    static components = { Dialog };
    static props = {
        productName: String,
        requested: Number,
        lots: Array, // SpoolLot[]
        enforceStock: { type: Boolean, optional: true },
        refresh: { type: Function, optional: true }, // async () => SpoolLot[]
        getPayload: Function,
        close: Function,
    };

    setup() {
        const suggested = suggestAllocation(this.props.lots, this.props.requested);
        const qtyById = Object.fromEntries(suggested.map((a) => [a.id, a.qty]));
        this.state = useState({
            requested: this.props.requested,
            lots: this.props.lots.map((l) => ({ ...l, qty: qtyById[l.id] || 0 })),
        });
    }

    get assigned() {
        return allocatedTotal(this.state.lots);
    }

    get isComplete() {
        return this.assigned > 0 && Math.abs(this.assigned - this.state.requested) < 1e-6;
    }

    get isUnder() {
        return this.assigned + 1e-6 < this.state.requested;
    }

    lotOverStock(lot) {
        return (lot.qty || 0) - lot.remaining > 1e-6;
    }

    get anyOverStock() {
        return this.state.lots.some((l) => this.lotOverStock(l));
    }

    get canConfirm() {
        if (this.assigned <= 0) {
            return false;
        }
        return this.props.enforceStock ? !this.anyOverStock : true;
    }

    setQty(lot, value) {
        lot.qty = parseFloat(value) || 0;
    }

    setRequested(value) {
        this.state.requested = parseFloat(value) || 0;
    }

    async onRefresh() {
        if (!this.props.refresh) {
            return;
        }
        const fresh = await this.props.refresh();
        const qtyById = Object.fromEntries(this.state.lots.map((l) => [l.id, l.qty]));
        this.state.lots = fresh.map((l) => ({ ...l, qty: qtyById[l.id] || 0 }));
    }

    confirm() {
        const allocation = this.state.lots
            .filter((l) => (l.qty || 0) > 0)
            .map((l) => ({ lot_name: l.name, id: l.id, qty: l.qty }));
        this.props.getPayload(allocation);
        this.props.close();
    }

    cancel() {
        this.props.close();
    }

    warningText(lot) {
        if (!this.lotOverStock(lot)) {
            return "";
        }
        return _t("Assigning %(qty)s but only %(rem)s in stock", {
            qty: lot.qty,
            rem: lot.remaining,
        });
    }
}
```

- [ ] **Step 2: Write `spool_picker_popup.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">
    <t t-name="pos_lot_spool_picker.SpoolPickerPopup">
        <Dialog title="props.productName">
            <div class="d-flex flex-column gap-2 p-2">
                <div class="d-flex align-items-center gap-3">
                    <label class="fw-bold w-50">Metros pedidos:</label>
                    <input type="number" class="form-control" t-att-value="state.requested"
                           t-on-change="(ev) => this.setRequested(ev.target.value)"/>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <span class="fw-bold"
                          t-attf-class="{{ isComplete ? 'text-success' : (isUnder ? 'text-warning' : 'text-danger') }}">
                        Asignado: <t t-esc="assigned"/> / <t t-esc="state.requested"/>
                    </span>
                    <button class="btn btn-sm btn-secondary" t-on-click="onRefresh"
                            t-if="props.refresh">Actualizar</button>
                </div>
                <table class="table table-sm">
                    <thead>
                        <tr><th>Bobina</th><th>Restante</th><th>Ubicación</th><th>Metros</th></tr>
                    </thead>
                    <tbody>
                        <tr t-foreach="state.lots" t-as="lot" t-key="lot.id"
                            t-attf-class="{{ lotOverStock(lot) ? 'table-danger' : '' }}">
                            <td t-esc="lot.name"/>
                            <td t-esc="lot.remaining"/>
                            <td t-esc="lot.location_name"/>
                            <td>
                                <input type="number" min="0" class="form-control form-control-sm"
                                       t-att-value="lot.qty"
                                       t-on-change="(ev) => this.setQty(lot, ev.target.value)"/>
                                <small class="text-danger" t-esc="warningText(lot)"/>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <small class="text-warning" t-if="isUnder">
                    Estás asignando menos que lo pedido; se venderán los metros asignados.
                </small>
            </div>
            <t t-set-slot="footer">
                <button class="btn btn-secondary btn-lg" t-on-click="cancel">Cancelar</button>
                <button class="btn btn-primary btn-lg" t-on-click="confirm"
                        t-att-disabled="!canConfirm">Confirmar</button>
            </t>
        </Dialog>
    </t>
</templates>
```

- [ ] **Step 3: Verify assets compile**

Run: `odoo -c <conf> -d <db> -u pos_lot_spool_picker --stop-after-init` then load the POS UI; confirm no console/asset errors (popup is not wired yet — Task 8).
Expected: POS loads without asset errors.

- [ ] **Step 4: Commit**

```bash
git add pos_lot_spool_picker/static/src/app/popups/spool_picker_popup/
git commit -m "feat(spool): SpoolPickerPopup component"
```

---

## Task 8: Patch `editLots` to open the spool picker

**Files:**
- Create: `pos_lot_spool_picker/static/src/app/pos_store_patch.js`

- [ ] **Step 1: Write the `editLots` patch**

```javascript
/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/services/pos_store";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";
import { SpoolPickerPopup } from "@pos_lot_spool_picker/app/popups/spool_picker_popup/spool_picker_popup";

patch(PosStore.prototype, {
    /**
     * Fetch lots with location + remaining meters for the spool picker.
     * @returns {Promise<{id:number,name:string,remaining:number,location_name:string}[]>}
     */
    async _getSpoolLots(product) {
        const rows = await this.data.call("pos.order.line", "get_existing_lots", [
            this.company.id,
            this.config.id,
            product.id,
        ]);
        return (rows || []).map((r) => ({
            id: r.id,
            name: r.name,
            remaining: r.product_qty,
            location_name: r.location_name || "",
        }));
    },

    async editLots(product, packLotLinesToEdit) {
        // Only take over lot-tracked products; serials keep the native popup.
        if (product.tracking !== "lot") {
            return await super.editLots(...arguments);
        }

        const lots = await this._getSpoolLots(product);
        if (!lots.length) {
            // Nothing in stock to pick from — fall back to native (create-lot flow).
            return await super.editLots(...arguments);
        }

        const requested = Math.abs(parseFloat(this.numberBuffer?.get()) || 0) || 1;
        const allocation = await makeAwaitable(this.dialog, SpoolPickerPopup, {
            productName: product.display_name,
            requested,
            lots,
            enforceStock: !!this.config.spool_picker_enforce_stock,
            refresh: async () => await this._getSpoolLots(product),
        });

        if (!allocation) {
            return null; // cancelled
        }

        // Native shape: existing lots go to newPackLotLines with {lot_name, qty}.
        const newPackLotLines = allocation.map((a) => ({ lot_name: a.lot_name, qty: a.qty }));
        return { modifiedPackLotLines: {}, newPackLotLines };
    },
});
```

- [ ] **Step 2: Verify the popup opens on add**

Run: `odoo -c <conf> -d <db> -u pos_lot_spool_picker --stop-after-init`. In POS, add a lot-tracked product that has stock in >1 lot.
Expected: `SpoolPickerPopup` opens with the lot list, remaining meters, location, and a pre-filled suggestion. Confirming creates the order line with `pack_lot_ids` (qty per lot). Line qty is corrected in Task 9.

- [ ] **Step 3: Commit**

```bash
git add pos_lot_spool_picker/static/src/app/pos_store_patch.js
git commit -m "feat(spool): open SpoolPickerPopup from editLots for lot products"
```

---

## Task 9: Set line qty to the sum of allocated meters

**Files:**
- Modify: `pos_lot_spool_picker/static/src/app/pos_store_patch.js`

- [ ] **Step 1: Add the `addLineToOrder` patch**

Add a second method to the existing `patch(PosStore.prototype, { ... })` object in `pos_store_patch.js` (place it alongside `editLots`):

```javascript
    async addLineToOrder(vals, order, opts = {}, configure = true) {
        const line = await super.addLineToOrder(vals, order, opts, configure);
        // For lot-tracked lines whose pack lots carry per-lot meters, the customer-facing
        // line qty must equal the total assigned meters (native leaves it at 1 for lots).
        if (line && line.product_id?.tracking === "lot") {
            const total = line.pack_lot_ids.reduce((sum, pl) => sum + (pl.qty || 0), 0);
            if (total > 0 && Math.abs(line.qty - total) > 1e-6) {
                line.setQuantity(total);
            }
        }
        return line;
    },
```

- [ ] **Step 2: Manually verify the full add flow**

Run: `odoo -c <conf> -d <db> -u pos_lot_spool_picker --stop-after-init`. In POS:
1. Type `500`, click a lot-tracked cable product that has e.g. BOB-A=300 and BOB-C=520.
2. Popup suggests BOB-C=500. Change to BOB-A=300 + BOB-C=200; contador shows 500/500 green.
3. Confirm.

Expected: one order line `Cable — 500` (single customer-facing line), with two pack lots (A=300, C=200). Ticket/receipt shows one line.

- [ ] **Step 3: Commit**

```bash
git add pos_lot_spool_picker/static/src/app/pos_store_patch.js
git commit -m "feat(spool): set line qty to total allocated meters"
```

---

## Task 10: End-to-end verification & README polish

**Files:**
- Modify: `pos_lot_spool_picker/README.md` (only if steps surface gaps)

- [ ] **Step 1: Run the full backend test suite**

Run: `odoo -c <conf> -d <db> --test-enable --test-tags /pos_lot_spool_picker --stop-after-init -u pos_lot_spool_picker`
Expected: all tests from Tasks 3 and 5 PASS.

- [ ] **Step 2: Manual close-session inventory check**

In POS: create the split order from Task 9, pay, and close the session. Open Inventory → the delivery for that order.
Expected: one stock move for the cable (500) with two move lines — BOB-A/300 and BOB-C/200 — each decrementing the right lot. Invoice (if generated) shows a single 500 m line.

- [ ] **Step 3: Toggle enforce-stock and re-check**

Enable "Enforce Spool Stock" on the POS config. Repeat the add, assign more than a lot's remaining.
Expected: the offending row turns red and Confirmar is disabled until the assignment fits stock. With the toggle off, Confirmar stays enabled and only shows the red warning.

- [ ] **Step 4: Commit any README fixes**

```bash
git add pos_lot_spool_picker/README.md
git commit -m "docs(spool): finalize README after verification"
```

---

## Out of scope (v1, do NOT build here)

- Internal pre-ticket copy with per-bobina breakdown (planned v2).
- Real-time cross-terminal stock reservation beyond the Actualizar refetch (planned v2).
- Configurable suggestion criteria (FEFO etc.) — v1 is fixed anti-retazo.

## Upgrade risk note

`stock.move._add_mls_related_to_order` (Task 5) is a full-method override mirroring Odoo 19.0
core, because the per-lot qty is computed inline with no finer seam. On any Odoo minor/major
upgrade, diff the core method against Task 5 and reconcile. The frontend `editLots` /
`addLineToOrder` patches call `super`, so they are far lower risk.
