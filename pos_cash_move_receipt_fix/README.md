# POS Cash Move Receipt Fix

Backport del fix upstream para el recibo de entrada/retiro de efectivo del POS.

## El problema

Con una RAZÓN larga, el bloque de datos de la empresa al pie del ticket sale
**vertical**, un carácter por línea.

No es un bug de nuestros módulos. En core 19.0 el template
`point_of_sale.CashMoveReceipt` renderiza:

```xml
<div class="pt-3">
    AMOUNT
    <span t-esc="props.formattedAmount" class="pos-receipt-right-align" />
</div>
<div>
    REASON
    <span t-esc="props.reason" class="pos-receipt-right-align" />
</div>
```

y `point_of_sale/static/src/css/pos_receipts.css` declara:

```css
.pos-receipt .pos-receipt-right-align {
    float: right;
    display: flex;
}
```

El span de la razón está flotado. Con texto largo se vuelve un float de muchas
líneas de alto, y el bloque siguiente —el pie con los datos de la empresa, un
`d-flex`— no puede solaparse con un float: se encoge al ancho horizontal
restante (≈0) y sus columnas `w-50 text-break` bajan a un carácter de ancho.

## El fix

Convertir las dos filas en flex containers, exactamente como lo hizo Odoo
upstream. Dentro de un flex container el `float` de los ítems se ignora, así que
el pie recupera su ancho completo.

El xpath apunta a cada fila **a través de su span de valor**
(`//div[span[@t-esc='props.reason']]`) porque las clases propias de los divs no
sirven para identificarlos: `pt-3` también está en el pie, y el div de REASON no
tiene clase.

## Cuándo desinstalarlo

Cuando el core en ejecución ya traiga el fix upstream, es decir cuando esas dos
filas del template de core ya tengan `d-flex justify-content-between gap-2`.
Dejarlo instalado sobre un core ya corregido no rompe nada (solo duplica clases
CSS), pero conviene sacarlo.
