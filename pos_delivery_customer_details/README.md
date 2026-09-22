# POS Delivery Customer Details (v19.0)

Este módulo permite imprimir los datos completos del cliente en **comandas de cocina** y **tickets de cierre de venta** (incluyendo tickets fiscales/factura del POS), facilitando la logística y entrega de pedidos para locales que operan con despacho a domicilio o delivery.

## Características

- **Configuración por Punto de Venta**: Checkbox configurable en cada POS desde *Punto de Venta > Configuración > Ajustes*, activando la funcionalidad de forma independiente según el canal (salón vs delivery/mostrador).
- **Datos Completos**:
  - Nombre o Razón Social
  - Dirección completa (Calle, Número, Piso y Departamento / `street` y `street2`)
  - Localidad, Provincia y Código Postal
  - Teléfono / Móvil de contacto
  - Correo electrónico
- **Comandas de Cocina (`OrderChangeReceipt`)**:
  - Bloque destacado `DATOS DE ENTREGA` para que el personal de cocina y empaquetado identifique a quién pertenece el pedido y los datos de contacto.
- **Ticket de Cierre de Venta (`OrderReceipt`)**:
  - Bloque formateado bajo el encabezado fiscal/comercial, ideal para entregar al repartidor o cliente final tanto en tickets regulares como en tickets facturados desde el POS (`pos_l10n_ar_receipt`).
- **Compatibilidad Total**:
  - Compatible con `pos_kitchen_receipt_grouping` y `pos_l10n_ar_receipt`.
  - Diseñado conforme a los estándares de **Odoo 19** (OWL 2.x, `_load_pos_data_read`, `_load_pos_data_fields`).

## Instalación y Configuración

1. Instalar el módulo `pos_delivery_customer_details`.
2. Ir a **Punto de Venta > Configuración > Ajustes** (o editar el Punto de Venta correspondiente).
3. Activar el switch **Datos de Entrega del Cliente**.
4. Abrir la sesión de POS. Al seleccionar un cliente con dirección o teléfono, los datos se imprimirán automáticamente en comandas y tickets.

---
Desarrollado y mantenido por **AlparData**.
