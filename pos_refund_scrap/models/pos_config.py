# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    refund_to_scrap = fields.Boolean(
        string='Desviar reembolsos a merma',
        default=True,
        help='Permite que los productos reembolsados en el TPV se env?en a una ubicaci?n de merma/desperdicio en lugar de retornar al inventario vendible.',
    )
    refund_scrap_mode = fields.Selection(
        [
            ('all', 'Todos los productos'),
            ('category', 'Seg?n categor?a del producto'),
        ],
        string='Criterio de merma en reembolso',
        default='category',
        help='Todos los productos: cualquier devoluci?n ir? a merma.\n'
             'Seg?n categor?a: solo los productos cuyas categor?as tengan activada la opci?n de merma ir?n a desecho.',
    )
    refund_scrap_location_id = fields.Many2one(
        'stock.location',
        string='Ubicaci?n de merma para reembolsos',
        domain="[('scrap_location', '=', True)]",
        compute='_compute_refund_scrap_location_id',
        store=True,
        readonly=False,
        help='Ubicaci?n de destino donde se registrar?n los productos desechados en los reembolsos.',
    )

    @api.depends('company_id')
    def _compute_refund_scrap_location_id(self):
        for config in self:
            if not config.refund_scrap_location_id:
                scrap_location = self.env['stock.location'].search([
                    ('scrap_location', '=', True),
                    ('company_id', 'in', [config.company_id.id, False]),
                ], limit=1)
                config.refund_scrap_location_id = scrap_location

    @api.model
    def _load_pos_data_read(self, records, config):
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['refund_to_scrap'] = config.refund_to_scrap
            read_records[0]['refund_scrap_mode'] = config.refund_scrap_mode
            read_records[0]['refund_scrap_location_id'] = config.refund_scrap_location_id.id if config.refund_scrap_location_id else False
        return read_records
