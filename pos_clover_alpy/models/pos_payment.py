# -*- coding: utf-8 -*-
# Part of AlparLabs. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    clover_payment_id = fields.Char(
        string="Clover Payment ID",
        readonly=True,
        copy=False,
        help="Identificador único del pago en la plataforma Clover (UUID)."
    )
    clover_external_payment_id = fields.Char(
        string="Clover External ID",
        readonly=True,
        copy=False,
        help="Identificador externo de transacción generado por Odoo POS."
    )
    clover_auth_code = fields.Char(
        string="Código de Autorización",
        readonly=True,
        copy=False,
        help="Código de autorización bancaria retornado por Clover."
    )
    clover_card_brand = fields.Char(
        string="Marca de Tarjeta",
        readonly=True,
        copy=False,
        help="Marca o red de la tarjeta (ej. VISA, MASTER, AMEX, CABAL)."
    )
    clover_card_last4 = fields.Char(
        string="Últimos 4 Dígitos",
        readonly=True,
        copy=False,
        help="Últimos cuatro dígitos de la tarjeta utilizada."
    )
    clover_cardholder_name = fields.Char(
        string="Titular de Tarjeta",
        readonly=True,
        copy=False,
        help="Nombre del titular de la tarjeta."
    )
    clover_entry_type = fields.Char(
        string="Modo de Lectura",
        readonly=True,
        copy=False,
        help="Modo de captura de tarjeta (CHIP/EMV, CONTACTLESS/NFC, BANDA)."
    )
    clover_installments = fields.Integer(
        string="Cuotas",
        readonly=True,
        copy=False,
        help="Cantidad de cuotas aplicadas en la transacción."
    )
    clover_transaction_no = fields.Char(
        string="Nº de Cupón / Transacción",
        readonly=True,
        copy=False,
        help="Número de transacción / cupón fiscal devuelto por Clover."
    )
    clover_reference_id = fields.Char(
        string="Nº de Referencia / Lote",
        readonly=True,
        copy=False,
        help="Número de referencia de liquidación o lote."
    )

    def _export_for_ui(self, payment):
        res = super()._export_for_ui(payment)
        res.update({
            'clover_payment_id': payment.clover_payment_id,
            'clover_external_payment_id': payment.clover_external_payment_id,
            'clover_auth_code': payment.clover_auth_code,
            'clover_card_brand': payment.clover_card_brand,
            'clover_card_last4': payment.clover_card_last4,
            'clover_cardholder_name': payment.clover_cardholder_name,
            'clover_entry_type': payment.clover_entry_type,
            'clover_installments': payment.clover_installments,
            'clover_transaction_no': payment.clover_transaction_no,
            'clover_reference_id': payment.clover_reference_id,
        })
        return res
