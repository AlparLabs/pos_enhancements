# -*- coding: utf-8 -*-
# Part of AlparLabs. See LICENSE file for full copyright and licensing details.

import logging
from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError
from .clover_pos_request import CloverPosRequest

_logger = logging.getLogger(__name__)

CLOVER_TERMINAL_TYPE = 'clover_fiserv'


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    clover_environment = fields.Selection(
        [
            ('sandbox', 'Sandbox / Pruebas'),
            ('production', 'Producción (LATAM / Argentina)'),
        ],
        string="Ambiente Clover",
        default='sandbox',
        help="Seleccione el ambiente de Clover a utilizar.",
    )
    clover_connection_type = fields.Selection(
        [
            ('cloud', 'Cloud Pay Display (Nube - Recomendado)'),
            ('lan', 'REST Pay Display (Red Local - LAN)'),
        ],
        string="Modo de Conexión",
        default='cloud',
        help="Cloud Pay Display conecta Odoo con el terminal a través de los servidores Cloud de Clover. REST Pay Display conecta directamente vía red local.",
    )
    clover_bearer_token = fields.Char(
        string="API / Bearer Token",
        groups="point_of_sale.group_pos_manager",
        help="Token de acceso generado en el Developer Dashboard o Merchant Dashboard de Clover.",
    )
    clover_device_id = fields.Char(
        string="Serial del Terminal (Device ID)",
        help="Número de serie del dispositivo Clover (visible en Configuración -> Acerca del dispositivo o parte trasera del equipo, ej. C030UQ...).",
    )
    clover_pos_id = fields.Char(
        string="Identificador de POS (Caja)",
        default="ODOO_POS_01",
        help="Identificador alfanumérico único para esta caja en Clover (ej. CAJA_01, POS_PRINCIPAL).",
    )
    clover_lan_url = fields.Char(
        string="URL Local (LAN)",
        help="Dirección IP o Host del terminal Clover para modo LAN (ej. https://192.168.1.50:12346).",
    )
    clover_merchant_id = fields.Char(
        string="Merchant ID (Clover)",
        help="UUID de comercio asignado por Clover (13 caracteres alfanuméricos).",
    )

    # Configuración regional para Argentina
    clover_skip_invoice_screen = fields.Boolean(
        string="Saltear Pantalla de Factura",
        default=True,
        help="Si está marcado, el terminal Clover no solicitará el número de factura al cliente.",
    )
    clover_default_installments = fields.Integer(
        string="Cuotas por Defecto",
        default=1,
        help="Cantidad de cuotas por defecto para operaciones de tarjeta en Argentina (1 a 99).",
    )

    def _get_payment_terminal_selection(self):
        return super()._get_payment_terminal_selection() + [
            (CLOVER_TERMINAL_TYPE, 'Clover / Fiserv (Smart POS)'),
        ]

    @api.model
    def _load_pos_data_fields(self, config_id):
        params = super()._load_pos_data_fields(config_id)
        params += [
            'clover_environment',
            'clover_connection_type',
            'clover_device_id',
            'clover_pos_id',
            'clover_merchant_id',
            'clover_skip_invoice_screen',
            'clover_default_installments',
        ]
        return params

    def _is_clover_terminal(self):
        return self.use_payment_terminal == CLOVER_TERMINAL_TYPE

    def _get_clover_request_handler(self):
        self.ensure_one()
        return CloverPosRequest(self)

    def action_clover_ping(self):
        """Action button to test connection with Clover device from the form view."""
        self.ensure_one()
        handler = self._get_clover_request_handler()
        res = handler.ping()

        if isinstance(res, dict) and (res.get('connected') or res.get('status') == 'ok'):
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _("Conexión Exitosa"),
                    'message': _("La terminal Clover (%s) respondió correctamente y está lista.", self.clover_device_id),
                    'type': 'success',
                    'sticky': False,
                },
            }
        else:
            err_msg = res.get('message') if isinstance(res, dict) else str(res)
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _("Error de Conexión"),
                    'message': _("No se pudo conectar con la terminal Clover (%s): %s", self.clover_device_id, err_msg),
                    'type': 'danger',
                    'sticky': True,
                },
            }

    # ── RPC Methods for POS Frontend ──────────────────────────────────────────

    def clover_payment_create(self, infos):
        """
        Initiate a payment on the Clover terminal.
        :param infos: dict containing amount, currency, external_payment_id, invoice_number, etc.
        """
        self.ensure_one()
        handler = self._get_clover_request_handler()

        amount_cents = int(round(infos.get('amount', 0)))
        external_payment_id = infos.get('external_payment_id')
        currency_code = infos.get('currency_code', 'ARS')
        invoice_number = infos.get('invoice_number')

        # Configurar Regional Extras para Argentina / LATAM
        regional_extras = {
            'currency': currency_code,
            'argentina': {
                'skipInvoiceDisplay': bool(self.clover_skip_invoice_screen),
                'numInstallments': int(self.clover_default_installments or 1),
            },
        }

        if invoice_number and not self.clover_skip_invoice_screen:
            regional_extras['argentina']['invoiceNumber'] = str(invoice_number)

        if self.clover_merchant_id:
            regional_extras['argentina']['merchantId'] = self.clover_merchant_id

        _logger.info(
            "Iniciando cobro Clover | Terminal: %s | Monto: %s cents | Ref: %s",
            self.clover_device_id, amount_cents, external_payment_id
        )

        response = handler.create_payment(
            amount_cents=amount_cents,
            external_payment_id=external_payment_id,
            regional_extras=regional_extras,
            capture=True,
            is_final=True,
        )
        return response

    def clover_payment_status(self, external_payment_id):
        """
        Retrieve payment status from Clover using external payment ID.
        """
        self.ensure_one()
        handler = self._get_clover_request_handler()
        return handler.get_payment_by_external_id(external_payment_id)

    def clover_payment_cancel(self):
        """
        Cancel current transaction on the Clover terminal.
        """
        self.ensure_one()
        handler = self._get_clover_request_handler()
        return handler.cancel()

    def clover_payment_void(self, payment_id, reason='USER_CANCEL'):
        """
        Void a Clover transaction.
        """
        self.ensure_one()
        handler = self._get_clover_request_handler()
        return handler.void_payment(payment_id, reason=reason)

    def clover_payment_refund(self, payment_id, amount_cents=None):
        """
        Refund a Clover transaction.
        """
        self.ensure_one()
        handler = self._get_clover_request_handler()
        return handler.refund_payment(payment_id, amount_cents=amount_cents)
