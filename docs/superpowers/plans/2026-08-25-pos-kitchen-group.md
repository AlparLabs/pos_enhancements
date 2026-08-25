# Grupos de cocina configurables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a `pos_kitchen_receipt_grouping` un concepto propio y configurable de agrupación del ticket de cocina (Entradas, Principales, Postres, Extras), asignable en la categoría POS con override por producto, reemplazando a la categoría POS como criterio de bloque.

**Architecture:** Un modelo maestro `pos.kitchen.group` (nombre + secuencia) cargado al POS, referenciado por un M2O en `pos.category` y otro opcional en `product.template`. La resolución del grupo y el orden de las líneas salen a un archivo de funciones puras (`static/src/app/kitchen_group.js`) que `pos_store.js` consume; el core sigue haciendo el agrupamiento y el ordenamiento de bloques vía `change.group`.

**Tech Stack:** Odoo 19, OWL 2, Hoot (tests unitarios JS), `TestPoSCommon` (tests Python).

**Spec:** `docs/superpowers/specs/2026-08-25-pos-kitchen-group-design.md`

---

## Referencia de APIs del core (verificadas en `odoo/19.0` el 2026-08-25)

Estas firmas fueron leídas del fuente. **No inventar variantes ni copiar de los módulos 18.0 de este repo**, que usan APIs viejas.

| Qué | Firma / valor exacto en 19.0 |
|---|---|
| `pos.session._load_pos_data_models` | `@api.model def _load_pos_data_models(self, config)` — recibe el **recordset** `config`, no un id. Los módulos 18.0 del repo usan `config_id`: está mal para 19. |
| `pos.load.mixin._load_pos_data_domain` | `def _load_pos_data_domain(self, data, config)` — **dos** parámetros. |
| `pos.load.mixin._load_pos_data_fields` | `def _load_pos_data_fields(self, config)` |
| Constraint SQL única | `_name_uniq = models.Constraint('unique (name)', 'mensaje')`. En 19 **no** se usa `_sql_constraints = [...]`; los módulos 18.0 del repo (`pos_course.py`, `cr_pos_kot_kds_seq_generator`) lo usan y no hay que imitarlos. |
| `product.template._load_pos_data_fields` | Ya incluye `pos_categ_ids`; hay que agregarle `kitchen_group_id`. |
| Vista producto POS | `point_of_sale.product_template_form_view` (hereda `product.product_template_form_view`), con `<page string="Point of Sale" name="pos">` y adentro `<field name="pos_categ_ids"/>`. |
| Menú configuración POS | `point_of_sale.menu_point_config_product`, nombre "Configuration", hijo de `menu_point_root`. |
| Vistas de categoría POS | `point_of_sale.product_pos_category_form_view` y `point_of_sale.product_pos_category_tree_view` — ya en uso por este módulo. |
| Agrupamiento del ticket | `receiptLineGrouper.getGroup(orderline)` de `@point_of_sale/app/models/utils/order_change` devuelve `{ name, index }`. El core agrupa por `name` y ordena los bloques por `index`; dentro de cada bloque respeta el orden del array `data.changes.data`. |

## Estructura de archivos

```
pos_kitchen_receipt_grouping/
├── __manifest__.py                            (MOD: versión, data, assets)
├── data/pos_kitchen_group_data.xml            (NUEVO)
├── models/
│   ├── __init__.py                            (MOD)
│   ├── pos_kitchen_group.py                   (NUEVO)  modelo maestro
│   ├── pos_session.py                         (NUEVO)  carga del modelo al POS
│   ├── pos_category.py                        (MOD)    kitchen_group_id + help
│   └── product_template.py                    (NUEVO)  override por producto
├── security/ir.model.access.csv               (NUEVO)
├── views/
│   ├── pos_kitchen_group_views.xml            (NUEVO)  lista, form y menú
│   ├── pos_category_view.xml                  (MOD)
│   └── product_views.xml                      (NUEVO)
├── static/src/app/
│   ├── kitchen_group.js                       (NUEVO)  funciones puras
│   ├── services/pos_store.js                  (MOD)    cableado
│   └── printer/order_change_receipt.xml       (MOD)    tamaño del encabezado
├── static/tests/kitchen_group.test.js         (NUEVO)  hoot
└── tests/
    ├── __init__.py                            (NUEVO)
    └── test_kitchen_group.py                  (NUEVO)
```

`kitchen_group.js` no importa nada del POS ni de OWL: eso lo hace testeable con Hoot sin levantar el entorno POS, igual que `pos_product_list_view/static/src/app/view_mode.js`. Además saca dos responsabilidades de `pos_store.js`, que ya concentra cinco.

---

## Task 1: Modelo `pos.kitchen.group`

**Files:**
- Create: `pos_kitchen_receipt_grouping/models/pos_kitchen_group.py`
- Create: `pos_kitchen_receipt_grouping/models/pos_session.py`
- Create: `pos_kitchen_receipt_grouping/security/ir.model.access.csv`
- Create: `pos_kitchen_receipt_grouping/views/pos_kitchen_group_views.xml`
- Create: `pos_kitchen_receipt_grouping/tests/__init__.py`
- Create: `pos_kitchen_receipt_grouping/tests/test_kitchen_group.py`
- Modify: `pos_kitchen_receipt_grouping/models/__init__.py`
- Modify: `pos_kitchen_receipt_grouping/__manifest__.py`

- [ ] **Step 1: Escribir el test que falla**

`pos_kitchen_receipt_grouping/tests/__init__.py`:

```python
from . import test_kitchen_group
```

`pos_kitchen_receipt_grouping/tests/test_kitchen_group.py`:

```python
from psycopg2 import IntegrityError

from odoo.tools import mute_logger
from odoo.addons.point_of_sale.tests.common import TestPoSCommon


class TestKitchenGroup(TestPoSCommon):

    def setUp(self):
        super().setUp()
        self.config = self.basic_config

    def test_model_is_loaded_in_the_pos_session(self):
        models = self.env['pos.session']._load_pos_data_models(self.config)
        self.assertIn('pos.kitchen.group', models)

    def test_loaded_fields_are_id_name_and_sequence(self):
        fields = self.env['pos.kitchen.group']._load_pos_data_fields(self.config)
        self.assertEqual(sorted(fields), ['id', 'name', 'sequence'])

    def test_groups_are_ordered_by_sequence(self):
        Group = self.env['pos.kitchen.group']
        dessert = Group.create({'name': 'Postres ZZZ', 'sequence': 30})
        starter = Group.create({'name': 'Entradas AAA', 'sequence': 10})
        ordered = Group.search([('id', 'in', (dessert + starter).ids)])
        self.assertEqual(ordered[0], starter)
        self.assertEqual(ordered[1], dessert)

    @mute_logger('odoo.sql_db')
    def test_group_name_is_unique(self):
        self.env['pos.kitchen.group'].create({'name': 'Principales'})
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                self.env['pos.kitchen.group'].create({'name': 'Principales'})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `odoo -d <db> -u pos_kitchen_receipt_grouping --test-enable --test-tags /pos_kitchen_receipt_grouping --stop-after-init`

Expected: FAIL con `KeyError: 'pos.kitchen.group'` (el modelo no existe).

- [ ] **Step 3: Crear el modelo**

`pos_kitchen_receipt_grouping/models/pos_kitchen_group.py`:

```python
from typing import Any

from odoo import api, fields, models


class PosKitchenGroup(models.Model):
    _name = 'pos.kitchen.group'
    _description = 'POS Kitchen Group'
    _inherit = ['pos.load.mixin']
    _order = 'sequence, id'

    name = fields.Char(string='Name', required=True, translate=True)
    sequence = fields.Integer(
        string='Sequence',
        default=10,
        help="Orders the blocks on the kitchen receipt. Lower numbers print first.",
    )
    category_ids = fields.One2many(
        'pos.category',
        'kitchen_group_id',
        string='POS Categories',
    )

    _name_uniq = models.Constraint(
        'unique (name)',
        'A kitchen group with this name already exists.',
    )

    @api.model
    def _load_pos_data_domain(self, data: Any, config: Any) -> list:
        # Son pocos registros y el ticket puede necesitar cualquiera de ellos
        # (un producto puede pisar el grupo de su categoría), así que se cargan
        # todos sin filtrar por las categorías habilitadas en el POS.
        return []

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        return ['id', 'name', 'sequence']
```

- [ ] **Step 4: Cargar el modelo en la sesión POS**

`pos_kitchen_receipt_grouping/models/pos_session.py`:

```python
from typing import Any

from odoo import api, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config: Any) -> list[str]:
        models_to_load = super()._load_pos_data_models(config)
        models_to_load += ['pos.kitchen.group']
        return models_to_load
```

- [ ] **Step 5: Registrar los modelos nuevos**

`pos_kitchen_receipt_grouping/models/__init__.py` queda:

```python
from . import pos_kitchen_group
from . import pos_category
from . import pos_session
```

- [ ] **Step 6: Reglas de acceso**

`pos_kitchen_receipt_grouping/security/ir.model.access.csv`:

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_pos_kitchen_group_user,pos.kitchen.group user,model_pos_kitchen_group,point_of_sale.group_pos_user,1,0,0,0
access_pos_kitchen_group_manager,pos.kitchen.group manager,model_pos_kitchen_group,point_of_sale.group_pos_manager,1,1,1,1
```

- [ ] **Step 7: Vistas y menú**

`pos_kitchen_receipt_grouping/views/pos_kitchen_group_views.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="pos_kitchen_group_view_list" model="ir.ui.view">
        <field name="name">pos.kitchen.group.view.list</field>
        <field name="model">pos.kitchen.group</field>
        <field name="arch" type="xml">
            <list string="Kitchen Groups" editable="bottom">
                <field name="sequence" widget="handle"/>
                <field name="name"/>
            </list>
        </field>
    </record>

    <record id="pos_kitchen_group_view_form" model="ir.ui.view">
        <field name="name">pos.kitchen.group.view.form</field>
        <field name="model">pos.kitchen.group</field>
        <field name="arch" type="xml">
            <form string="Kitchen Group">
                <sheet>
                    <group>
                        <field name="name"/>
                        <field name="sequence"/>
                    </group>
                    <notebook>
                        <page string="POS Categories" name="categories">
                            <field name="category_ids">
                                <list>
                                    <field name="name"/>
                                    <field name="kitchen_sequence"/>
                                </list>
                            </field>
                        </page>
                    </notebook>
                </sheet>
            </form>
        </field>
    </record>

    <record id="pos_kitchen_group_action" model="ir.actions.act_window">
        <field name="name">Kitchen Groups</field>
        <field name="res_model">pos.kitchen.group</field>
        <field name="view_mode">list,form</field>
        <field name="help" type="html">
            <p class="o_view_nocontent_smiling_face">Create a kitchen group</p>
            <p>Kitchen groups are the blocks printed on the kitchen receipt, such as
               Starters, Mains or Desserts. Assign each POS category to one of them.</p>
        </field>
    </record>

    <menuitem id="menu_pos_kitchen_group"
              name="Kitchen Groups"
              parent="point_of_sale.menu_point_config_product"
              action="pos_kitchen_group_action"
              sequence="25"/>
</odoo>
```

- [ ] **Step 8: Declarar security y vistas en el manifest**

En `pos_kitchen_receipt_grouping/__manifest__.py`, reemplazar el bloque `'data'` por:

```python
    'data': [
        'security/ir.model.access.csv',
        'views/pos_kitchen_group_views.xml',
        'views/pos_category_view.xml',
    ],
```

- [ ] **Step 9: Correr el test y verificar que pasa**

Run: `odoo -d <db> -u pos_kitchen_receipt_grouping --test-enable --test-tags /pos_kitchen_receipt_grouping --stop-after-init`

Expected: PASS, 4 tests de `TestKitchenGroup`.

Nota: si `_name_uniq` se escribió como `_sql_constraints`, en 19 esa forma se ignora y `test_group_name_is_unique` va a fallar porque el duplicado se crea sin error. Si eso pasa, revisar que se haya usado `models.Constraint`.

- [ ] **Step 10: Commit**

```bash
git add pos_kitchen_receipt_grouping/models pos_kitchen_receipt_grouping/security pos_kitchen_receipt_grouping/views pos_kitchen_receipt_grouping/tests pos_kitchen_receipt_grouping/__manifest__.py
```

```bash
git commit -m "feat(pos_kitchen_receipt_grouping): modelo pos.kitchen.group"
```

---

## Task 2: `kitchen_group_id` en `pos.category`

**Files:**
- Modify: `pos_kitchen_receipt_grouping/models/pos_category.py`
- Modify: `pos_kitchen_receipt_grouping/views/pos_category_view.xml`
- Modify: `pos_kitchen_receipt_grouping/tests/test_kitchen_group.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de la clase `TestKitchenGroup` en `pos_kitchen_receipt_grouping/tests/test_kitchen_group.py`:

```python
    def test_category_kitchen_group_travels_to_the_pos(self):
        fields = self.env['pos.category']._load_pos_data_fields(self.config)
        self.assertIn('kitchen_group_id', fields)
        self.assertIn('kitchen_sequence', fields)

    def test_category_ids_is_the_inverse_of_kitchen_group_id(self):
        group = self.env['pos.kitchen.group'].create({'name': 'Entradas', 'sequence': 10})
        category = self.env['pos.category'].create({
            'name': 'Picadas',
            'kitchen_group_id': group.id,
        })
        self.assertIn(category, group.category_ids)
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `odoo -d <db> -u pos_kitchen_receipt_grouping --test-enable --test-tags /pos_kitchen_receipt_grouping --stop-after-init`

Expected: FAIL con `ValueError: Invalid field 'kitchen_group_id' on model 'pos.category'`.

- [ ] **Step 3: Agregar el campo**

`pos_kitchen_receipt_grouping/models/pos_category.py` queda:

```python
from typing import Any
from odoo import api, models, fields


class PosCategory(models.Model):
    _inherit = 'pos.category'

    kitchen_group_id = fields.Many2one(
        'pos.kitchen.group',
        string='Kitchen Group',
        ondelete='set null',
        help="Block this category is printed under on the kitchen receipt. "
             "When empty, the category name is used as the block.",
    )

    kitchen_sequence = fields.Integer(
        string='Kitchen Sequence',
        default=10,
        help="Orders the lines of this category inside its kitchen receipt block. "
             "Lower numbers appear first."
    )

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        fields = super()._load_pos_data_fields(config)
        fields += ['kitchen_sequence', 'kitchen_group_id']
        return fields
```

`ondelete='set null'` es deliberado: borrar un grupo no debe borrar categorías, y la categoría huérfana cae al fallback por nombre de categoría, que es el comportamiento previo al módulo.

- [ ] **Step 4: Agregar el campo a las vistas de categoría**

`pos_kitchen_receipt_grouping/views/pos_category_view.xml` queda:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="pos_category_view_form_inherit_kitchen_grouping" model="ir.ui.view">
        <field name="name">pos.category.form.inherit.kitchen.grouping</field>
        <field name="model">pos.category</field>
        <field name="inherit_id" ref="point_of_sale.product_pos_category_form_view"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='name']" position="after">
                <field name="kitchen_group_id"/>
                <field name="kitchen_sequence"/>
            </xpath>
        </field>
    </record>

    <record id="pos_category_view_tree_inherit_kitchen_grouping" model="ir.ui.view">
        <field name="name">pos.category.tree.inherit.kitchen.grouping</field>
        <field name="model">pos.category</field>
        <field name="inherit_id" ref="point_of_sale.product_pos_category_tree_view"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='sequence']" position="after">
                <field name="kitchen_group_id" optional="show"/>
                <field name="kitchen_sequence" optional="show"/>
            </xpath>
        </field>
    </record>
</odoo>
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `odoo -d <db> -u pos_kitchen_receipt_grouping --test-enable --test-tags /pos_kitchen_receipt_grouping --stop-after-init`

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add pos_kitchen_receipt_grouping/models/pos_category.py pos_kitchen_receipt_grouping/views/pos_category_view.xml pos_kitchen_receipt_grouping/tests/test_kitchen_group.py
```

```bash
git commit -m "feat(pos_kitchen_receipt_grouping): kitchen_group_id en pos.category"
```

---

## Task 3: `kitchen_group_id` en `product.template`

**Files:**
- Create: `pos_kitchen_receipt_grouping/models/product_template.py`
- Create: `pos_kitchen_receipt_grouping/views/product_views.xml`
- Modify: `pos_kitchen_receipt_grouping/models/__init__.py`
- Modify: `pos_kitchen_receipt_grouping/__manifest__.py`
- Modify: `pos_kitchen_receipt_grouping/tests/test_kitchen_group.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de la clase `TestKitchenGroup`:

```python
    def test_product_kitchen_group_travels_to_the_pos(self):
        fields = self.env['product.template']._load_pos_data_fields(self.config)
        self.assertIn('kitchen_group_id', fields)

    def test_product_can_override_the_category_group(self):
        starters = self.env['pos.kitchen.group'].create({'name': 'Entradas', 'sequence': 10})
        mains = self.env['pos.kitchen.group'].create({'name': 'Principales', 'sequence': 20})
        category = self.env['pos.category'].create({
            'name': 'Minutas',
            'kitchen_group_id': mains.id,
        })
        product = self.env['product.template'].create({
            'name': 'Empanada',
            'available_in_pos': True,
            'pos_categ_ids': [(6, 0, category.ids)],
            'kitchen_group_id': starters.id,
        })
        self.assertEqual(product.kitchen_group_id, starters)
        self.assertEqual(product.pos_categ_ids.kitchen_group_id, mains)
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `odoo -d <db> -u pos_kitchen_receipt_grouping --test-enable --test-tags /pos_kitchen_receipt_grouping --stop-after-init`

Expected: FAIL con `ValueError: Invalid field 'kitchen_group_id' on model 'product.template'`.

- [ ] **Step 3: Agregar el campo**

`pos_kitchen_receipt_grouping/models/product_template.py`:

```python
from typing import Any

from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    kitchen_group_id = fields.Many2one(
        'pos.kitchen.group',
        string='Kitchen Group',
        ondelete='set null',
        help="Overrides the kitchen group of the POS category for this product only. "
             "Leave empty to follow the category.",
    )

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        fields = super()._load_pos_data_fields(config)
        fields.append('kitchen_group_id')
        return fields
```

- [ ] **Step 4: Registrar el modelo**

`pos_kitchen_receipt_grouping/models/__init__.py` queda:

```python
from . import pos_kitchen_group
from . import pos_category
from . import product_template
from . import pos_session
```

- [ ] **Step 5: Agregar el campo a la vista de producto**

`pos_kitchen_receipt_grouping/views/product_views.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="product_template_form_view_inherit_kitchen_group" model="ir.ui.view">
        <field name="name">product.template.form.inherit.kitchen.group</field>
        <field name="model">product.template</field>
        <field name="inherit_id" ref="point_of_sale.product_template_form_view"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='pos_categ_ids']" position="after">
                <field name="kitchen_group_id" groups="point_of_sale.group_pos_manager"/>
            </xpath>
        </field>
    </record>
</odoo>
```

- [ ] **Step 6: Declarar la vista en el manifest**

En `pos_kitchen_receipt_grouping/__manifest__.py`, el bloque `'data'` queda:

```python
    'data': [
        'security/ir.model.access.csv',
        'views/pos_kitchen_group_views.xml',
        'views/pos_category_view.xml',
        'views/product_views.xml',
    ],
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `odoo -d <db> -u pos_kitchen_receipt_grouping --test-enable --test-tags /pos_kitchen_receipt_grouping --stop-after-init`

Expected: PASS, 8 tests.

- [ ] **Step 8: Commit**

```bash
git add pos_kitchen_receipt_grouping/models pos_kitchen_receipt_grouping/views/product_views.xml pos_kitchen_receipt_grouping/__manifest__.py pos_kitchen_receipt_grouping/tests/test_kitchen_group.py
```

```bash
git commit -m "feat(pos_kitchen_receipt_grouping): override de grupo por producto"
```

---

## Task 4: `resolveKitchenGroup`

**Files:**
- Create: `pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js`
- Create: `pos_kitchen_receipt_grouping/static/tests/kitchen_group.test.js`
- Modify: `pos_kitchen_receipt_grouping/__manifest__.py`

- [ ] **Step 1: Registrar los assets en el manifest**

En `pos_kitchen_receipt_grouping/__manifest__.py`, el bloque `'assets'` queda:

```python
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js',
            'pos_kitchen_receipt_grouping/static/src/app/services/pos_store.js',
            'pos_kitchen_receipt_grouping/static/src/app/printer/order_change_receipt.xml',
        ],
        'web.assets_unit_tests': [
            'pos_kitchen_receipt_grouping/static/tests/**/*',
        ],
    },
```

- [ ] **Step 2: Escribir el test que falla**

`pos_kitchen_receipt_grouping/static/tests/kitchen_group.test.js`:

```js
import { describe, expect, test } from "@odoo/hoot";
import {
    FALLBACK_GROUP_INDEX,
    FALLBACK_GROUP_NAME,
    resolveKitchenGroup,
} from "@pos_kitchen_receipt_grouping/app/kitchen_group";

const STARTERS = { name: "Entradas", sequence: 10 };
const MAINS = { name: "Principales", sequence: 20 };

describe("resolveKitchenGroup", () => {
    test("uses the group of the product when it has one", () => {
        const product = {
            kitchen_group_id: STARTERS,
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, kitchen_sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Entradas", index: 10 });
    });

    test("reads the product group through product_tmpl_id when not on the variant", () => {
        const product = {
            product_tmpl_id: { kitchen_group_id: STARTERS },
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, kitchen_sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Entradas", index: 10 });
    });

    test("falls back to the group of the first POS category", () => {
        const product = {
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, kitchen_sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Principales", index: 20 });
    });

    test("falls back to the category itself when it has no group", () => {
        const product = {
            pos_categ_ids: [{ name: "Bebidas", kitchen_sequence: 40 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 40 });
    });

    test("uses the default kitchen sequence when the category has none", () => {
        const product = { pos_categ_ids: [{ name: "Bebidas" }] };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 10 });
    });

    test("keeps a group sequence of 0 instead of falling back to the default", () => {
        const product = { kitchen_group_id: { name: "Urgente", sequence: 0 } };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Urgente", index: 0 });
    });

    test("returns the fallback block when the product has no category", () => {
        expect(resolveKitchenGroup({ pos_categ_ids: [] })).toEqual({
            name: FALLBACK_GROUP_NAME,
            index: FALLBACK_GROUP_INDEX,
        });
    });

    test("returns the fallback block when there is no product at all", () => {
        expect(resolveKitchenGroup(undefined)).toEqual({
            name: FALLBACK_GROUP_NAME,
            index: FALLBACK_GROUP_INDEX,
        });
    });

    test("ignores a group record that has no name", () => {
        const product = {
            kitchen_group_id: { sequence: 3 },
            pos_categ_ids: [{ name: "Bebidas", kitchen_sequence: 40 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 40 });
    });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `odoo -d <db> --test-enable --test-tags /pos_kitchen_receipt_grouping:HootTest --stop-after-init`

Expected: FAIL — el módulo `@pos_kitchen_receipt_grouping/app/kitchen_group` no existe.

- [ ] **Step 4: Implementar**

`pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js`:

```js
/** @odoo-module **/

// Funciones puras: no importan nada del POS ni de OWL, así se testean con Hoot
// sin levantar un entorno POS.

export const FALLBACK_GROUP_NAME = "Otros";
export const FALLBACK_GROUP_INDEX = 999999;
export const DEFAULT_KITCHEN_SEQUENCE = 10;

function toIndex(value) {
    return typeof value === "number" ? value : DEFAULT_KITCHEN_SEQUENCE;
}

function asBlock(group) {
    if (!group?.name) {
        return null;
    }
    return { name: group.name, index: toIndex(group.sequence) };
}

/**
 * El campo vive en product.template; según cómo esté cargado el registro en el
 * POS puede alcanzarse directo sobre la variante o a través de product_tmpl_id.
 */
function ownGroupOf(product) {
    return product?.kitchen_group_id || product?.product_tmpl_id?.kitchen_group_id || null;
}

/**
 * Devuelve el bloque del ticket de cocina al que pertenece un producto:
 * grupo propio → grupo de la primera categoría POS → la categoría misma →
 * bloque "Otros" al final.
 *
 * @returns {{ name: string, index: number }}
 */
export function resolveKitchenGroup(product) {
    const own = asBlock(ownGroupOf(product));
    if (own) {
        return own;
    }
    const categ = product?.pos_categ_ids?.[0];
    if (!categ) {
        return { name: FALLBACK_GROUP_NAME, index: FALLBACK_GROUP_INDEX };
    }
    const fromCateg = asBlock(categ.kitchen_group_id);
    if (fromCateg) {
        return fromCateg;
    }
    return { name: categ.name, index: toIndex(categ.kitchen_sequence) };
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `odoo -d <db> --test-enable --test-tags /pos_kitchen_receipt_grouping:HootTest --stop-after-init`

Expected: PASS, 9 tests de `resolveKitchenGroup`.

- [ ] **Step 6: Commit**

```bash
git add pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js pos_kitchen_receipt_grouping/static/tests/kitchen_group.test.js pos_kitchen_receipt_grouping/__manifest__.py
```

```bash
git commit -m "feat(pos_kitchen_receipt_grouping): resolucion pura del grupo de cocina"
```

---

## Task 5: `sortChangeLines`

**Files:**
- Modify: `pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js`
- Modify: `pos_kitchen_receipt_grouping/static/tests/kitchen_group.test.js`

- [ ] **Step 1: Escribir el test que falla**

En `pos_kitchen_receipt_grouping/static/tests/kitchen_group.test.js`, agregar `sortChangeLines` al import existente:

```js
import {
    FALLBACK_GROUP_INDEX,
    FALLBACK_GROUP_NAME,
    resolveKitchenGroup,
    sortChangeLines,
} from "@pos_kitchen_receipt_grouping/app/kitchen_group";
```

Y agregar al final del archivo:

```js
describe("sortChangeLines", () => {
    const PASTAS = { name: "Pastas", kitchen_sequence: 30 };
    const BURGERS = { name: "Hamburguesas", kitchen_sequence: 10 };

    function products(map) {
        return (change) => map[change.product_id];
    }

    test("orders lines by the kitchen sequence of their category", () => {
        const changes = [
            { product_id: 1, basic_name: "Sorrentinos" },
            { product_id: 2, basic_name: "Doble cheddar" },
        ];
        const sorted = sortChangeLines(
            changes,
            products({ 1: { pos_categ_ids: [PASTAS] }, 2: { pos_categ_ids: [BURGERS] } })
        );
        expect(sorted.map((c) => c.basic_name)).toEqual(["Doble cheddar", "Sorrentinos"]);
    });

    test("orders alphabetically within the same kitchen sequence", () => {
        const changes = [
            { product_id: 1, basic_name: "Triple" },
            { product_id: 2, basic_name: "Doble cheddar" },
        ];
        const sorted = sortChangeLines(
            changes,
            products({ 1: { pos_categ_ids: [BURGERS] }, 2: { pos_categ_ids: [BURGERS] } })
        );
        expect(sorted.map((c) => c.basic_name)).toEqual(["Doble cheddar", "Triple"]);
    });

    test("is stable for lines that share the same key", () => {
        const changes = [
            { product_id: 1, basic_name: "Doble cheddar", uuid: "a" },
            { product_id: 1, basic_name: "Doble cheddar", uuid: "b" },
        ];
        const sorted = sortChangeLines(changes, products({ 1: { pos_categ_ids: [BURGERS] } }));
        expect(sorted.map((c) => c.uuid)).toEqual(["a", "b"]);
    });

    test("falls back to the line name when there is no basic_name", () => {
        const changes = [
            { product_id: 1, name: "Zapallo" },
            { product_id: 1, name: "Acelga" },
        ];
        const sorted = sortChangeLines(changes, products({ 1: { pos_categ_ids: [BURGERS] } }));
        expect(sorted.map((c) => c.name)).toEqual(["Acelga", "Zapallo"]);
    });

    test("does not crash on a line whose product is unknown", () => {
        const changes = [
            { product_id: 9, basic_name: "Fantasma" },
            { product_id: 1, basic_name: "Doble cheddar" },
        ];
        const sorted = sortChangeLines(changes, products({ 1: { pos_categ_ids: [BURGERS] } }));
        expect(sorted.map((c) => c.basic_name)).toEqual(["Doble cheddar", "Fantasma"]);
    });

    test("does not mutate the array it receives", () => {
        const changes = [
            { product_id: 1, basic_name: "Triple" },
            { product_id: 2, basic_name: "Doble cheddar" },
        ];
        sortChangeLines(
            changes,
            products({ 1: { pos_categ_ids: [BURGERS] }, 2: { pos_categ_ids: [BURGERS] } })
        );
        expect(changes.map((c) => c.basic_name)).toEqual(["Triple", "Doble cheddar"]);
    });
});
```

Sobre el caso del producto desconocido: la categoría es `undefined`, así que `kitchen_sequence` cae al default 10, el mismo que Hamburguesas; el desempate es alfabético y "Doble cheddar" va antes que "Fantasma".

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `odoo -d <db> --test-enable --test-tags /pos_kitchen_receipt_grouping:HootTest --stop-after-init`

Expected: FAIL — `sortChangeLines` no está exportada.

- [ ] **Step 3: Implementar**

Agregar al final de `pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js`:

```js
/**
 * Clave de orden de una línea dentro de su bloque: la secuencia de cocina de su
 * categoría primero, el nombre después.
 *
 * @returns {[number, string]}
 */
export function kitchenSortKey(change, product) {
    const categ = product?.pos_categ_ids?.[0];
    return [toIndex(categ?.kitchen_sequence), change?.basic_name || change?.name || ""];
}

/**
 * El core respeta el orden del array dentro de cada bloque, así que ordenar acá
 * alcanza para controlar el orden de las líneas impresas.
 *
 * @param {Array} changes
 * @param {(change: object) => object | undefined} getProduct
 * @returns {Array} copia ordenada; no muta el array recibido
 */
export function sortChangeLines(changes, getProduct) {
    return changes
        .map((change, position) => ({
            change,
            position,
            key: kitchenSortKey(change, getProduct(change)),
        }))
        .sort(
            (a, b) =>
                a.key[0] - b.key[0] ||
                a.key[1].localeCompare(b.key[1]) ||
                a.position - b.position
        )
        .map((entry) => entry.change);
}
```

El desempate por `position` hace el sort estable sin depender de la implementación del motor.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `odoo -d <db> --test-enable --test-tags /pos_kitchen_receipt_grouping:HootTest --stop-after-init`

Expected: PASS, 15 tests en total en el archivo.

- [ ] **Step 5: Commit**

```bash
git add pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js pos_kitchen_receipt_grouping/static/tests/kitchen_group.test.js
```

```bash
git commit -m "feat(pos_kitchen_receipt_grouping): orden de lineas dentro del bloque"
```

---

## Task 6: Cablear `pos_store.js`

**Files:**
- Modify: `pos_kitchen_receipt_grouping/static/src/app/services/pos_store.js`

- [ ] **Step 1: Agregar el import**

En `pos_kitchen_receipt_grouping/static/src/app/services/pos_store.js`, el bloque de imports queda:

```js
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { receiptLineGrouper } from "@point_of_sale/app/models/utils/order_change";
import { patch } from "@web/core/utils/patch";
import { resolveKitchenGroup, sortChangeLines } from "@pos_kitchen_receipt_grouping/app/kitchen_group";
```

- [ ] **Step 2: Reemplazar `getGroup`**

Borrar el bloque completo que va desde el comentario `/** * v19 extension hook: assign each order line a receipt group...` hasta el cierre de `receiptLineGrouper.getGroup = function (...) { ... };`, y reemplazarlo por:

```js
/**
 * v19 extension hook: asigna a cada línea el bloque del ticket de cocina. El
 * core agrupa por `group.name` y ordena los bloques por `group.index` (ver
 * PosStore.prepareReceiptGroupedData), así que la secuencia del grupo define el
 * orden de los bloques. La resolución vive en kitchen_group.js.
 */
receiptLineGrouper.getGroup = function (orderline) {
    const product = orderline.getProduct?.() || orderline.product_id;
    return resolveKitchenGroup(product);
};
```

- [ ] **Step 3: Ordenar las líneas antes de delegar al core**

En el mismo archivo, dentro de `prepareReceiptGroupedData`, reemplazar:

```js
            data.changes.data = processed;
```

por:

```js
            data.changes.data = sortChangeLines(processed, (change) =>
                this.models["product.product"]?.get(change.product_id)
            );
```

Y en el docstring de ese método, agregar después del bullet que habla de fusionar líneas idénticas:

```
     *  - Ordenar las líneas por la secuencia de cocina de su categoría, para
     *    controlar el orden dentro de cada bloque (el core respeta el orden del
     *    array).
```

- [ ] **Step 4: Verificar tests y carga de assets**

Run: `odoo -d <db> -u pos_kitchen_receipt_grouping --test-enable --test-tags /pos_kitchen_receipt_grouping --stop-after-init`

Expected: PASS, 8 tests Python, sin errores de carga de assets.

- [ ] **Step 5: Verificación manual en el POS**

1. Crear los grupos Entradas (10), Principales (20), Postres (30), Extras (40).
2. Asignar dos categorías distintas a Principales, con `kitchen_sequence` 10 y 20.
3. Dejar una tercera categoría **sin** grupo.
4. Abrir el POS, cargar un pedido con productos de las tres categorías y enviar a cocina.

Expected en el ticket:
- Un bloque `► PRINCIPALES` con las líneas de las dos categorías, las de `kitchen_sequence` 10 primero.
- Un bloque aparte con el **nombre de la categoría sin grupo**, ubicado según su `kitchen_sequence`.
- Ningún bloque `► OTROS` mientras todos los productos tengan categoría.
- Los combos siguen descompuestos, con el `[Combo]` al lado del hijo.

- [ ] **Step 6: Commit**

```bash
git add pos_kitchen_receipt_grouping/static/src/app/services/pos_store.js
```

```bash
git commit -m "feat(pos_kitchen_receipt_grouping): agrupar el ticket por grupo de cocina"
```

---

## Task 7: Datos por defecto, ticket y versión

**Files:**
- Create: `pos_kitchen_receipt_grouping/data/pos_kitchen_group_data.xml`
- Modify: `pos_kitchen_receipt_grouping/static/src/app/printer/order_change_receipt.xml`
- Modify: `pos_kitchen_receipt_grouping/__manifest__.py`

- [ ] **Step 1: Datos por defecto**

`pos_kitchen_receipt_grouping/data/pos_kitchen_group_data.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo noupdate="1">
    <record id="kitchen_group_starters" model="pos.kitchen.group">
        <field name="name">Entradas</field>
        <field name="sequence">10</field>
    </record>
    <record id="kitchen_group_mains" model="pos.kitchen.group">
        <field name="name">Principales</field>
        <field name="sequence">20</field>
    </record>
    <record id="kitchen_group_desserts" model="pos.kitchen.group">
        <field name="name">Postres</field>
        <field name="sequence">30</field>
    </record>
    <record id="kitchen_group_extras" model="pos.kitchen.group">
        <field name="name">Extras</field>
        <field name="sequence">40</field>
    </record>
</odoo>
```

`noupdate="1"` es deliberado: si el usuario les cambia el nombre o el orden, un upgrade no debe pisárselo.

- [ ] **Step 2: Ajustar el encabezado del bloque**

En `pos_kitchen_receipt_grouping/static/src/app/printer/order_change_receipt.xml`, en el comentario de cabecera reemplazar:

```
        - Encabezado de categoría estilo "► CATEGORÍA".
```

por:

```
        - Encabezado de bloque estilo "► GRUPO DE COCINA".
```

Y en el `xpath` que reemplaza el encabezado de grupo, subir `font-size` de `130%` a `150%`, porque ahora hay menos bloques y más largos:

```xml
        <xpath expr="//div[@t-foreach='data.changes.groupedData']/div[1]" position="replace">
            <div class="pos-receipt-title text-center mb-1"
                 style="font-size: 150%; border-bottom: 2px solid black; font-weight: bold; padding: 2px 0; letter-spacing: 0.05rem;">
                &#9658; <t t-esc="group.name"/>
            </div>
        </xpath>
```

- [ ] **Step 3: Manifest final**

`pos_kitchen_receipt_grouping/__manifest__.py` queda:

```python
{
    'name': 'POS Kitchen Receipt Grouping',
    'version': '19.0.3.0.0',
    'website': 'https://www.alpardata.com.ar',
    'category': 'Sales/Point of Sale',
    'summary': 'Group POS kitchen receipts by configurable Kitchen Groups and decompose Combos',
    'description': """
        This module groups the POS kitchen receipt by Kitchen Group, a configurable
        concept (Starters, Mains, Desserts, Extras) assigned on the POS Category and
        optionally overridden per product. Blocks are ordered by the group sequence,
        and the lines inside each block by the category's Kitchen Sequence.
        Categories without a group keep printing under their own name.
        Combos are decomposed so the sub-products are printed under their respective
        groups with a reference to the main Combo.
    """,
    'author': 'AlparData',
    'depends': ['point_of_sale', 'pos_restaurant'],
    'data': [
        'security/ir.model.access.csv',
        'data/pos_kitchen_group_data.xml',
        'views/pos_kitchen_group_views.xml',
        'views/pos_category_view.xml',
        'views/product_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js',
            'pos_kitchen_receipt_grouping/static/src/app/services/pos_store.js',
            'pos_kitchen_receipt_grouping/static/src/app/printer/order_change_receipt.xml',
        ],
        'web.assets_unit_tests': [
            'pos_kitchen_receipt_grouping/static/tests/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 4: Correr toda la suite**

Run: `odoo -d <db> -u pos_kitchen_receipt_grouping --test-enable --test-tags /pos_kitchen_receipt_grouping --stop-after-init`

Expected: PASS, 8 tests Python.

Run: `odoo -d <db> --test-enable --test-tags /pos_kitchen_receipt_grouping:HootTest --stop-after-init`

Expected: PASS, 15 tests JS.

- [ ] **Step 5: Verificar que los grupos por defecto se crearon**

Run: `odoo shell -d <db>` y ejecutar:

```python
[(g.sequence, g.name) for g in env['pos.kitchen.group'].search([])]
```

Expected: `[(10, 'Entradas'), (20, 'Principales'), (30, 'Postres'), (40, 'Extras')]`

- [ ] **Step 6: Commit**

```bash
git add pos_kitchen_receipt_grouping/data pos_kitchen_receipt_grouping/static/src/app/printer/order_change_receipt.xml pos_kitchen_receipt_grouping/__manifest__.py
```

```bash
git commit -m "feat(pos_kitchen_receipt_grouping): grupos por defecto y bump a 19.0.3.0.0"
```

---

## Fuera de alcance

- El ruteo a impresoras sigue basándose en la categoría POS (comportamiento del core). Los grupos afectan cómo se imprime, no adónde.
- No se toca `pos_restaurant_courses` ni el firing de tandas.
- El grupo no se expone en la interfaz de venta ni en el KDS.
