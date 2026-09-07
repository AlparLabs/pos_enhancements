# POS Loyalty Program Schedule & Validity

**Odoo Version:** 19.0  
**Category:** Point of Sale / Sales  
**Author:** AlparData  
**License:** LGPL-3  

---

## Descripción

Este módulo añade **control de vigencia temporal avanzada (días de la semana y franjas horarias)** a los programas de descuento y lealtad (`loyalty.program`) en el Punto de Venta de Odoo 19.

En el sector retail y supermercados, muchas estrategias comerciales se concentran en días específicos para estimular el tráfico o en franjas horarias concretas (Happy Hour):
- *"Martes de 15% para Jubilados"*
- *"Miércoles de Ahorro en Carnicería / Verdulería"*
- *"Jueves de Socios / Club"*
- *"Happy Hour de 19:00 a 21:00 en Panadería y Rotisería"*

---

## Características Principales

1. **Restricción por Días de la Semana (`filter_by_days`):**
   - Checkboxes individuales para cada día: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo.
   - Si la opción está desactivada, el programa aplica todos los días habitualmente.

2. **Restricción por Franja Horaria (`filter_by_hours`):**
   - Campos Hora Desde (`hour_from`) y Hora Hasta (`hour_to`) con widget nativo `float_time` (ej. 19:00 a 21:30).
   - Permite crear promociones tipo Happy Hour que se activan y desactivan automáticamente según el reloj de la terminal.

3. **Evaluación Instantánea en PdV:**
   - La terminal de caja evalúa las condiciones en tiempo real usando Luxon (`DateTime.now()`).
   - Cero latencia o llamadas remotas al servidor.

---

## Integración con la Suite Retail Loyalty

Este módulo se integra de forma transparente con:
- **`pos_loyalty_partner`:** Permite combinar día/hora con segmento de cliente (ej. *"Jueves exclusivo para Socios VIP"*).
- **`pos_loyalty_exclusions`:** Respeta la exclusión de tabaco/telefonía y la regla de no acumulación incluso durante los días de descuento especial.
