# Diseño: módulo `pos_retail_cash_closure_reports`

**Fecha:** 2026-07-08
**Módulo:** `pos_retail_cash_closure_reports` (nuevo)
**Versión Odoo:** 19.0

## Problema

Un cliente retail necesita, al cerrar la caja del POS, dos PDFs adicionales a
los que ya ofrece Odoo y los módulos existentes (`pos_session_control_report`
ya aporta un PDF de pagos/descuentos/efectivo/movimientos, y Odoo trae de
serie el botón "Daily Sale"):

1. **Reporte de Rendición de Caja**: detalle de los retiros e ingresos de
   efectivo hechos durante la sesión, con el resumen de saldo (esperado,
   contado, diferencia).
2. **Ventas x Vendedor**: ventas del día agrupadas por vendedor de mostrador
   (`counter_salesperson_id`, campo agregado en `pos_centralized_payment`),
   totalizando cada grupo por medio de pago.

## Decisiones de alcance

- **Módulo nuevo e independiente**: no se toca `pos_session_control_report`.
  Puede haber datos superpuestos entre ambos módulos (p. ej. movimientos de
  efectivo aparecen en los dos); no es un problema, cada cliente instala lo
  que necesita.
- **Disparo desde el popup de cierre de caja** (botones nuevos, mismo patrón
  que `pos_session_control_report`: `closing_popup_patch.js` + `.xml`,
  `this.report.doAction(...)`) **y también desde el backend**, vía el menú
  "Imprimir" del formulario de `pos.session` — igual que ya hace "Control
  Sesión", agregando `binding_model_id` a las acciones de reporte. No se
  agrega ninguna vista ni botón adicional en el backend, el binding alcanza.
- **Sin campo de responsable en los movimientos de caja**: los cash in/out de
  Odoo estándar solo graban el usuario de Odoo (`create_uid`), no el
  empleado de `pos_hr` logueado en ese momento en la terminal, ya que varios
  empleados comparten el mismo usuario Odoo bajo login por PIN. Capturar el
  empleado real requeriría una extensión de frontend (como se hizo para
  `counter_salesperson_id`), fuera de alcance de este pedido: con fecha/hora
  y punto de venta alcanza.
- **Saldo de caja: solo métodos de pago tipo cash con control de efectivo
  activado.** No se contemplan otros medios de pago en el resumen de saldo.
- **"Ventas x Vendedor" muestra, por vendedor, los comprobantes de cada venta
  y los totales por medio de pago.** Cada venta se lista con su referencia —
  el número de factura (`account_move.name`) si la orden se facturó, o el
  número de orden (`pos_reference`/`name`) si no — y su monto total.
  (Originalmente solo llevaba totales por medio de pago; el cliente pidió
  agregar el detalle de comprobantes el 2026-07-11.)
- **Fallback de vendedor**: si `counter_salesperson_id` está vacío (la orden
  no pasó por la cola de "enviar a caja"), se usa `employee_id` y si tampoco
  hay, `user_id` (el cajero que la cobró). Solo si ninguno de los tres campos
  tiene valor se agrupa bajo "Sin vendedor asignado".
- **Nombres de botones**: "Rendición de Caja" y "Ventas x Vendedor", para no
  confundirse con el botón nativo "Daily Sale" ni con "Control Sesión" de
  `pos_session_control_report`.

## Arquitectura

### Estructura de módulo

Sigue el mismo layout que `pos_session_control_report`:

```
pos_retail_cash_closure_reports/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── report_cash_closure.py       # PDF 1: Rendición de Caja
│   └── report_sales_by_salesperson.py  # PDF 2: Ventas x Vendedor
├── report/
│   ├── report_cash_closure.xml            # ir.actions.report
│   └── report_sales_by_salesperson.xml    # ir.actions.report
├── views/
│   ├── report_cash_closure_template.xml
│   └── report_sales_by_salesperson_template.xml
└── static/src/app/closing_popup/
    ├── closing_popup_patch.js
    └── closing_popup_patch.xml
```

`__manifest__.py` depende de `point_of_sale` y `pos_centralized_payment`
(para que `counter_salesperson_id` exista en `pos.order`).

### PDF 1 — Reporte de Rendición de Caja

**Modelo:** `report.pos_retail_cash_closure_reports.report_cash_closure`
(`AbstractModel`, mismo patrón que
`report.pos_session_control_report.report_session_control`).

La acción de reporte (`report/report_cash_closure.xml`) lleva
`binding_model_id` apuntando a `point_of_sale.model_pos_session`, para que
aparezca en el menú "Imprimir" del formulario de Sesión de POS en el
backend, además de poder invocarse desde el popup de cierre.

**Obtención de datos:**

- Resumen de saldo por método de pago cash: reutiliza
  `self.env['report.point_of_sale.report_saledetails'].get_sale_details(session_ids=...)`
  y de ahí toma, para cada entrada de `payments` con `payment.get('count')`
  (indica que es un método con control de efectivo): `final_count` (saldo
  esperado), `money_counted` (contado), `money_difference` (diferencia). No
  se reimplementa ese cálculo — es el mismo que ya usa
  `pos_session_control_report`.
- Saldo inicial: `session.cash_register_balance_start`.
- Detalle de movimientos: query directa —

  ```python
  moves = self.env['account.bank.statement.line'].search([
      ('pos_session_id', 'in', sessions.ids),
  ], order='date asc, id asc')
  ```

  Por cada línea: `date` (fecha/hora), `payment_ref` (motivo), `amount`.
  Tipo se infiere del signo: `amount > 0` → "Ingreso", `amount < 0` →
  "Retiro" (se muestra en valor absoluto).
- Totales: suma de montos positivos (ingresos) y suma de valores absolutos
  de montos negativos (retiros) sobre el mismo conjunto de `moves`.

**Layout del template (`report_cash_closure_template.xml`):**

1. Encabezado: nombre de sesión, punto de venta, apertura/cierre (mismo
   estilo que `report_session_control.xml`).
2. Resumen de caja: tabla con una fila por método de pago cash — Saldo
   inicial | Esperado | Contado | Diferencia (resaltada en rojo si ≠ 0,
   mismo criterio visual que el reporte existente).
3. Detalle de movimientos: tabla Fecha/Hora | Tipo | Motivo | Monto. Si no
   hay movimientos, mensaje "Sin movimientos registrados".
4. Totales: Total ingresos, Total retiros.

### PDF 2 — Ventas x Vendedor

**Modelo:** `report.pos_retail_cash_closure_reports.report_sales_by_salesperson`.

Igual que el reporte anterior, su acción
(`report/report_sales_by_salesperson.xml`) lleva `binding_model_id` a
`point_of_sale.model_pos_session` para aparecer en el menú "Imprimir" del
backend.

**Obtención de datos:**

```python
orders = self.env['pos.order'].search([
    ('session_id', 'in', sessions.ids),
    ('state', 'not in', ('draft', 'cancel')),
])
```

Agrupación en Python: por cada `order`, la clave de grupo es el primer
campo no vacío entre `counter_salesperson_id`, `employee_id`, `user_id`
(nombre + id, para no confundir homónimos); si ninguno tiene valor, la
clave es `None` → se etiqueta "Sin vendedor asignado". Dentro de cada
grupo, se recorren `order.payment_ids` y se acumula el monto por
`payment_method_id.name`.

Estructura de salida pasada al template:

```python
{
    'groups': [
        {
            'salesperson_name': 'Juan Pérez',
            'payment_totals': [{'name': 'Efectivo', 'amount': 1234.5}, ...],
            'total': 5000.0,
        },
        ...
    ],
    'grand_total': 15000.0,
}
```

**Layout del template (`report_sales_by_salesperson_template.xml`):**

1. Encabezado: sesión, punto de venta, fecha.
2. Por cada grupo: título con nombre del vendedor, tabla Comprobante |
   Monto (una fila por venta: factura o número de orden), luego tabla
   Medio de pago | Total con fila de subtotal del vendedor.
3. Total general de la sesión al final del documento.

### Integración con el popup de cierre

`static/src/app/closing_popup/closing_popup_patch.js` — mismo patrón que
`pos_session_control_report`, dos métodos nuevos:

```js
patch(ClosePosPopup.prototype, {
    async downloadCashClosureReport() {
        return this.report.doAction(
            "pos_retail_cash_closure_reports.action_report_cash_closure",
            [this.pos.session.id]
        );
    },
    async downloadSalesBySalespersonReport() {
        return this.report.doAction(
            "pos_retail_cash_closure_reports.action_report_sales_by_salesperson",
            [this.pos.session.id]
        );
    },
});
```

`closing_popup_patch.xml` agrega dos botones nuevos, después del botón
nativo "Daily Sale" (o encadenados después de "Control Sesión" si ese
módulo también está instalado — el xpath apunta al botón nativo de Odoo
para no depender de que `pos_session_control_report` esté presente):
"Rendición de Caja" y "Ventas x Vendedor".

## Casos borde

| Caso | Comportamiento |
|------|-----------------|
| Sesión sin movimientos de caja | Tabla de movimientos vacía con mensaje "Sin movimientos registrados"; totales en 0 |
| Sesión sin método de pago cash | Sección de resumen de saldo vacía |
| Orden sin `counter_salesperson_id`, `employee_id` ni `user_id` | Agrupada bajo "Sin vendedor asignado" |
| Orden con múltiples métodos de pago (pago mixto) | Cada `payment_id` se contabiliza por separado dentro del grupo del vendedor de esa orden |
| `pos_centralized_payment` no instalado | No aplica — este módulo depende de él, así que siempre está presente `counter_salesperson_id` |

## Fuera de alcance

- Capturar el empleado real (pos_hr) que hizo cada retiro/ingreso de caja.
- Cualquier vista o botón de backend más allá del binding en el menú
  "Imprimir" de `pos.session`.
- Detalle orden por orden en "Ventas x Vendedor".
- Modificar `pos_session_control_report` o el botón nativo "Daily Sale".

## Archivos afectados (todos nuevos)

- `pos_retail_cash_closure_reports/__init__.py`
- `pos_retail_cash_closure_reports/__manifest__.py`
- `pos_retail_cash_closure_reports/models/__init__.py`
- `pos_retail_cash_closure_reports/models/report_cash_closure.py`
- `pos_retail_cash_closure_reports/models/report_sales_by_salesperson.py`
- `pos_retail_cash_closure_reports/report/report_cash_closure.xml`
- `pos_retail_cash_closure_reports/report/report_sales_by_salesperson.xml`
- `pos_retail_cash_closure_reports/views/report_cash_closure_template.xml`
- `pos_retail_cash_closure_reports/views/report_sales_by_salesperson_template.xml`
- `pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.js`
- `pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.xml`
