# Diseño: módulo `pos_retail_cash_closure_reports`

**Fecha:** 2026-07-08
**Módulo:** `pos_retail_cash_closure_reports` (nuevo)
**Versión Odoo:** 19.0

## Actualización 2026-07-11: un solo PDF combinado

El cliente pidió fusionar los dos reportes en un único PDF "Cierre de Caja",
sin botones ni acciones separadas para cada parte. Este documento se
actualizó in place para reflejar esa arquitectura; las secciones de "PDF 1" /
"PDF 2" más abajo describen ahora los dos *modelos de datos* reutilizados
como partials, no dos reportes independientes con acceso propio. Ver
"Arquitectura" para el detalle del modelo combinado y el template que los
une.

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
- **Disparo desde el popup de cierre de caja** (un botón, mismo patrón que
  `pos_session_control_report`: `closing_popup_patch.js` + `.xml`,
  `this.report.doAction(...)`) **y también desde el backend**, vía el menú
  "Imprimir" del formulario de `pos.session` — igual que ya hace "Control
  Sesión", agregando `binding_model_id` a la acción de reporte. No se agrega
  ninguna vista ni botón adicional en el backend, el binding alcanza.
- **Un solo PDF combinado, sin acceso separado a cada parte** (decisión del
  2026-07-11): no hay botón ni entrada de menú para descargar solo la
  Rendición de Caja o solo Ventas x Vendedor por separado — siempre se
  descargan juntos en un único documento "Cierre de Caja".
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
- **Nombre del botón**: "Cierre de Caja", para no confundirse con el botón
  nativo "Daily Sale" ni con "Control Sesión" de `pos_session_control_report`.
  El documento resultante lleva internamente el título "Cierre de Caja" con
  las secciones "Rendición de Caja" y "Ventas x Vendedor" una debajo de la
  otra (salto de página entre ambas).

## Arquitectura

### Estructura de módulo

Sigue el mismo layout que `pos_session_control_report`:

```
pos_retail_cash_closure_reports/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── report_cash_closure.py          # datos: sección Rendición de Caja
│   ├── report_sales_by_salesperson.py  # datos: sección Ventas x Vendedor
│   └── report_cash_closure_full.py     # combina los dos dicts de arriba
├── report/
│   └── report_cash_closure_full.xml    # único ir.actions.report
├── views/
│   ├── report_cash_closure_template.xml           # partial: cuerpo Rendición de Caja
│   ├── report_sales_by_salesperson_template.xml   # partial: cuerpo Ventas x Vendedor
│   └── report_cash_closure_full_template.xml      # wrapper de página + título + t-call a ambos partials
└── static/src/app/closing_popup/
    ├── closing_popup_patch.js
    └── closing_popup_patch.xml
```

`__manifest__.py` depende de `point_of_sale` y `pos_centralized_payment`
(para que `counter_salesperson_id` exista en `pos.order`).

### Sección Rendición de Caja

**Modelo:** `report.pos_retail_cash_closure_reports.report_cash_closure`
(`AbstractModel`, mismo patrón que
`report.pos_session_control_report.report_session_control`). Ya no tiene
acción de reporte propia — su `_get_report_values` se invoca directamente
desde `report_cash_closure_full.py` (ver más abajo) y su template quedó
como partial (`cash_closure_body`), llamado por
`report_cash_closure_full_template.xml`.

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

**Layout del partial (`views/report_cash_closure_template.xml`, template id
`cash_closure_body`):** sin encabezado ni wrapper de página propios (los
provee `report_cash_closure_full_template.xml`).

1. Resumen de caja: tabla con una fila por método de pago cash — Saldo
   inicial | Esperado | Contado | Diferencia (resaltada en rojo si ≠ 0,
   mismo criterio visual que el reporte existente).
2. Detalle de movimientos: tabla Fecha/Hora | Tipo | Motivo | Monto. Si no
   hay movimientos, mensaje "Sin movimientos registrados".
3. Totales: Total ingresos, Total retiros.

### Sección Ventas x Vendedor

**Modelo:** `report.pos_retail_cash_closure_reports.report_sales_by_salesperson`.
Igual que la sección anterior, ya no tiene acción de reporte propia; su
template quedó como partial (`sales_by_salesperson_body`).

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

**Layout del partial (`views/report_sales_by_salesperson_template.xml`,
template id `sales_by_salesperson_body`):** sin encabezado ni wrapper de
página propios.

1. Por cada grupo: título con nombre del vendedor, tabla Comprobante |
   Monto (una fila por venta: factura o número de orden), luego tabla
   Medio de pago | Total con fila de subtotal del vendedor.
2. Total general de la sesión al final del documento.

### El PDF combinado: modelo y template "full"

**Modelo:** `report.pos_retail_cash_closure_reports.cash_closure_full`
(`AbstractModel`). Su `_get_report_values` simplemente invoca los dos
métodos de arriba y mergea los dicts (`docs`/`currency_id`/`formatLang` son
equivalentes en ambos; no hay colisión de claves entre `cash_payments`/
`cash_moves`/`total_cash_in`/`total_cash_out` y `groups`/`grand_total`):

```python
def _get_report_values(self, docids, data=None):
    cash_values = self.env['report.pos_retail_cash_closure_reports.report_cash_closure']._get_report_values(docids, data)
    sales_values = self.env['report.pos_retail_cash_closure_reports.sales_by_salesperson']._get_report_values(docids, data)
    return {**cash_values, **sales_values}
```

**Template:** `report_cash_closure_full_template.xml` (id `cash_closure_full`)
provee el wrapper (`web.html_container` → `t-foreach="docs"` →
`web.external_layout`) y el título "Cierre de Caja" con nombre de sesión y
apertura/cierre, y dentro llama a los dos partials en orden, con salto de
página entre ambos:

```xml
<h3>Rendición de Caja</h3>
<t t-call="pos_retail_cash_closure_reports.cash_closure_body"/>
<div style="page-break-before: always;"/>
<h3>Ventas x Vendedor</h3>
<t t-call="pos_retail_cash_closure_reports.sales_by_salesperson_body"/>
```

Los `t-call` heredan el contexto de renderizado (sesión, `cash_payments`,
`cash_moves`, `groups`, `currency_id`, `formatLang`, etc.) del template que
llama; QWeb no aísla el scope de un `t-call` salvo que se use
`t-call-context`.

**Acción de reporte:** una sola, `report/report_cash_closure_full.xml`
(`action_report_cash_closure_full`), con `binding_model_id` apuntando a
`point_of_sale.model_pos_session` para aparecer en el menú "Imprimir" del
backend.

**Nombre técnico:** se verificó que
`report_pos_retail_cash_closure_reports_cash_closure_full` (el nombre de
tabla que deriva Odoo del `_name`) tiene 56 caracteres, dentro del límite de
63 de Postgres — ver la lección de `sales_by_salesperson` más abajo.

### Integración con el popup de cierre

`static/src/app/closing_popup/closing_popup_patch.js` — mismo patrón que
`pos_session_control_report`, un solo método:

```js
patch(ClosePosPopup.prototype, {
    async downloadCashClosureReport() {
        return this.report.doAction(
            "pos_retail_cash_closure_reports.action_report_cash_closure_full",
            [this.pos.session.id]
        );
    },
});
```

`closing_popup_patch.xml` agrega un solo botón, después del botón nativo
"Daily Sale" (el xpath apunta al botón nativo de Odoo para no depender de
que `pos_session_control_report` esté presente): "Cierre de Caja".

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
- Detalle orden por orden en "Ventas x Vendedor" más allá de la referencia
  de comprobante ya agregada.
- Modificar `pos_session_control_report` o el botón nativo "Daily Sale".
- Mantener acceso independiente a cada sección por separado (decisión
  2026-07-11: siempre van juntas en el PDF combinado).

## Archivos

- `pos_retail_cash_closure_reports/__init__.py`
- `pos_retail_cash_closure_reports/__manifest__.py`
- `pos_retail_cash_closure_reports/models/__init__.py`
- `pos_retail_cash_closure_reports/models/report_cash_closure.py`
- `pos_retail_cash_closure_reports/models/report_sales_by_salesperson.py`
- `pos_retail_cash_closure_reports/models/report_cash_closure_full.py`
- `pos_retail_cash_closure_reports/report/report_cash_closure_full.xml`
- `pos_retail_cash_closure_reports/views/report_cash_closure_template.xml` (partial)
- `pos_retail_cash_closure_reports/views/report_sales_by_salesperson_template.xml` (partial)
- `pos_retail_cash_closure_reports/views/report_cash_closure_full_template.xml`
- `pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.js`
- `pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.xml`

Eliminados en la fusión del 2026-07-11 (existían como acciones de reporte
independientes):
- `pos_retail_cash_closure_reports/report/report_cash_closure.xml`
- `pos_retail_cash_closure_reports/report/report_sales_by_salesperson.xml`
