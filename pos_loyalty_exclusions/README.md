# POS Loyalty Retail Exclusions & Margin Protection

**Odoo Version:** 19.0  
**Category:** Point of Sale / Sales  
**Author:** AlparData  
**License:** LGPL-3  

---

## Descripción

Este módulo proporciona **protección de márgenes para supermercados y locales de retail** dentro del motor de Descuentos y Lealtad (`pos_loyalty` / `loyalty`).

En el rubro de supermercados existen productos con márgenes mínimos o regulados (Cigarrillos, Recargas, Tarjetas telefónicas, Precios Cuidados) o productos que ya se encuentran en promoción (3x2, folletos semanales). Este módulo asegura que las promociones globales o por porcentaje no destruyan la rentabilidad del comercio.

---

## Características Principales

1. **Exclusiones en Recompensas de Descuento (`loyalty.reward`):**
   - Selección de **Categorías Excluidas** (`excluded_product_category_ids`).
   - Selección de **Productos Excluidos** (`excluded_product_ids`).
   - El backend de Odoo pre-calcula automáticamente la jerarquía completa de subcategorías (`child_of`) y entrega una lista plana al PdV para garantizar validación instantánea `O(1)` en caja.
   - Los productos excluidos se omiten de la base imponible sobre la cual se calcula el descuento.

2. **Control de No Acumulación (`exclude_already_discounted`):**
   - Checkbox configurable por recompensa: *"Excluir productos con descuento o promoción previa"*.
   - Si una línea ya tiene un porcentaje de descuento manual o proviene de otra promoción previa, queda excluida de recibir descuentos adicionales en cascada.

3. **Exclusiones en Reglas de Compra Mínima (`loyalty.rule`):**
   - Los productos de las categorías o listas excluidas tampoco contabilizan para alcanzar el monto mínimo de compra ni la cantidad mínima de artículos.

---

## Ejemplo Práctico de Supermercado

Un cliente (dueño, empleado o socio) tiene asignado un **20% de descuento**:
- El ticket contiene:
  - Fideos / Almacén: **$10.000**
  - Galletitas (en oferta con 10% de descuento): **$4.000**
  - Atado de Cigarrillos (categoría excluida): **$5.000**
  - **Total del ticket:** **$19.000**
- **Cálculo del Descuento:**
  - Base imponible: Únicamente los **$10.000** de Almacén.
  - Descuento aplicado: **-$2.000** (20% sobre $10.000).
  - Los cigarrillos y las galletitas en oferta no sufren descuento indebido.
