# POS Loyalty Partner / Customer Segmentation

**Odoo Version:** 19.0  
**Category:** Point of Sale / Sales  
**Author:** AlparData  
**License:** LGPL-3  

---

## Descripción

Este módulo extiende el motor de **Descuentos y Lealtad (`pos_loyalty` / `loyalty`)** para permitir segmentar reglas de promociones por **etiquetas de contacto (`res.partner.category`)** o **contactos específicos (`res.partner`)**.

### Casos de Uso:
- **Descuentos a Dueños y Familiares:** Asignar un descuento predeterminado (ej. 20% o 30%) que se active automáticamente en cualquier sucursal solo para contactos con la etiqueta *"Familia / Dueños"*.
- **Descuentos a Empleados / Staff:** Programas automáticos de beneficio a empleados del supermercado/tienda.
- **Club de Socios / Clientes VIP:** Reglas exclusivas para miembros registrados con etiquetas de fidelización.

---

## Características Principales

1. **Configuración en Backend (`loyalty.rule`):**
   - Nuevo grupo **"Clientes Elegibles"** en las reglas de lealtad.
   - Permite seleccionar una o varias etiquetas de contacto (`partner_category_ids`).
   - Permite seleccionar contactos individuales específicos (`partner_ids`).
   - Si no se especifica ningún filtro de clientes, la regla sigue aplicando a todos los clientes (100% retrocompatible).

2. **Cálculo Dinámico en Tiempo Real en el PdV:**
   - Si el ticket no tiene cliente asignado o el cliente no posee la etiqueta requerida, la regla no aplica y no otorga puntos ni recompensas.
   - Apenas el cajero asigna al cliente (por DNI, nombre, etc.), el PdV re-evalúa las reglas en el acto y agrega automáticamente la recompensa al ticket.
   - Si el cliente es deseleccionado o cambiado por otro sin la etiqueta, la recompensa se remueve automáticamente.

---

## Instalación y Configuración

1. Instalar el módulo `pos_loyalty_partner` en Odoo 19.
2. Ir a **Punto de Venta > Productos > Programas de Descuento y Lealtad**.
3. Crear o editar un programa:
   - Tipo de programa: *Promociones* o *Descuentos*.
   - Disparador: *Automático*.
   - En la pestaña **Reglas**:
     - En la sección **Clientes Elegibles**, seleccionar las etiquetas autorizadas (ej. *"Dueños y Familiares"*).
   - En la pestaña **Recompensas**:
     - Configurar el descuento deseado (ej. *20% en su pedido*).
4. Abrir la sesión de PdV: al agregar al cliente calificado, el descuento se aplicará solo.
