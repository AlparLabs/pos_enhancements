# POS Product List View — Design

**Módulo:** `pos_product_list_view`
**Target:** Odoo 19 · AlparData POS Enhancement Suite
**Fecha:** 2026-08-16
**Estado:** Diseño aprobado (pendiente review del spec)

## Problema

La pantalla de productos del POS de Odoo 19 solo ofrece grilla de cards. El card
nativo renderiza **nombre, imagen, cantidad en carrito y extra de combo** — nada más
(`point_of_sale/static/src/app/components/product_card/product_card.xml`). No muestra
precio, referencia interna ni unidad de medida.

Con catálogos chicos la grilla funciona. Con cientos de SKUs visualmente parecidos —
ferretería, distribuidora, corralón — la grilla es ruido: las fotos no distinguen nada,
los nombres se truncan, y el cajero termina usando solo el buscador. El dato que
necesita para confirmar que agarró el producto correcto (la referencia) y el que
necesita para responderle al cliente (el precio) no están en pantalla.

## Alcance

**Incluye:** un modo de vista alternativo en lista para la pantalla de productos, con
columnas alineadas, activable por el cajero y con default configurable por POS.

**No incluye:**
- Columna de stock (ver "Decisión: el stock queda afuera").
- Cambios al buscador, al filtro por categoría ni a la paginación — la lista los
  hereda del core consumiendo la misma fuente de datos.
- Cualquier cambio al card nativo o a la grilla. En modo grilla el módulo es inerte.
- Odoo 18. Este módulo apunta a 19 y 20 únicamente.

## Enfoque elegido

**Patch de plantilla + componente de fila propio.** Se hereda el `ProductScreen` y se
envuelve el contenedor de productos en un `t-if` sobre el modo de vista: grilla renderiza
los cards nativos sin tocarlos, lista renderiza un componente `ProductList` propio.

Ambas ramas consumen la **misma** fuente (`pos.productToDisplayByCateg`) y llaman al
**mismo** handler (`addProductToOrder`). Por eso combos, variantes, configurador de
atributos y cualquier módulo nuestro que ya parchee ese handler siguen funcionando sin
enterarse de que la lista existe.

**Descartados:**

- **Solo CSS** (restilar los cards como filas). Resistente al churn de versiones, pero
  limitado a lo que el card ya tiene — sin precio, sin referencia, sin UdM. Alinear
  columnas entre cards independientes es frágil. Queda como plan B degradado, no como
  diseño.
- **Pantalla alternativa completa.** Clona la lógica de búsqueda, categorías y paginación,
  y obliga a reescribirla en cada versión. No se justifica.

La superficie de contacto con el core son **dos xpath** en un solo archivo
(`product_screen.xml`): el contenedor de productos y el punto de inserción del botón de
toggle. Cuando salga Odoo 20, verificar esos dos anclajes contra el fuente dice en
minutos si el módulo sigue vivo.

## Decisión: el stock queda afuera

El stock era la columna de mayor valor percibido y es la única que no es gratis.

`product.template._load_pos_data_fields` (`point_of_sale/models/product_template.py:170`)
carga `default_code`, `barcode`, `uom_id`, `list_price`, `is_storable` — pero **no**
`qty_available`. El stock solo llega por el RPC `get_product_info_pos`, uno por producto,
que es lo que alimenta el popup de información.

Se evaluó extender `_load_pos_data_fields` con `qty_available`. Se descartó: el problema
no es el peso de un campo más, es que **queda congelado al abrir la sesión**. A las cuatro
horas muestra números viejos. Un cajero que confía en una columna desactualizada está peor
que un cajero sin columna.

**El acceso al stock en modo lista es el long-press**, que abre el `ProductInfoPopup` con
existencias por almacén, precios y márgenes — el mismo camino que ya existe en la grilla.
Por eso la paridad de long-press en las filas es **requisito**, no detalle.

Si más adelante aparece demanda real, una v2 puede refrescar por categoría al vuelo con el
RPC. Ese sí sería un diseño honesto.

## Columnas

| Columna | Configurable | Default | Origen |
|---|---|---|---|
| Producto (nombre) | no | siempre | `getProductName(product)` |
| Precio | no | siempre | `productTemplate.getPrice(pricelist, 1)` + impuestos |
| Miniatura | sí | visible | `image_128` |
| Referencia interna | sí | visible | `default_code` |
| Unidad de medida | sí | oculta | `uom_id` |
| Código de barras | sí | oculta | `barcode` |

Producto y precio no son configurables: sin ellos la lista no tiene sentido.

El código de barras arranca oculto a propósito — nadie lee un código de barras con los
ojos, se escanea. Ocupa ancho y aporta poco, pero existe para quien lo necesite.

**Altura de fila ~48px**, suficiente como área táctil en tablet. La ganancia frente a la
grilla no es cantidad de ítems visibles sino legibilidad: nombres completos sin truncar y
datos alineados en columnas.

## Configuración

Cinco campos en `pos.config`, expuestos vía `res.config.settings` en la sección del POS:

| Campo | Tipo | Default |
|---|---|---|
| `product_view_default` | selection `grid` / `list` | `grid` |
| `product_list_show_image` | boolean | `True` |
| `product_list_show_ref` | boolean | `True` |
| `product_list_show_uom` | boolean | `False` |
| `product_list_show_barcode` | boolean | `False` |

**No hace falta override de `_load_pos_data_fields`.** `pos.config` no lo define, y el
mixin hace `read([])`, que en Odoo lee todos los campos. Los campos nuevos llegan al front
automáticamente.

## Modo de vista y persistencia

El servicio `view_mode` es el único dueño del estado. Al arrancar lee `localStorage`; si
no hay nada, cae al default de `pos.config`. Expone un valor reactivo y un `toggle()`.
Nadie más escribe el modo.

La persistencia es **por dispositivo**, no por usuario: en un mostrador compartido la vista
es una propiedad de esa pantalla (tamaño, si es táctil, si es vertical), no de quién esté
logueado. El default de `pos.config` es semilla para dispositivos nuevos, no candado —
el cajero siempre puede cambiar de vista.

Consecuencia útil: en un POS con varias cajas, la tablet chica puede usar lista y el monitor
grande grilla, sin tocar nada en backend.

## Estructura

```
pos_product_list_view/
├── __manifest__.py                   → 19.0.1.0.0, depends: point_of_sale
├── models/
│   ├── pos_config.py                 → los cinco campos
│   └── res_config_settings.py
├── views/res_config_settings_views.xml
└── static/
    ├── src/app/
    │   ├── services/view_mode_service.js   → estado + localStorage
    │   ├── overrides/product_screen.xml    → los dos xpath
    │   ├── product_list/                   → contenedor: encabezado + grupos
    │   ├── product_row/                    → una fila
    │   └── view_toggle/                    → botón grilla/lista
    └── tests/
```

## Comportamiento de las filas

`ProductList` replica el `t-foreach` sobre `pos.productToDisplayByCateg`, **respetando el
agrupamiento por categoría** cuando `iface_group_by_categ` está activo. No aplana los grupos.

Cada `ProductRow` lleva:

- `t-on-click` → `addProductToOrder(product)`, el mismo handler del card nativo.
- Los cuatro handlers de long-press (`mousedown` / `mouseup` / `touchstart` / `touchend`)
  → `ProductInfoPopup`. Sin esto se pierde el acceso al stock en modo lista.
- El precio vía `productTemplate.getPrice(pricelist, 1)`, pasando por la tarifa activa y por
  el cálculo de impuestos según `iface_tax_included`. **Esta es la parte con más trabajo real
  del módulo**: no es leer `list_price`.

`addProductToOrder` recibe un `product.template`, no un `product.product`
(`product_screen.js:418`). Las filas iteran templates, igual que la grilla.

## Hallazgos del core verificados

Verificados contra `odoo-19.0` el 2026-08-16. Revalidar en 20.

1. **El card nativo no muestra precio.** La columna de precio es información nueva, no una
   redisposición de lo existente.
2. **`qty_available` no está en el front.** Ver "Decisión: el stock queda afuera".
3. **`default_code`, `barcode`, `uom_id` ya están cargados.** Costo cero.
4. **Existe un modo lista vestigial en el core.** `pos_store.js:747` define un getter
   `productViewMode` que lee `this.productListView`, y `productListView` **no se asigna en
   ningún lado del core**. Está muerto, además gateado a `ui.isSmall`, y solo cambia clases
   flex del card. Odoo empezó esto y lo dejó sin terminar. No diseñamos sobre ese hook, pero
   conviene vigilarlo: pueden completarlo en 20.
5. **No hay virtualización.** El `t-on-scroll` del contenedor cancela el long-press, no carga
   productos. La paginación es el botón "Search more" con `loadNewProducts(domain, offset, 30)`.
   Consumir `pos.productToDisplayByCateg` es seguro.

## Pruebas

Tests unitarios en `web.assets_unit_tests`, siguiendo el patrón de `pos_lot_spool_picker`:

- **Servicio `view_mode`:** default desde `pos.config`; override de `localStorage` sobre el
  default; persistencia tras `toggle()`.
- **`ProductRow`:** visibilidad de cada columna según su flag; formato de precio con tarifa
  aplicada y con impuestos incluidos y excluidos.

Tour que cubre el camino crítico:

1. Cambiar a modo lista.
2. Click en una fila → la línea se agrega igual que desde la grilla.
3. Long-press en una fila → abre `ProductInfoPopup`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Churn de plantillas en Odoo 20 | Dos xpath en un solo archivo, documentados arriba. Verificación mecánica. |
| Odoo completa su propio modo lista en 20 | Vigilar `productListView`. Si lo terminan, evaluar si el módulo pasa a ser solo columnas. |
| El cálculo de precio con impuestos diverge del de la línea de pedido | Los tests comparan contra el precio que produce la orden para el mismo producto. |
