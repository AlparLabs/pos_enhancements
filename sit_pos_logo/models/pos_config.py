# -*- coding: utf-8 -*-

from odoo import models, fields, api
import base64


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # Campo para el logo personalizado de la sesión POS
    pos_custom_logo = fields.Binary(
        string='Logo del POS',
        help='Logo personalizado para esta sesión del punto de venta. '
             'Si no se especifica, se usará el logo de la empresa.'
    )
    
    pos_custom_logo_filename = fields.Char(
        string='Nombre del Logo',
        help='Nombre del archivo del logo personalizado'
    )
    
    use_custom_logo = fields.Boolean(
        string='Usar Logo Personalizado',
        default=False,
        help='Marcar para usar un logo específico para esta sesión POS'
    )
    
    pos_logo_width = fields.Integer(
        string='Ancho del Logo',
        default=150,
        help='Ancho máximo del logo en píxeles'
    )
    
    pos_logo_height = fields.Integer(
        string='Alto del Logo',
        default=50,
        help='Alto máximo del logo en píxeles'
    )

    def get_logo_url(self):
        """Retorna la URL del logo a usar para esta sesión POS"""
        self.ensure_one()
        if self.use_custom_logo and self.pos_custom_logo:
            return f'/web/image/pos.config/{self.id}/pos_custom_logo'
        elif self.company_id.logo:
            return f'/web/image/res.company/{self.company_id.id}/logo'
        else:
            return None

    def get_logo_data(self):
        """Retorna los datos del logo para el frontend"""
        self.ensure_one()
        logo_url = self.get_logo_url()
        return {
            'logo_url': logo_url,
            'logo_width': self.pos_logo_width,
            'logo_height': self.pos_logo_height,
            'company_name': self.company_id.name,
            'use_custom_logo': self.use_custom_logo,
            'has_logo': bool(logo_url),
        }