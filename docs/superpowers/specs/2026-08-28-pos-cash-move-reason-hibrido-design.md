# Diseño: `pos_cash_move_reason` como capa de UX (la contabilidad es nativa)

**Fecha:** 2026-08-28
**Módulo:** `pos_cash_move_reason` (rediseño)
**Versión Odoo:** 19.0
**Reemplaza:** las secciones de arquitectura y contabilidad de
`2026-08-25-pos-cash-move-reason-design.md`. El problema y el anexo con el
catálogo de rubros del cliente siguen vigentes en aquel documento.

## Qué cambia y por qué

El módulo original imputaba la contrapartida al crear el movimiento: cada
concepto llevaba una cuenta, y un override de
`account.bank.statement.line._prepare_move_line_default_vals` escribía el
contacto en la línea de contrapartida.

Al instalarlo en 19 falló por un dominio obsoleto (`deprecated` ya no existe en
`account.account`), y eso abrió la pregunta de fondo: **la imputación ya la
resuelve Odoo** con los modelos de conciliación, que en esta instalación ya se
usan y funcionan.

Alcance final, entonces:

- **El módulo**: botones de concepto en el popup de ingreso/retiro de efectivo,
  para estandarizar lo que escriben los locales. No escribe nada contable.
- **La contabilidad**: `account.reconcile.model` cargados a mano en el backend,
  fuera del módulo. Es territorio del contador y cambia a otro ritmo que los
  botones.

El contrato entre las dos mitades es **un prefijo en el label**:
`[PROVEEDORES] detalle libre`.

## Evidencia verificada en el fuente

Leído de `github.com/odoo/odoo` rama `19.0` el 2026-08-28:

- `account.account` **no tiene `deprecated`** en 19; lo reemplaza `active`.
  Queda una referencia muerta en `write()` (línea ~1075). Ese era el error de
  instalación.
- El label contra el que matchean las reglas es el `payment_ref` que arma
  `pos.session._prepare_account_bank_statement_line_vals`:
  `'-'.join([session.name, extras['translatedType'], reason])`. El `reason` es
  el texto del cajero, así que el prefijo del botón viaja dentro del label.
- `account.reconcile.model` tiene `match_label` (`contains` / `not_contains` /
  `match_regex`) con `match_label_param`, y `match_journal_ids` cuyo dominio
  incluye `cash`: aplica al diario del POS.
- `CashMovePopup._prepareTryCashInOutPayload`, `onClickButton`, `state.reason` e
  `isValidCashMove` existen con esas firmas. `isValidCashMove` exige
  `state.reason.trim() !== ""`, que un prefijo `[PROVEEDORES]` satisface.
- El xpath `//div[@class='form-floating']` matchea verbatim el template core.

## Arquitectura

| Archivo | Rol |
|---|---|
| `models/pos_cash_move_reason.py` | Catálogo + carga POS |
| `models/pos_session.py` | Solo `_load_pos_data_models` |
| `models/account_bank_statement_line.py` | **Eliminado** |
| `static/src/app/cash_move_popup/*` | Patch de UI, sin estado propio |
| `views/pos_cash_move_reason_views.xml` | Lista, formulario, acción, menú |

### Modelo `pos.cash.move.reason`

Campos: `name`, `code`, `sequence`, `active`, `move_type`, `config_ids`,
`company_id`. Se eliminan `account_id`, `partner_mode`, `partner_id` y el
`_check_partner_id_required`.

- **`code`** (`Char`, requerido): identificador corto y estable que viaja en el
  label. Se normaliza en `create`/`write` — mayúsculas, sin acentos, espacios a
  `_` — y un `constrains` lo restringe a `[A-Z0-9][A-Z0-9_.-]*`, lo que de paso
  rechaza los corchetes, que están reservados como delimitadores. Único por
  compañía con `models.Constraint('unique (company_id, code)', ...)`, la forma
  de 19.
- **`name`**: la etiqueta visible del botón. Se puede renombrar libremente sin
  romper ninguna regla; por eso el match usa `code` y no `name`.

**Por qué corchetes**: `contains [VARIOS]` no matchea `[VARIOS_2]`, mientras que
`contains VARIOS` sí. Sin los corchetes, un código que es prefijo de otro le
robaría los movimientos en silencio.

### Carga al POS

`_load_pos_data_domain(self, data, config)` no cambia.
`_load_pos_data_fields` devuelve `['id', 'name', 'code', 'sequence', 'move_type']`.

### Cliente POS: el patch se queda sin estado

Desaparecen `state.reasonId`, `state.counterpartPartnerId`, el override de
`setup()`, el de `_prepareTryCashInOutPayload`, y los imports de `PartnerList` y
`makeAwaitable`. El popup vuelve a mandar exactamente el payload del core.

El resaltado del botón **se deriva del texto**:

- `isReasonSelected(reason)`: `state.reason` empieza con `[CODE]`.
- `selectCashMoveReason(reason)`: antepone el código conservando el detalle ya
  escrito (regex `^\[[^\]]*\]\s*` para el prefijo anterior); si ese concepto ya
  estaba puesto, lo quita.
- `onClickButton(type)`: además del `super`, borra el prefijo si ningún concepto
  del nuevo sentido lo reclama.

Así no puede existir el estado inconsistente "botón prendido pero el label
perdió el código": el botón *es* una vista del texto.

## Configuración contable (fuera del módulo, va al README)

Una regla por concepto: `trigger=auto_reconcile`, `match_journal_ids` = diario
de efectivo del POS, `match_label=contains` con `match_label_param=[CODE]` —
corchetes incluidos —, y una línea al 100% contra la cuenta.

## Casos borde

- **Concepto sin regla**: el movimiento queda en la transitoria, que es el
  comportamiento del POS sin el módulo. No es un error.
- **El cajero borra el prefijo**: el botón se apaga solo y el movimiento queda
  en la transitoria. Degradación visible.
- **El cajero escribe el prefijo a mano**: funciona, y está bien. El label no
  tiene autoridad contable por sí mismo: la tiene la regla, que es
  configuración de administrador. El cajero ya podía escribir cualquier texto.
- **Renombrar un concepto**: no rompe nada.
- **Cambiar el `code`**: rompe la regla en silencio hasta que alguien la
  actualice. Está documentado en el README como la única operación peligrosa.

## Pruebas

Python, con `@tagged('post_install', '-at_install')`: dominio de carga por
terminal, registro del modelo en la carga POS, `code` presente en los campos
cargados, normalización en create y en write, acentos, rechazo de corchetes y
de códigos que empiezan con símbolo, unicidad por compañía y no entre
compañías, y un guard de alcance que verifica que el modelo no tenga campos
contables.

## Migración

**No hay datos que migrar**: el módulo nunca llegó a instalarse en ninguna base
— la instalación falló con el `ParseError` del dominio `deprecated`.

## Queda abierto: contacto en el retiro de efectivo

Poder elegir un contacto al pagarle a un proveedor desde el POS, para ayudar a
la contrapartida. **No está en este alcance.** Lo que ya se sabe:

- El `partner_id` de la línea de extracto que crea el POS **es el del cajero**:
  `try_cash_in_out` lo recibe desde `pos.user.partner_id`, y
  `delete_cash_in_out` lo lee como `cashier_name` para su log.
- Pisarlo con el proveedor rompería esa traza del core, así que la solución hay
  que buscarla por otro lado. Se diseña aparte.
