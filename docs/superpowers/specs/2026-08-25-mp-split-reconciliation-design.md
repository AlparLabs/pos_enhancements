# Diseño: separar la conciliación de `pos_mercado_pago_alpy`

**Fecha:** 2026-08-25
**Módulos:** `pos_mercado_pago_alpy` (modificado), `pos_mercado_pago_reconciliation` (nuevo)
**Versión Odoo:** 19.0

## Problema

`pos_mercado_pago_alpy` mezcla dos responsabilidades que tienen dueños, ritmos y
compradores distintos:

1. **Cobrar** con terminales Point Smart de Mercado Pago. Funciona bien y es estable.
2. **Conciliar**: consultar la API de Mercado Pago para traer el monto neto, las
   comisiones y la fecha de liberación de cada pago. Es reciente y todavía se está
   acomodando.

Eso genera tres costos concretos:

### El cierre del POS se frena

`pos.session.action_pos_session_closing_control()` está overrideado para llamar a
`_mp_fetch_reconciliation_info()` **antes** de que se creen los asientos de cierre.
Ese método itera **pago por pago, en serie**, con hasta dos llamadas HTTP por pago
(`/v1/payments/{id}` y, como fallback, `/v1/payments/search`). El cliente HTTP usa
`REQUEST_TIMEOUT = 10` segundos.

Una sesión con 50 pagos de Mercado Pago:

- **Camino feliz:** 50 a 100 llamadas secuenciales. A 300 ms cada una, son 15 a 30
  segundos agregados a cada cierre.
- **API degradada:** hasta 1000 segundos — dieciséis minutos de pantalla congelada.

El `try/except` que envuelve la llamada protege de que el cierre *falle*, no de que
*tarde*.

### No se puede vender por separado

La conciliación es un valor agregado que no todos los clientes necesitan, pero hoy
viene pegada al módulo de cobro. No hay forma de venderla aparte sin sacarla de ahí.

### El módulo de cobro se toca cuando cambia la contabilidad

Cada iteración de la lógica de conciliación obliga a modificar y versionar un módulo
que funciona bien y que preferiríamos dejar quieto.

## Decisiones de alcance

- **Dos módulos, dos PRs independientes.** La cirugía (PR A) se puede mergear y
  desplegar sin esperar al add-on (PR B). PR A es lo urgente: es lo que arregla la
  velocidad de cierre.
- **El add-on depende de `pos_mercado_pago_alpy`**, no al revés. Necesita el cliente
  HTTP (`MercadoPagoPosRequest`), la credencial (`mp_bearer_token`), la constante
  `MP_TERMINAL_TYPES` y los identificadores `mp_payment_id` / `mp_external_reference`.
- **Sin migración de datos.** Los pocos registros de conciliación existentes se
  descartan a propósito: se prefiere un esquema limpio a preservar datos escasos.
- **Esquema neutro desde el día uno**, aunque hoy solo exista Mercado Pago. Ver
  "Enfoques evaluados".
- **El disparo pasa a ser solo un cron.** Sin gancho en el cierre. Ver "El cron".
- **Un solo módulo nuevo, no dos.** No se crea todavía un módulo base abstracto para
  multi-procesador; la costura queda preparada pero no ejecutada.
- **LGPL-3**, como el resto del repo.

## Enfoques evaluados

Para la pregunta "¿cuánto invertir hoy en que multi-procesador salga barato mañana?":

1. **Mudanza literal.** Mover los campos `mp_*` tal cual. Ventaja: los datos
   existentes sobrevivirían solos. Descartado porque renombrar campos almacenados
   después, con clientes en producción, cuesta una migración.
2. **Nombres neutros ahora, lógica de MP.** *Elegido.* El esquema de datos —la única
   parte cara de cambiar después— se define agnóstico hoy, que cuesta escribir otra
   palabra. La lógica de fetch, que es aditiva, se generaliza cuando haga falta.
3. **Abstracción completa ya.** Módulo base más implementación. Descartado: dos
   módulos para vender, versionar y soportar con un solo procesador es sobrecosto, y
   la abstracción correcta se diseña mejor con dos casos reales a la vista.

---

# PR A — Cirugía sobre `pos_mercado_pago_alpy`

Versión `19.0.3.2` → **`19.0.4.0`**.

## Qué se quita

| Archivo | Cambio |
|---|---|
| `models/pos_session.py` | **Borrado entero.** Su única razón de existir es el override del cierre. |
| `models/__init__.py` | Quitar el import de `pos_session`. |
| `models/pos_payment.py` | Quitar los 5 campos de conciliación y `_mp_fetch_reconciliation_info`. |
| `views/pos_payment_views.xml` | Quitar las columnas de conciliación de la lista y del formulario. |
| `__manifest__.py` | Versión a `19.0.4.0`. |
| `migrations/19.0.4.0/post-migrate.py` | **Nuevo.** Red de seguridad, ver abajo. |
| `README.md` | Nota de que la conciliación se mudó al add-on. |

Los 5 campos: `mp_net_amount`, `mp_fee_amount`, `mp_release_date`, `mp_status_detail`,
`mp_info_fetched`.

Al quitar el método quedan sin uso los imports de `logging`, `timezone`,
`dateutil_parser`, `MercadoPagoPosRequest` y `MP_TERMINAL_TYPES`. `models/pos_payment.py`
queda reducido a `from odoo import fields, models` más `mp_payment_id` y
`mp_external_reference` — de unas 120 líneas a unas 20.

## Qué NO se toca

El flujo de cobro (`static/src/app/utils/payment/payment_mercado_pago.js`), el
controller de webhooks, el popup de QR, `MercadoPagoPosRequest`, `mp_bearer_token`,
`MP_TERMINAL_TYPES`, y los campos `mp_payment_id` / `mp_external_reference` — que
pertenecen al cobro, no a la conciliación: los escribe el JS mientras se cobra.

## El script de migración es una red, no el mecanismo

**Odoo 19 ya borra esas columnas solo.** La cadena verificada contra el fuente:

1. Cada campo tiene su `ir.model.data` (xmlid `field_pos_payment__mp_net_amount`,
   módulo `pos_mercado_pago_alpy`).
2. Al actualizar, `ir.model.data._process_end()`
   (`odoo/addons/base/models/ir_model.py:2633`) da de baja los xmlids del módulo que ya
   no se cargaron — su docstring: *"Clear records removed from updated module data"*.
3. Eso llega a `IrModelFields.unlink()`, que llama a `_drop_column()`
   (`ir_model.py:1004`), que ejecuta `ALTER TABLE ... DROP COLUMN ... CASCADE`.

El script se escribe igual, como defensa ante dos huecos reales: `_process_end` se
saltea entero con `import_partial`, y una base que tuvo el módulo forzado o el campo
marcado `noupdate` puede quedar con la columna colgada. Debe ser idempotente
(`DROP COLUMN IF EXISTS`) y llevar un comentario aclarando que Odoo normalmente ya
hizo el trabajo, para que nadie lo lea dentro de un año y crea que la limpieza depende
de él.

Convención tomada de `payment_pay_way/migrations/17.0.2.0.0/post-migrate.py`: carpeta
con la versión exacta del manifest, archivo `post-migrate.py`, función
`migrate(cr, version)`.

## Verificación (manual — el módulo no tiene suite)

- El módulo actualiza sin error y las 5 columnas ya no están en `pos_payment`.
- Un cierre de sesión con pagos de Mercado Pago **no dispara ninguna llamada HTTP**.
  Es la razón de ser del PR.
- El cobro por terminal sigue funcionando: `mp_payment_id` y `mp_external_reference`
  se siguen grabando.
- Las dos vistas de `pos.payment` abren sin error de campo inexistente.

No se agregan pruebas automáticas: es una remoción, y el módulo no tiene suite hoy.
Crearle una queda fuera del pedido.

---

# PR B — `pos_mercado_pago_reconciliation`

Versión `19.0.1.0.0`, `depends: ['pos_mercado_pago_alpy']`, LGPL-3.

## Estructura

```
pos_mercado_pago_reconciliation/
├── models/
│   ├── pos_payment.py               # campos neutros + orquestación genérica
│   └── pos_payment_mercado_pago.py  # el fetcher de Mercado Pago
├── data/ir_cron.xml
├── views/pos_payment_views.xml
└── tests/test_settlement.py
```

Los dos archivos de modelo heredan `pos.payment`. Esa división **es** la costura para
multi-procesador: uno no sabe nada de Mercado Pago, el otro no sabe nada de crones.

## Esquema neutro sobre `pos.payment`

| Campo | Tipo | Qué guarda |
|---|---|---|
| `settlement_net_amount` | Float | Neto acreditado por el procesador |
| `settlement_fee_amount` | Float | Comisiones totales |
| `settlement_release_date` | Datetime | Fecha de liberación del dinero |
| `settlement_status` | Char | Estado crudo del procesador (`accredited`, etc.) |
| `settlement_state` | Selection `pending` / `settled` | Lo que maneja el cron |

`settlement_state` **no tiene default**: queda vacío en todo `pos.payment`, incluidos
los que nunca van a conciliarse (efectivo, otros medios). Lo escribe el fetcher, no la
creación del pago. Un valor por defecto de `pending` marcaría como pendiente de
conciliar a toda la base de pagos del POS, que es falso y ensuciaría cualquier reporte.

### El arreglo del congelamiento

`settlement_state` reemplaza al booleano `mp_info_fetched`, y con eso se corrige un
defecto del código original: `_mp_fetch_reconciliation_info` marcaba
`mp_info_fetched = True` en cuanto **resolvía** el pago, sin mirar si el dato estaba
completo. Un pago aprobado pero todavía no acreditado quedaba grabado con neto en cero
y sin fecha de liberación, marcado como hecho, y no se reintentaba nunca.

Regla nueva: `settled` **solo** cuando hay `settlement_release_date`. Si no, se guarda
lo que haya y el registro queda en `pending`, así que el cron vuelve por él.

## La costura

Tres métodos en `models/pos_payment.py`, todos agnósticos del procesador:

- `_settlement_pending_domain()` — qué pagos barre el cron. La parte genérica es
  `settlement_state != 'settled'` más la ventana de fecha. **Es overrideable**, y el
  archivo de Mercado Pago le suma el filtro por `use_payment_terminal in
  MP_TERMINAL_TYPES` — porque "qué pagos me competen" es, inevitablemente,
  conocimiento del proveedor. Sin ese override el cron barrería todos los pagos del
  POS, incluidos los de efectivo.
- `_settlement_fetch()` — itera, delega, escribe y decide el estado
- `_settlement_fetch_values()` — **el gancho por proveedor**; devuelve un dict de
  valores o `None` si no pudo resolver

`models/pos_payment_mercado_pago.py` implementa el tercero y extiende el primero: las
llamadas a
`/v1/payments/{id}` y `/v1/payments/search`, el parseo de `fee_details` y de
`money_release_date`. Es la lógica que hoy vive en `_mp_fetch_reconciliation_info`,
movida sin cambios de fondo salvo la regla de estado.

El día que llegue un segundo procesador: `models/pos_payment.py` baja a un módulo base
y `models/pos_payment_mercado_pago.py` se queda acá, junto a su equivalente para el
procesador nuevo. Ningún campo se renombra y ningún dato se migra.

## El cron

`ir.cron` cada hora (`interval_number = 1`, `interval_type = 'hours'`), apuntando a
`pos.payment._cron_fetch_settlements()` vía `state = 'code'`.

**Sin `numbercall`.** Ese campo ya no existe en `ir.cron` en Odoo 19 — se verificó
contra `odoo/addons/base/models/ir_cron.py`, donde el modelo declara `active`,
`interval_number`, `interval_type`, `nextcall`, `priority` y `failure_count`, pero no
`numbercall`. Incluirlo daría `ParseError` al instalar. Un cron sin `numbercall` se
repite indefinidamente, que es lo que queremos.

- **Tope de 200 pagos por corrida.** Sin tope, la primera ejecución sobre una base con
  historial dispara miles de llamadas HTTP secuenciales. Con tope, se pone al día en
  varias pasadas.
- **Ventana de 30 días hacia atrás**, constante del módulo. Un pago que nunca se
  acredita no se reintenta eternamente. Como **no** se lo marca `settled`, queda en
  `pending`: buscable y contable, no perdido en silencio.
- **Commit por lote.** Un cron que hace 200 llamadas HTTP y muere en la 180 sin commit
  pierde todo el trabajo.

Nada puede escapar como excepción: error de red o pago irresoluble dejan el registro en
`pending`, se loguean, y el barrido sigue con el siguiente.

## Vistas

Las columnas de conciliación vuelven a la lista y al formulario de `pos.payment`, ahora
desde este módulo y con los nombres neutros, más `settlement_state`.

## Pruebas

Con `MercadoPagoPosRequest.call_mercado_pago` mockeado — no tocan la red:

1. Respuesta completa → campos escritos, estado `settled`.
2. Aprobado sin `money_release_date` → datos guardados, estado **sigue** `pending`.
   Es la prueba del arreglo del congelamiento.
3. Error de red → nada escrito, `pending`, sin excepción.
4. `mp_payment_id` no numérico → cae al `/search` y resuelve.
5. Pago ya `settled` → no se vuelve a consultar.
6. El dominio del cron respeta la ventana de 30 días y el estado.
7. Pago que no es de Mercado Pago → ignorado.

---

## Orden de entrega

PR A primero. No por dependencia técnica —los nombres neutros del add-on no colisionan
con los `mp_*` del módulo viejo, así que los dos PRs podrían revisarse en paralelo—
sino por una razón operativa: si alguien instalara el add-on antes de mergear A,
tendría el cron nuevo **y** el fetch en el cierre corriendo a la vez, duplicando
llamadas a la API.

Además A es lo urgente: es lo que le arregla la velocidad de cierre al cliente. El
add-on no se instala hasta dentro de varias iteraciones.
