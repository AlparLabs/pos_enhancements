# Diseño: `pos_cash_move_reason` híbrido (UX en POS, imputación nativa)

**Fecha:** 2026-08-28
**Módulo:** `pos_cash_move_reason` (rediseño)
**Versión Odoo:** 19.0
**Reemplaza:** las secciones de contabilidad de
`2026-08-25-pos-cash-move-reason-design.md`. El problema, el alcance y el
anexo con el catálogo de rubros del cliente siguen vigentes en aquel documento.

## Por qué cambia el diseño

El módulo original imputaba la contrapartida en el momento de crear el
movimiento: cada concepto llevaba una cuenta, y un override de
`account.bank.statement.line._prepare_move_line_default_vals` escribía el
contacto en la línea de contrapartida.

Al instalarlo en 19 falló por un dominio obsoleto (`deprecated` ya no existe en
`account.account`), y eso abrió la pregunta de fondo: **la mitad contable ya
existe en Odoo**, en los modelos de conciliación. Si la usamos, el módulo deja
de mantener código contable propio.

La decisión es partir el módulo en dos mitades con un contrato explícito:

- **La mitad POS (este módulo)**: botones de concepto que normalizan el texto
  del movimiento. No escribe nada contable.
- **La mitad contable (Odoo nativo)**: `account.reconcile.model` con
  `trigger=auto_reconcile` que imputa la línea según el texto.

El contrato entre las dos es **un prefijo en el label**: `[PROV] detalle libre`.

## Evidencia verificada en el fuente

Leído de `github.com/odoo/odoo` rama `19.0` el 2026-08-28:

- `account.account` **no tiene `deprecated`** en 19; lo reemplaza `active`.
  Queda una referencia muerta en `write()` (línea ~1075).
- `account.reconcile.model` en Community es **solo configuración**: `trigger`
  (`manual`/`auto_reconcile`), `match_journal_ids` (su dominio incluye `cash`,
  así que aplica al diario del POS), `match_label`
  (`contains`/`not_contains`/`match_regex`) con `match_label_param`, y
  `line_ids` con `account_id`, `partner_id` y `amount_type`. **No existe
  `_apply_rules` ni motor de matching**: el motor vive en `account_accountant`
  (Enterprise), que está instalado en la base del cliente pero cuyo fuente no
  podemos leer.
- El label contra el que matchean las reglas es el `payment_ref` que arma
  `pos.session._prepare_account_bank_statement_line_vals`:
  `'-'.join([session.name, extras['translatedType'], reason])`. El `reason` es
  el texto del cajero, así que el prefijo del botón viaja dentro del label.
- `account.move.line.reconcile_model_id` existe, y
  `account.reconcile.model.action_reconcile_stat()` lista los asientos que
  generó cada regla: la trazabilidad por concepto ya la da el nativo.
- `CashMovePopup.isValidCashMove()` exige `state.reason.trim() !== ""`, que un
  prefijo `[PROV]` satisface.

## Gate de validación (bloqueante, antes de implementar)

**No podemos verificar contra el fuente cuándo dispara el auto-reconcile**,
porque ese motor es Enterprise. Si solo corre al abrir el widget de
conciliación y no por cron, el dinero se queda en la cuenta transitoria hasta
que alguien entre a Contabilidad — peor que el módulo original, que imputaba en
el acto.

Prueba manual en `pruebas02` antes de escribir código:

1. Crear un `account.reconcile.model` a mano: `trigger=auto_reconcile`,
   `match_journal_ids` = diario de efectivo del POS, `match_label=contains`,
   `match_label_param=[PRUEBA]`, una `line_ids` al 100% contra una cuenta de
   gasto cualquiera.
2. Desde el POS, hacer un retiro de efectivo con motivo `[PRUEBA] test`.
3. Mirar el asiento: ¿la contrapartida quedó en la cuenta de la regla o en la
   transitoria? Si quedó en la transitoria, ¿en cuánto tiempo se imputa sola,
   o hace falta abrir el widget?

**Criterio de aceptación**: la imputación tiene que quedar hecha sin que nadie
abra el widget de conciliación, y antes del cierre de la sesión de caja del día.
Si no lo cumple, **este diseño se descarta** y se vuelve al módulo original con el fix del dominio.

## Arquitectura

El módulo queda como catálogo, carga POS y patch de UI, sin ningún
override contable:

| Archivo | Rol después del rediseño |
|---|---|
| `models/pos_cash_move_reason.py` | Catálogo + carga POS + computado de regla asociada |
| `models/pos_session.py` | Solo `_load_pos_data_models` |
| `models/account_bank_statement_line.py` | **Se elimina** |
| `static/src/app/cash_move_popup/*` | Patch de UI, sin estado propio |
| `views/pos_cash_move_reason_views.xml` | Lista, formulario, acción, menú |

### Modelo `pos.cash.move.reason`

Campos finales: `code`, `name`, `sequence`, `active`, `move_type`,
`config_ids`, `company_id`, más dos derivados.

- **`code`** (`Char`, requerido): identificador corto y estable que viaja en el
  label. Se normaliza en `create`/`write` a mayúsculas, sin espacios (se
  reemplazan por `_`) y sin acentos. Un `constrains` rechaza `[` y `]` porque
  romperían el prefijo. Restricción única por compañía:
  `models.Constraint('unique (company_id, code)', ...)` — la forma de 19, no
  `_sql_constraints`.
- **`name`**: sigue siendo la etiqueta visible del botón. Puede renombrarse sin
  romper ninguna regla, que es justamente por qué el match usa `code`.
- **`expects_reconcile_model`** (`Boolean`, default `True`): destildarlo para
  los conceptos que a propósito quedan en la transitoria. Sale del catálogo del
  cliente, donde IMPUESTOS, GIFT CARD y CAJA (Propina) no tienen cuenta
  definida; sin este campo el indicador de huérfano los marcaría a todos.
- **`reconcile_model_ids`** (`Many2many` a `account.reconcile.model`,
  **computado y no almacenado**) y **`has_reconcile_model`** (`Boolean`
  computado): el indicador de huérfano. El compute resuelve **en batch** — una
  sola búsqueda de modelos activos de las compañías involucradas, y el matcheo
  del código contra `match_label_param` en Python. Se muestra como badge en la
  lista y smart button en el formulario.

Se eliminan `account_id`, `partner_mode`, `partner_id` y el
`_check_partner_id_required`.

**Límite honesto del indicador**: para `match_label='match_regex'` no evaluamos
el regex; contamos el modelo si su `match_label_param` menciona el código. El
badge afirma "existe una regla que menciona este código", no "la regla
funciona". El texto de ayuda lo dice así.

### Carga al POS

`_load_pos_data_domain(self, data, config)` no cambia. `_load_pos_data_fields`
pasa a `['id', 'name', 'code', 'sequence', 'move_type']`.

### Cliente POS: el patch se queda sin estado

Hoy el patch mantiene `state.reasonId` y `state.counterpartPartnerId`. Los dos
desaparecen, y con ellos el override de `setup()`, el de
`_prepareTryCashInOutPayload`, el import de `PartnerList` y el de
`makeAwaitable`. El popup vuelve a mandar exactamente el payload del core.

El resaltado del botón **se deriva del texto**, no de un estado paralelo:

- `isReasonSelected(reason)`: `state.reason` empieza con `[CODE]`.
- `selectCashMoveReason(reason)`: reemplaza el prefijo existente (regex
  `^\[[^\]]*\]\s*`) conservando el detalle ya escrito; si el prefijo actual ya
  es el de ese concepto, lo quita.
- `onClickButton(type)`: además del `super`, borra el prefijo si el concepto al
  que corresponde no aplica al nuevo sentido.

Así no puede existir el estado inconsistente "botón prendido pero el label
perdió el código": el botón *es* una vista del texto.

## Configuración del contador (va al README)

Por cada concepto con cuenta, un `account.reconcile.model`:

| Campo | Valor |
|---|---|
| `trigger` | Automatizado (`auto_reconcile`) |
| `match_journal_ids` | Diario de efectivo del POS |
| `match_label` | Contiene |
| `match_label_param` | `[CODE]`, con los corchetes |
| `line_ids` | Una línea: la cuenta, `amount_type=percentage`, 100 |
| `line_ids[0].partner_id` | Opcional, si el contacto es siempre el mismo |

Dos conceptos pueden apuntar a la misma cuenta (en el catálogo del cliente,
SERVICIOS y VARIOS comparten `5.1.2.01.030`): son dos reglas distintas con el
mismo `account_id`, y `action_reconcile_stat` las distingue igual.

## Casos borde

- **Concepto sin regla**: el movimiento queda en la transitoria, que es
  exactamente el comportamiento del POS sin el módulo. No es un error; el badge
  lo marca salvo que `expects_reconcile_model` esté destildado.
- **Cajero borra el prefijo**: el botón se apaga solo (el resaltado se deriva
  del texto) y el movimiento queda en la transitoria. Degradación visible.
- **Cajero escribe el prefijo a mano**: funciona, y está bien que funcione. El
  label no tiene autoridad contable por sí mismo: la tiene la regla, que es
  configuración de administrador. El mismo cajero ya podía escribir cualquier
  texto libre antes.
- **Renombrar un concepto**: no rompe nada, el match usa `code`.
- **Cambiar el `code` de un concepto**: rompe la regla en silencio. El badge
  pasa a "sin regla" al instante, que es la señal.
- **Concepto de otra compañía**: el compute filtra los modelos por
  `company_id`; el `unique` es por compañía.

## Pruebas

Python, con `@tagged('post_install', '-at_install')`:

- `_load_pos_data_domain` devuelve el dominio esperado (config propia + sin
  config).
- `_load_pos_data_fields` incluye `code` y no incluye nada contable.
- `_load_pos_data_models` agrega el modelo.
- Normalización del `code`: minúsculas y espacios entran, sale
  `MAYUSCULAS_CON_GUION`.
- `constrains` rechaza corchetes; el `unique` rechaza el duplicado por
  compañía y lo permite entre compañías distintas.
- El computado encuentra la regla por `match_label_param`, la ignora si está
  archivada o es de otra compañía, y respeta `expects_reconcile_model`.

Se borran los tests de imputación de cuenta y de contacto.

## Migración

**No hay datos que migrar**: el módulo nunca llegó a instalarse en ninguna
base — la instalación falló con el `ParseError` del dominio `deprecated`.

## Riesgos aceptados

1. **Latencia de la imputación** (el gate de arriba). Es el riesgo principal.
2. **Configuración partida en dos apps**: el gerente de POS crea el concepto,
   pero la cuenta la define el contador en Contabilidad. El badge de huérfano
   es lo que evita que se desincronicen en silencio.
3. **El contrato es un string**. Mitigado por el `code` estable, la
   normalización y el resaltado derivado del texto, pero sigue siendo un
   string.
4. **Se pierde el contacto por movimiento**: el contacto de la línea final sale
   de la regla, que es fijo. Un contacto variable requiere partner mapping
   nativo (una regla por proveedor), que no escala. Si el cliente lo pide,
   vuelve a discutirse como cambio de alcance.
