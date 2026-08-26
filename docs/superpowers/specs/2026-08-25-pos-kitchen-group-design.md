# Grupos de cocina configurables en el ticket de cocina

- Fecha: 2026-08-25
- Módulo: `pos_kitchen_receipt_grouping`
- Versión objetivo: `19.0.3.0.0`
- Odoo: 19.0

## Problema

Hoy el ticket de cocina agrupa las líneas por categoría POS y ordena los bloques
con `pos.category.kitchen_sequence`. Las categorías POS cumplen bien su función
en la interfaz de venta, pero no son la manera en que la cocina piensa el
pedido: la cocina razona en términos de Entradas, Principales, Postres y Extras.

Hacen falta dos ejes independientes: la categoría POS para vender, y un concepto
nuevo, configurable por el usuario, para imprimir.

## Contexto verificado

- Odoo 19 no trae este concepto. `restaurant.order.course` existe en
  `pos_restaurant`, pero son tandas creadas al vuelo dentro de cada pedido
  (`index`, `fired`, `fired_date`) y no tienen relación con `pos.category` ni
  catálogo maestro.
- `pos.category` en 19 sí tiene jerarquía `parent_id` / `child_ids`, pero
  reorganizar las categorías en árbol cambiaría la navegación del POS y el
  filtrado por impresora. Se descarta.
- `pos_restaurant_courses` (este repo) define un modelo `pos.course` casi
  idéntico al que necesitamos, pero es un backport 18.0 de una feature que el
  core 19 ya trae. Acoplarse a él es acoplarse a un módulo condenado, y además
  mezcla dos semánticas: *course* es "cuándo se dispara a cocina", el grupo es
  "cómo se imprime". Se descarta; se reutiliza su patrón, no su código.

## Decisiones

| Tema | Decisión |
|---|---|
| Layout del ticket | Un solo nivel: el bloque es el grupo. La categoría POS no aparece como subtítulo. |
| Asignación | En la categoría POS, con override opcional a nivel producto. |
| `kitchen_sequence` | Se conserva. Deja de ordenar bloques y pasa a ordenar las líneas dentro del bloque. |
| Sin grupo asignado | Fallback a la categoría POS, con el comportamiento actual. |
| Sin categoría POS | Bloque "Otros" al final. |
| Módulo | Se evoluciona `pos_kitchen_receipt_grouping`. No se crea módulo nuevo ni se desinstala nada. |

El fallback a categoría hace que el upgrade sea transparente: hasta que se
asigne un grupo, el ticket sale exactamente igual que hoy. No hace falta script
de migración.

## Diseño

### Modelo `pos.kitchen.group`

Archivo nuevo `models/pos_kitchen_group.py`.

- `_name = 'pos.kitchen.group'`
- `_inherit = ['pos.load.mixin']`
- `_order = 'sequence, id'`

| Campo | Tipo | Notas |
|---|---|---|
| `name` | Char | requerido, traducible, único (constraint SQL) |
| `sequence` | Integer | default 10; ordena los bloques del ticket |
| `category_ids` | One2many → `pos.category` (`kitchen_group_id`) | permite cargar categorías desde el grupo |

- `_load_pos_data_fields` → `['id', 'name', 'sequence']`
- `_load_pos_data_domain` → `[]` (son pocos registros; no vale la pena filtrar)
- `pos_session.py`: `_load_pos_data_models` suma `'pos.kitchen.group'`
- `security/ir.model.access.csv`: lectura para `point_of_sale.group_pos_user`,
  escritura/creación/borrado para `point_of_sale.group_pos_manager`

### Asignación

- `pos.category.kitchen_group_id` — M2O a `pos.kitchen.group`, agregado a
  `pos.category._load_pos_data_fields`.
- `product.template.kitchen_group_id` — M2O opcional que pisa al de la
  categoría, agregado a `product.template._load_pos_data_fields`.
- `pos.category.kitchen_sequence` — sin cambios estructurales; solo se
  reescribe el `help` para reflejar su nuevo rol.

Al implementar hay que verificar cómo alcanza el JS un campo de
`product.template` desde un registro `product.product`, replicando exactamente
la forma en que hoy se lee `pos_categ_ids` en `pos_store.js`.

### Resolución del grupo

Archivo nuevo `static/src/app/kitchen_group.js` con funciones puras, sin
dependencias del store:

```js
resolveKitchenGroup(product) -> { name, index }
```

Cadena de resolución:

1. `product.kitchen_group_id` → `{ name: grupo.name, index: grupo.sequence }`
2. `product.pos_categ_ids[0].kitchen_group_id` → ídem
3. `product.pos_categ_ids[0]` sin grupo → `{ name: categoría.name, index: categoría.kitchen_sequence }`
4. sin categoría → `{ name: "Otros", index: 999999 }`

`receiptLineGrouper.getGroup` en `pos_store.js` queda reducido a una llamada a
esta función.

### Orden dentro del bloque

El core ordena los bloques por `group.index` y respeta el orden del array dentro
de cada bloque. Se agrega al mismo archivo:

```js
sortChangeLines(changes, getProduct) -> changes ordenadas
```

Sort por `kitchen_sequence` de la categoría, conservando el orden de carga entre
las líneas que comparten secuencia. Se aplica sobre `data.changes.data` en
`prepareReceiptGroupedData` antes de llamar a `super`.

El orden de carga se eligió por sobre un desempate alfabético: es el que la
cocina ya ve hoy, y evita que el resultado dependa del idioma del navegador de
cada terminal, como pasaría con `localeCompare`.

Ambas funciones salen de `pos_store.js` a propósito: ese archivo ya concentra
cinco responsabilidades (descomposición de combos, fusión de líneas, traducción,
datos de mesa, filtrado por impresora) y sumarle la resolución de grupos lo
empeora. Como funciones puras además se testean sin levantar el POS.

### Backoffice

- Menú *Punto de Venta → Configuración → Grupos de Cocina*, colgado de
  `point_of_sale.menu_point_config_product`. Lista editable con
  `<field name="sequence" widget="handle"/>` y formulario con pestaña de
  categorías.
- Form y lista de `pos.category`: `kitchen_group_id` junto a `kitchen_sequence`.
- Form de producto, pestaña *Punto de Venta*: `kitchen_group_id` con help que
  aclara que es una excepción al grupo de la categoría.
- `data/pos_kitchen_group_data.xml` con `noupdate="1"`: Entradas (10),
  Principales (20), Postres (30), Extras (40).

### Ticket

`order_change_receipt.xml` no cambia de estructura: el bloque ya se imprime como
`► <group.name>` y ahora ese nombre es el del grupo. Único ajuste de
presentación: subir el tamaño del encabezado de bloque, porque ahora hay menos
bloques y más largos.

## Tests

Siguiendo el patrón de `pos_product_list_view`.

`static/tests/kitchen_group.test.js` (hoot), sobre las funciones puras:

- producto con `kitchen_group_id` propio → gana sobre el de la categoría
- producto sin override, categoría con grupo → usa el grupo de la categoría
- categoría sin grupo → usa nombre y `kitchen_sequence` de la categoría
- producto sin categoría → "Otros" con index 999999
- grupo con `sequence` 0 → se respeta el 0, no se cae al default
- `sortChangeLines` es estable y no altera el orden de líneas con la misma clave

`tests/test_kitchen_group_loading.py`:

- `pos.kitchen.group` aparece en los modelos cargados por la sesión
- `kitchen_group_id` viaja al POS tanto en `pos.category` como en
  `product.template`
- el constraint de unicidad de `name` funciona

## Fuera de alcance

- El ruteo a impresoras sigue basándose en la categoría POS (core). Los grupos
  solo afectan cómo se imprime, no adónde.
- No se toca `pos_restaurant_courses` ni el firing de tandas.
- No se agrega el grupo a la interfaz de venta ni al KDS.

---

## Anexo (2026-08-26): comanda mínima

El ticket de cocina se rediseñó entero. El core imprime preset, nombre del POS,
hora, empleado, número de seguimiento y referencia del pedido; en cocina la mayor
parte de eso es papel. La comanda queda en:

```
Mozo: Juan · 20:45          78%
Mesa 12   #042              165%, negrita
────────────────────────
► PRINCIPALES              125%, negrita
 2 Doble cheddar (Sin cebolla)
     sin sal                80%, itálica
► POSTRES
 1 Flan
```

Decisiones:

- El título del cambio (`NUEVO` / `CANCELADO` / `CAMBIO DE NOTA`) se imprime solo
  cuando **no** es `NUEVO`. El ticket normal ahorra la línea; una cancelación
  sigue gritando.
- El número es el `tracking_number` (el corto, el que se canta), no el
  `pos_reference`.
- La hora va en la misma línea que el mozo, sin renglón propio.
- Cuando no hay mesa se muestra el `preset_name` en su lugar, que es lo que
  distingue un mostrador o un delivery.
- Las notas de línea y las variantes se conservan: son instrucciones de cocina,
  no ruido.

### Por qué se cortaba la línea del producto

Al imprimir, el core fuerza el recibo a **266px de ancho con fuente base de
14px** (`point_of_sale/static/src/app/screens/receipt_screen/receipt_screen.scss`).
La línea del core viene a `font-size: 150%`, o sea 21px: entran unos 15
caracteres. Encima, `point_of_sale.OrderChangeReceiptLine` arma la línea con
`div.d-flex`, y este módulo insertaba las variantes en negrita como hermanas
dentro de ese mismo flex. El `span` del nombre se comprimía y su texto caía al
renglón siguiente, dejando la cantidad sola arriba.

La comanda nueva baja la línea a `130%` y arma el renglón con flujo de texto
normal, sin flex, así el nombre envuelve debajo de sí mismo en vez de ser
empujado entero.

### Nota sobre los xpath

El div raíz de `OrderChangeReceiptLine` usa `t-attf-class`, no `class`, así que
`hasclass('orderline')` **no** lo matchea: hay que ir contra el atributo literal
con `//div[@t-attf-class]`. El de `OrderChangeReceipt` sí usa `class`, así que
`hasclass('pos-receipt')` funciona. Ambos matchean exactamente un nodo del core
19; verificado parseando el template del fuente local.

### Courses en Odoo 19

Se verificó contra `D:\Repositorios Odoo\odoo-19.0`: `restaurant.order.course`
solo tiene `order_id`, `line_ids`, `index`, `fired` y `fired_date`, y
`pos.order.line.course_id` se asigna a mano por pedido. **No hay ninguna relación
entre categorías POS y courses en el core**, ni asignación automática. El modelo
`pos.course` con `category_ids` es de `pos_restaurant_courses`, un backport 18.0
de este repo, no del core.

---

## Anexo 2 (2026-08-26): se elimina `kitchen_sequence`

El diseño original conservaba `pos.category.kitchen_sequence` para ordenar las
líneas dentro de cada bloque. Al usarlo apareció el problema: es un campo de la
categoría POS decidiendo un orden que el cocinero **no puede ver**, porque el
ticket imprime el grupo y no la categoría. Un orden invisible no se explica, y
además partía los combos — dos hijos de un mismo menú en categorías con
secuencias distintas salían separados sin motivo aparente.

El único eje de orden pasa a ser el grupo de cocina:

- La secuencia del grupo ordena los bloques.
- Dentro del bloque, las líneas salen en el orden en que el mozo las cargó.
- Lo único que se reordena es la contigüidad de los combos: los hijos se anclan
  a la posición del primero para que no se intercalen con productos sueltos.

Consecuencias:

- `kitchen_sequence` se elimina del modelo, de las vistas y de los tests.
  `migrations/19.0.3.0.0/post-migration.py` borra la columna, porque Odoo no la
  saca sola cuando desaparece el campo.
- `sortChangeLines` deja de necesitar el producto: su firma pasa de
  `(changes, getProduct)` a `(changes)`.
- El fallback de una categoría sin grupo pasa a ordenarse por el `sequence`
  propio de la categoría, que es un campo del core y ya viaja al POS.
- Se pierde la posibilidad de decir "dentro de Principales, las hamburguesas
  antes que las pastas". Es deliberado: para eso están los grupos.

Se descartó mostrar la categoría como subtítulo dentro del bloque
(`Grupo > Categoría > productos`). El objetivo de los grupos es justamente que
la categoría POS no aparezca en la comanda.
