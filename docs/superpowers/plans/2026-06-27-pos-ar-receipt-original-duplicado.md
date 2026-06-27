# Copias ORIGINAL / DUPLICADO en recibo POS Argentina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un punto de venta imprima, en ventas facturadas, dos copias del recibo (ORIGINAL + DUPLICADO) de forma configurable por caja.

**Architecture:** Toda la impresión pasa por `pos.printReceipt()` (store), único chokepoint. Se agrega un Boolean en `pos.config` (expuesto al frontend y editable desde Ajustes), se patchea `printReceipt` para imprimir una segunda copia cuando corresponde, y la etiqueta ORIGINAL/DUPLICADO se controla con un estado transitorio en `order.uiState` que lee el template del encabezado.

**Tech Stack:** Odoo 19.0, Python (modelos POS), OWL/JS (patch del store), QWeb (template del recibo).

> **Nota sobre testing:** El repositorio no tiene harness de tests automatizados para estos módulos POS (no hay `tests/` ni tours). Siguiendo el patrón del repo, la verificación es **manual en el POS** (Task 6), con pasos explícitos. Cada task de código termina con un commit.

---

### Task 1: Campo de configuración en `pos.config` y exposición al frontend

**Files:**
- Create: `pos_l10n_ar_receipt/models/pos_config.py`
- Modify: `pos_l10n_ar_receipt/models/__init__.py`

- [ ] **Step 1: Crear el modelo `pos.config`**

Crear `pos_l10n_ar_receipt/models/pos_config.py` con este contenido exacto:

```python
# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    l10n_ar_receipt_print_duplicate = fields.Boolean(
        string='Print Original and Duplicate (AR)',
        default=False,
        help=(
            "When enabled, invoiced sales print two receipt copies: one labelled "
            "ORIGINAL and one labelled DUPLICADO, for internal control."
        ),
    )

    @api.model
    def _load_pos_data_read(self, records, config):
        # pos.config fields are NOT loaded via _load_pos_data_fields (the base mixin
        # returns [] and core adds fields directly in its _load_pos_data_read override).
        # We follow the same pattern used in pos_centralized_payment to avoid
        # restricting the DB read and breaking core fields.
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['l10n_ar_receipt_print_duplicate'] = config.l10n_ar_receipt_print_duplicate
        return read_records
```

- [ ] **Step 2: Registrar el import del modelo**

En `pos_l10n_ar_receipt/models/__init__.py` (actualmente contiene solo `from . import pos_order`), dejarlo así:

```python
# -*- coding: utf-8 -*-
from . import pos_config
from . import pos_order
```

- [ ] **Step 3: Verificar que el módulo actualiza sin errores**

Run: `odoo-bin -d <db> -u pos_l10n_ar_receipt --stop-after-init` (o el comando equivalente del entorno).
Expected: termina sin tracebacks; el campo `l10n_ar_receipt_print_duplicate` aparece en `pos.config`.

- [ ] **Step 4: Commit**

```bash
git add pos_l10n_ar_receipt/models/pos_config.py pos_l10n_ar_receipt/models/__init__.py
git commit -m "feat(pos_l10n_ar_receipt): add per-POS duplicate-receipt config field"
```

---

### Task 2: Exponer la opción en Ajustes → Punto de Venta

**Files:**
- Create: `pos_l10n_ar_receipt/models/res_config_settings.py`
- Create: `pos_l10n_ar_receipt/views/res_config_settings_views.xml`
- Modify: `pos_l10n_ar_receipt/models/__init__.py`
- Modify: `pos_l10n_ar_receipt/__manifest__.py`

- [ ] **Step 1: Crear el modelo `res.config.settings`**

Crear `pos_l10n_ar_receipt/models/res_config_settings.py`:

```python
# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_l10n_ar_receipt_print_duplicate = fields.Boolean(
        string='Print Original and Duplicate (AR)',
        related='pos_config_id.l10n_ar_receipt_print_duplicate',
        readonly=False,
    )
```

- [ ] **Step 2: Registrar el import**

En `pos_l10n_ar_receipt/models/__init__.py`, dejarlo así:

```python
# -*- coding: utf-8 -*-
from . import pos_config
from . import res_config_settings
from . import pos_order
```

- [ ] **Step 3: Crear la vista de settings**

Crear `pos_l10n_ar_receipt/views/res_config_settings_views.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <record id="res_config_settings_view_form_l10n_ar_receipt" model="ir.ui.view">
        <field name="name">res.config.settings.view.form.inherit.pos_l10n_ar_receipt</field>
        <field name="model">res.config.settings</field>
        <field name="inherit_id" ref="point_of_sale.res_config_settings_view_form"/>
        <field name="arch" type="xml">
            <setting id="auto_printing" position="after">
                <setting
                    id="l10n_ar_receipt_print_duplicate"
                    string="Original &amp; Duplicate (AR)"
                    help="Print invoiced sales twice: one ORIGINAL and one DUPLICADO copy for internal control.">
                    <field name="pos_l10n_ar_receipt_print_duplicate" widget="boolean_toggle"/>
                </setting>
            </setting>
        </field>
    </record>
</odoo>
```

- [ ] **Step 4: Registrar la vista en el manifest**

En `pos_l10n_ar_receipt/__manifest__.py`, cambiar la línea `'data': [],` por:

```python
    'data': [
        'views/res_config_settings_views.xml',
    ],
```

- [ ] **Step 5: Actualizar el módulo y verificar la UI**

Run: `odoo-bin -d <db> -u pos_l10n_ar_receipt --stop-after-init`
Expected: sin errores. Luego en la UI: *Ajustes → Punto de Venta → Facturas y Recibos* muestra el toggle "Original & Duplicate (AR)" debajo de "Imprimir automáticamente".

- [ ] **Step 6: Commit**

```bash
git add pos_l10n_ar_receipt/models/res_config_settings.py pos_l10n_ar_receipt/models/__init__.py pos_l10n_ar_receipt/views/res_config_settings_views.xml pos_l10n_ar_receipt/__manifest__.py
git commit -m "feat(pos_l10n_ar_receipt): expose duplicate-receipt toggle in POS settings"
```

---

### Task 3: Etiqueta dinámica ORIGINAL/DUPLICADO en el template

**Files:**
- Modify: `pos_l10n_ar_receipt/static/src/app/order_receipt.xml` (línea ~12)

- [ ] **Step 1: Reemplazar el texto fijo `ORIGINAL`**

En `pos_l10n_ar_receipt/static/src/app/order_receipt.xml`, dentro de la herencia de `point_of_sale.ReceiptHeader`, cambiar la línea:

```xml
                <t t-esc="order.l10n_ar_document_type_name"/> - ORIGINAL - COD (<t t-esc="order.l10n_ar_document_type_code"/>)
```

por:

```xml
                <t t-esc="order.l10n_ar_document_type_name"/> - <t t-esc="order.uiState.l10nArReceiptCopy or 'ORIGINAL'"/> - COD (<t t-esc="order.l10n_ar_document_type_code"/>)
```

- [ ] **Step 2: Verificar que el POS abre y el recibo sigue mostrando ORIGINAL**

Run: recargar el POS (los assets se reconstruyen al actualizar; si hace falta `-u pos_l10n_ar_receipt`).
Expected: una venta facturada imprime/preview con `... - ORIGINAL - COD (...)` igual que antes (el fallback `'ORIGINAL'` aplica porque `uiState.l10nArReceiptCopy` aún no se setea).

- [ ] **Step 3: Commit**

```bash
git add pos_l10n_ar_receipt/static/src/app/order_receipt.xml
git commit -m "feat(pos_l10n_ar_receipt): make receipt copy label dynamic (ORIGINAL fallback)"
```

---

### Task 4: Patch de `printReceipt` para imprimir el DUPLICADO

**Files:**
- Create: `pos_l10n_ar_receipt/static/src/app/pos_store_patch.js`
- Modify: `pos_l10n_ar_receipt/__manifest__.py` (assets)

- [ ] **Step 1: Crear el patch del store**

Crear `pos_l10n_ar_receipt/static/src/app/pos_store_patch.js`:

```javascript
import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

patch(PosStore.prototype, {
    /**
     * After printing the ORIGINAL receipt, print a DUPLICADO copy when:
     *  - the POS config has the option enabled,
     *  - the order is an invoice (has an AR document type),
     *  - it is not a basic receipt and not the "print bill" / pre-cuenta action.
     * The copy is printed directly via the printer (it must NOT increment
     * nb_print: it is a control copy, not a reprint).
     */
    async printReceipt(opts = {}) {
        const result = await super.printReceipt(opts);

        const { basic = false, order = this.getOrder(), printBillActionTriggered = false } = opts;

        const shouldPrintDuplicate =
            result &&
            this.config.l10n_ar_receipt_print_duplicate &&
            !basic &&
            !printBillActionTriggered &&
            Boolean(order?.l10n_ar_document_type_name);

        if (shouldPrintDuplicate) {
            order.uiState.l10nArReceiptCopy = "DUPLICADO";
            try {
                await this.printer.print(
                    OrderReceipt,
                    { order, basic_receipt: basic },
                    this.printOptions
                );
            } finally {
                order.uiState.l10nArReceiptCopy = "ORIGINAL";
            }
        }

        return result;
    },
});
```

- [ ] **Step 2: Incluir los archivos `.js` en los assets del POS**

En `pos_l10n_ar_receipt/__manifest__.py`, en `'assets'` → `'point_of_sale._assets_pos'`, agregar el glob de JS. El bloque queda:

```python
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_l10n_ar_receipt/static/src/app/**/*.js',
            'pos_l10n_ar_receipt/static/src/app/**/*.xml',
            'pos_l10n_ar_receipt/static/src/app/**/*.scss',
        ],
    },
```

- [ ] **Step 3: Actualizar el módulo**

Run: `odoo-bin -d <db> -u pos_l10n_ar_receipt --stop-after-init`
Expected: sin errores; el bundle del POS incluye `pos_store_patch.js`.

- [ ] **Step 4: Commit**

```bash
git add pos_l10n_ar_receipt/static/src/app/pos_store_patch.js pos_l10n_ar_receipt/__manifest__.py
git commit -m "feat(pos_l10n_ar_receipt): print DUPLICADO copy for invoiced sales when enabled"
```

---

### Task 5: Bump de versión del módulo

**Files:**
- Modify: `pos_l10n_ar_receipt/__manifest__.py` (version)

- [ ] **Step 1: Subir la versión**

En `pos_l10n_ar_receipt/__manifest__.py`, cambiar `'version': '19.0.1.0.0',` por `'version': '19.0.1.1.0',`.

- [ ] **Step 2: Commit**

```bash
git add pos_l10n_ar_receipt/__manifest__.py
git commit -m "chore(pos_l10n_ar_receipt): bump version to 19.0.1.1.0"
```

---

### Task 6: Verificación manual end-to-end en el POS

**Files:** ninguno (verificación).

Requisito: una caja con facturación AR configurada (l10n_ar_edi operativo) para generar facturas con CAE.

- [ ] **Step 1: Opción desactivada (regresión)**

Con el toggle "Original & Duplicate (AR)" **apagado** en la caja, hacer una venta **facturada** y cobrarla.
Expected: imprime **una** copia, encabezado `... - ORIGINAL - COD (...)`. Idéntico al comportamiento previo.

- [ ] **Step 2: Opción activada, venta facturada**

Activar el toggle en *Ajustes → Punto de Venta → Facturas y Recibos*, reabrir la sesión del POS. Hacer una venta facturada y cobrarla.
Expected: imprime **dos** copias seguidas — la primera `... - ORIGINAL - COD (...)`, la segunda `... - DUPLICADO - COD (...)`. Ambas con los mismos datos (Nº de factura, CAE, QR).

- [ ] **Step 3: Opción activada, ticket NO facturado**

Con el toggle activado, hacer una venta **sin facturar** (ticket común) y cobrarla.
Expected: imprime **una sola** copia, sin etiqueta ORIGINAL/DUPLICADO (no hay tipo de documento).

- [ ] **Step 4: Pre-cuenta / imprimir cuenta**

Con el toggle activado, usar "Imprimir cuenta" (pre-cuenta) sobre una orden.
Expected: **no** se imprime duplicado.

- [ ] **Step 5: Reimpresión manual**

Con el toggle activado, reimprimir una factura ya cobrada desde la pantalla de recibo / tickets.
Expected: vuelve a salir ORIGINAL + DUPLICADO; el contador de reimpresiones (`nb_print`) aumenta solo por la copia ORIGINAL, no por el DUPLICADO.

- [ ] **Step 6: Confirmar que no quedan errores en consola**

Expected: abrir el POS y operar no produce errores en la consola del navegador.

---

## Resumen de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `models/pos_config.py` | crear | Campo Boolean + exposición al frontend |
| `models/res_config_settings.py` | crear | Campo settings mapeado a la caja |
| `models/__init__.py` | modificar | Imports de nuevos modelos |
| `views/res_config_settings_views.xml` | crear | Toggle en Ajustes del POS |
| `static/src/app/order_receipt.xml` | modificar | Etiqueta dinámica de copia |
| `static/src/app/pos_store_patch.js` | crear | Impresión de la copia DUPLICADO |
| `__manifest__.py` | modificar | `data`, assets `*.js`, versión |
