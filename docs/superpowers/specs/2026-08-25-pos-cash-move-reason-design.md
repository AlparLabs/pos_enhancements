# Diseño: módulo `pos_cash_move_reason`

**Fecha:** 2026-08-25
**Módulo:** `pos_cash_move_reason` (nuevo)
**Versión Odoo:** 19.0

## Problema

Cuando un cajero registra un ingreso o retiro de efectivo en el POS, escribe
el motivo como texto libre y el asiento resultante queda con su contrapartida
en la **cuenta transitoria** del diario de efectivo, esperando que alguien la
concilie después en el backend.

Eso genera dos costos:

1. **Carga manual posterior**: cada movimiento hay que imputarlo a mano en la
   conciliación bancaria.
2. **Errores de tipeo**: el motivo es texto libre, así que el mismo concepto
   se escribe de diez formas distintas y no se puede agrupar ni analizar.

La idea es agregar **botones configurables de concepto** en el popup de
ingreso/retiro de efectivo — análogos a los botones de conciliación del widget
bancario — donde cada botón lleva preconfigurada la cuenta de contrapartida y,
opcionalmente, el contacto. Al elegir un botón, el movimiento nace ya imputado.

## Decisiones de alcance

- **Etapa 1: solo el popup de ingreso/retiro de efectivo** (`CashMovePopup`).
  El popup de cierre de caja usará el mismo modelo, pero es una etapa
  posterior y queda fuera de este diseño.
- **El texto libre se conserva intacto.** Los botones son atajos: se puede
  seguir haciendo un movimiento sin elegir concepto, exactamente como hoy. No
  hay flag de "concepto obligatorio" en esta versión.
- **Imputación al nacer**, no reclasificación posterior: el asiento se crea
  directamente contra la cuenta del concepto, sin pasar por transitoria y sin
  dejar nada pendiente de conciliar.
- **La cuenta es opcional.** Un concepto sin cuenta se comporta como hoy
  (cae en transitoria) y solo aporta la etiqueta. Esto es necesario porque
  varios rubros del cliente todavía no tienen cuenta definida.
- **Sin importe en el concepto.** El monto siempre lo tipea el cajero: un
  pago a proveedores puede ser de $1.000 o de $25.000 y no hay valor por
  defecto que tenga sentido.
- **Sin distribución analítica.** El caso "abrir DELIVERY por sucursal" se
  resuelve con una cuenta por sucursal más el scoping por terminal, sin
  código adicional. Si más adelante hace falta analítica real, se agrega un
  campo de distribución en `pos.config` sin romper nada de esto.
- **Sin PIN de supervisor por botón.** Queda para una etapa posterior,
  apoyándose en el patrón de `pos_discount_supervisor`.
- **Sin agrupado por concepto en el reporte de cierre.** El campo nuevo lo
  habilita, pero vive en `pos_retail_cash_closure_reports` y le agregaría una
  dependencia que hoy no tiene.
- **Sin datos precargados.** Los códigos de cuenta son del plan contable del
  cliente; hardcodearlos ataría el módulo a una instalación. La carga inicial
  se hace por configuración (opcionalmente vía un CSV importable, entregado
  aparte del módulo).

## Ganchos del core en los que se apoya

Todo el módulo se apoya en API existente de Odoo 19. No hay monkey-patching
más allá de los overrides normales de herencia.

| Gancho | Ubicación | Para qué |
|---|---|---|
| `counterpart_account_id` en los vals de `create()` | `account/models/account_bank_statement_line.py:393` | Fuerza la cuenta de contrapartida en vez de la transitoria. El core lo saca con `vals.pop()`; no es un campo persistido. |
| `_prepare_move_line_default_vals()` | `account/models/account_bank_statement_line.py:625` | Arma las dos líneas del asiento. `vals_list[1]` es la contrapartida. |
| `pos.session._prepare_account_bank_statement_line_vals()` | `point_of_sale/models/pos_session.py:1840` | Punto de inyección de los vals del movimiento. |
| `pos.session.try_cash_in_out()` | `point_of_sale/models/pos_session.py:1851` | Recibe un dict `extras` de forma libre desde el frontend. |
| `CashMovePopup._prepareTryCashInOutPayload()` | `point_of_sale/static/src/app/components/popups/cash_move_popup/cash_move_popup.js:113` | Método pensado para override; arma el payload de la llamada. |
| `pos.load.mixin` | `point_of_sale/models/pos_load_mixin.py` | Carga del catálogo en el POS. Molde: `pos.bill`. |

**Detalle de orden crítico**: en `create()`, el core graba primero las líneas
de extracto y **recién después** llama a `_prepare_move_line_default_vals()`
sobre cada una (líneas 401-408). Por eso los campos que grabamos en la línea
de extracto ya se pueden leer desde `self` al armar las líneas del asiento.

## Arquitectura

### Modelo `pos.cash.move.reason`

Sigue el molde de `pos.bill`: catálogo chico, configurable, con M2M opcional a
terminales.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | Char, requerido | Etiqueta del botón (`PROVEEDORES`, `RETIRO_CHACRAS`) |
| `sequence` | Integer | Orden en la grilla del popup |
| `active` | Boolean, def. `True` | Archivar en vez de borrar |
| `move_type` | Selection `in`/`out`/`both`, def. `out`, requerido | En qué modo aparece |
| `account_id` | Many2one `account.account`, opcional | Vacío ⇒ transitoria del diario |
| `partner_mode` | Selection `none`/`fixed`/`ask`, def. `none`, requerido | |
| `partner_id` | Many2one `res.partner` | Requerido solo si `partner_mode = 'fixed'` |
| `config_ids` | Many2many `pos.config` | **Vacío ⇒ visible en todos los terminales** |
| `company_id` | Many2one `res.company`, requerido | Multi-compañía |

Restricciones:

- `partner_mode = 'fixed'` exige `partner_id`.
- `account_id` debe pertenecer a `company_id` (`check_company`).

Carga en el POS: hereda `pos.load.mixin`, se agrega a
`pos.session._load_pos_data_models()`, y su `_load_pos_data_domain` replica el
de `pos.bill`:

```python
['|', ('config_ids', '=', config.id), ('config_ids', '=', False)]
```

### Extensión de `account.bank.statement.line`

Dos campos nuevos:

- **`pos_cash_move_reason_id`** (Many2one, indexado, `ondelete='restrict'`):
  qué botón originó el movimiento. Es lo que distingue `SERVICIOS` de `VARIOS`
  aunque compartan cuenta, y lo que habilitará el agrupado por concepto en
  reportes futuros.
- **`pos_counterpart_partner_id`** (Many2one `res.partner`): el contacto que
  va a la línea de contrapartida. Necesario porque el `partner_id` de la
  línea de extracto ya está ocupado por el cajero (ver más abajo).

### Frontend: patch de `CashMovePopup`

Un patch de JS más una herencia de la plantilla XML. No se toca ningún otro
componente.

**Grilla de botones**, entre la fila del importe y el textarea de motivo:
botones chicos con `flex-wrap`, ordenados por `sequence`, con altura máxima y
scroll propio para que el popup no crezca sin control en pantallas de
terminal.

La grilla es **reactiva al toggle Cash In / Cash Out**: solo muestra los
conceptos cuyo `move_type` coincide con el modo activo, más los de tipo
`both`. Si había un concepto seleccionado que no aplica al nuevo modo, se
deselecciona solo.

**Al tocar un botón:**

1. Queda resaltado. Un segundo toque lo deselecciona y limpia el concepto.
2. Prellena el textarea con la etiqueta, **y el textarea sigue editable**:
   `PROVEEDORES — Distribuidora López, factura 0001-00034`. Editar el texto
   **no** deselecciona el concepto — la imputación la fija el botón, el texto
   es descripción.
3. Si `partner_mode = 'ask'`, abre el `PartnerList` que el POS ya tiene. Si el
   cajero cancela, el concepto queda seleccionado pero sin partner.
4. Si `partner_mode = 'fixed'`, toma el partner en silencio.

**Payload**: override de `_prepareTryCashInOutPayload()` para sumar dos claves
al dict `extras`, que ya viaja libre al servidor:

```javascript
extras.cash_move_reason_id     // id del concepto elegido, o null
extras.counterpart_partner_id  // partner del botón (fijo o elegido), o null
```

No cambia la firma de `try_cash_in_out` ni se pisa el `partnerId` del cajero,
que sigue siendo el quinto argumento posicional.

`isValidCashMove()` no se modifica: como el botón prellena el motivo, el
Confirmar se habilita solo.

**Ticket**: `CashMoveReceipt` imprime el campo `reason`, así que el concepto
ya sale impreso sin tocar el ticket.

### Backend: los dos overrides

**1. `pos.session._prepare_account_bank_statement_line_vals()`**

```python
vals = super()._prepare_account_bank_statement_line_vals(...)
reason = self._get_valid_cash_move_reason(extras.get('cash_move_reason_id'))
if reason:
    vals['pos_cash_move_reason_id'] = reason.id
    if reason.account_id:
        vals['counterpart_account_id'] = reason.account_id.id
    if reason.partner_mode == 'fixed':
        vals['pos_counterpart_partner_id'] = reason.partner_id.id
    elif reason.partner_mode == 'ask':
        vals['pos_counterpart_partner_id'] = extras.get('counterpart_partner_id') or False
    # partner_mode == 'none': no se graba partner de contrapartida
return vals
```

**2. `account.bank.statement.line._prepare_move_line_default_vals()`**

```python
vals_list = super()._prepare_move_line_default_vals(counterpart_account_id)
if self.pos_counterpart_partner_id:
    vals_list[1]['partner_id'] = self.pos_counterpart_partner_id.id
return vals_list
```

### Por qué el partner va solo en la línea de contrapartida

El `partner_id` de la línea de extracto **ya lo usa el core para el cajero**:
el popup manda `this.pos.user.partner_id.id` y `_prepare_account_bank_statement_line_vals`
lo graba en el movimiento (por eso `delete_cash_in_out` hace
`cashier_name = absl.partner_id.name`). Además el core copia ese partner a
**ambas** líneas del asiento.

Si el partner del concepto pisara ese campo, se perdería la trazabilidad de
quién hizo el retiro. Por eso el proveedor se escribe solo en
`vals_list[1]` (la contrapartida), que es además donde la contabilidad lo
necesita: el `partner_id` de la línea es lo que alimenta la antigüedad de
saldos, no el del asiento.

**Resultado**: línea de caja con el cajero, línea de contrapartida con el
proveedor y la cuenta del rubro. Las dos trazas conservadas.

## Validación en el servidor

`extras` viene del navegador, así que un cliente adulterado podría mandar
cualquier id y elegir cualquier cuenta contable. La regla es que el servidor
no le cree nada al cliente salvo una cosa:

- El concepto se **relee de la base** y se valida que exista, esté activo y
  sea de la compañía de la sesión. La cuenta y el `partner_mode` salen del
  registro, **nunca del payload**.
- El partner del payload se acepta **solo si `partner_mode = 'ask'`**. Con
  `fixed` se usa el configurado y se ignora el enviado; con `none` se
  descarta.

El scoping por terminal (`config_ids`) queda como **filtro de interfaz, no
como barrera de seguridad**, y a propósito: el POS cachea los datos al abrir
la sesión, así que si un encargado desvincula un concepto de un terminal con
la sesión abierta, el botón sigue dibujado. Validar contra `config_ids`
dejaría al cajero trabado a mitad de turno por un cambio de configuración.
Como todos los conceptos son cuentas legítimas cargadas por un encargado, el
riesgo real de no validarlo es nulo.

## Configuración y permisos

Menú **Punto de Venta → Configuración → Conceptos de movimiento de caja**, con
vista lista editable en línea (para cargar el catálogo de una sentada) y vista
formulario.

Permisos (`ir.model.access.csv`):

- `group_pos_user`: lectura. El POS necesita leer el catálogo para dibujar los
  botones.
- `group_pos_manager`: lectura y escritura.

El campo `account_id` en la vista filtra por `deprecated = False` y
`check_company`, para que no se pueda configurar una cuenta dada de baja.

## Casos borde

- **Concepto sin cuenta**: no se manda `counterpart_account_id` y cae en
  transitoria — idéntico a hoy. Sigue exigiendo que el diario tenga cuenta
  transitoria configurada, igual que ahora
  (`account_bank_statement_line.py:636`).
- **Cuenta dada de baja**: bloqueada desde la vista de configuración.
- **Concepto borrado**: `ondelete='restrict'` protege el histórico. Se archiva,
  no se borra.
- **Concepto desvinculado del terminal con sesión abierta**: el movimiento se
  registra igual (ver "Validación en el servidor").
- **Sin concepto elegido**: comportamiento actual, sin ninguna diferencia.

## Pruebas

Siete pruebas Python (`TransactionCase`), llamando a `try_cash_in_out` como lo
hace el POS:

1. Concepto con cuenta → contrapartida en esa cuenta, asiento posteado y
   balanceado, cero líneas en la transitoria.
2. Concepto sin cuenta → cae en transitoria.
3. `partner_mode = 'fixed'` → proveedor en la línea de contrapartida, cajero
   en la línea de extracto y en la línea de liquidez.
4. `partner_mode = 'ask'` → toma el partner del payload.
5. `partner_mode = 'none'` con un partner inyectado en el payload → lo
   descarta.
6. **Sin concepto, motivo libre → todo idéntico a hoy.** Prueba de regresión
   que protege el flujo actual.
7. `_load_pos_data_domain` → un concepto con `config_ids` vacío se carga en
   cualquier terminal; uno atado a la config A no se carga en la config B.

**No se escribe un tour JS del popup.** Los tours de POS son caros de escribir
y frágiles, y acá el frontend es un patch de UI cuya lógica de valor vive en el
servidor, que es lo que cubren estas siete pruebas. La contrapartida explícita
de esa decisión es que **el armado de la grilla y la integración con
`PartnerList` quedan verificados a mano**, no automatizados.

## Anexo: catálogo de rubros del cliente

Rubros provistos por el cliente que motivó el pedido. **No se cargan como datos
del módulo**; se documentan acá como referencia para la configuración inicial.

| Rubro | Cuenta | Observación |
|---|---|---|
| CAJA | 4.1.1.05.004 Diferencias de caja | Puede ser ingreso o retiro (`both`) |
| CAJA (Propina a revisar) | — | Sin cuenta definida |
| DELIVERY | 5.1.1.04.000 Costos delivery | El cliente pidió "revisar si es necesario abrirlo por sucursal" |
| IMPUESTOS | — | Sin cuenta definida |
| PROVEEDORES | 5.1.1.02.000 Materia prima | Imputa a gasto, no a cuenta a pagar |
| RETIRO_CHACRAS | 1.1.1.01.001 Caja General | Transferencia entre cuentas de caja |
| SERVICIOS | 5.1.2.01.030 Gastos varios producción | Comparte cuenta con VARIOS |
| SUELDO | 5.1.2.01.010 Sueldos y SAC producción | |
| VARIOS | 5.1.2.01.030 Gastos varios producción | Comparte cuenta con SERVICIOS |
| VENTAS_EN_EFECTIVO | — | Ver riesgo abajo |
| CONSUMO_INTERNO | 1.1.1.01.001 Caja General | Ver riesgo abajo |
| GIFT CARD | — | Sin cuenta definida |
| DEVOLUCIONES (Reembolso) | — | Ver riesgo abajo |

### Riesgos a resolver con el cliente antes de producción

Son cuestiones de configuración, no de código. Ninguna bloquea el desarrollo.

- **VENTAS_EN_EFECTIVO**: en el Excel del cliente tenía sentido porque el
  Excel registraba todos los movimientos de la caja física. En el POS, la
  venta en efectivo **ya entra al cajón** por el flujo de venta. Si además se
  registra como ingreso de efectivo, el efectivo esperado queda inflado y el
  cierre da diferencia todos los días. Este rubro probablemente no deba
  existir como botón.
- **DEVOLUCIONES (Reembolso)**: si un reembolso se hace como retiro de caja en
  vez de como devolución de pedido, la plata sale bien pero la venta original
  queda intacta, y las estadísticas de venta y el IVA quedan sobredeclarados.
  Debería ir por el flujo de devolución del POS.
- **CONSUMO_INTERNO → 1.1.1.01.001 (Caja General)**: por el código parece una
  cuenta de activo, igual que RETIRO_CHACRAS. Para un retiro que va
  físicamente a la caja general eso es correcto (es una transferencia), pero
  para consumo interno lo esperable es una cuenta de gasto. Se sospecha que
  quedó copiada la cuenta de la fila anterior.
