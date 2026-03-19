# -*- coding: utf-8 -*-

from odoo import http
from odoo.http import request
import base64


class PosLogoController(http.Controller):

    @http.route('/pos/logo/<int:config_id>', type='http', auth='user', methods=['GET'])
    def get_pos_logo(self, config_id, **kwargs):
        """Endpoint para obtener el logo de una sesión POS específica"""
        
        # Buscar la configuración POS
        pos_config = request.env['pos.config'].sudo().browse(config_id)
        if not pos_config.exists():
            return request.not_found()

        # Determinar qué logo usar
        logo_data = None
        mime_type = 'image/png'
        
        if pos_config.use_custom_logo and pos_config.pos_custom_logo:
            # Usar logo personalizado de la sesión
            logo_data = base64.b64decode(pos_config.pos_custom_logo)
        elif pos_config.company_id.logo:
            # Usar logo de la empresa
            logo_data = base64.b64decode(pos_config.company_id.logo)
        
        if not logo_data:
            return request.not_found()

        # Preparar headers de cache
        headers = [
            ('Content-Type', mime_type),
            ('Cache-Control', 'public, max-age=3600'),  # Cache por 1 hora
            ('Content-Length', len(logo_data)),
        ]
        
        return request.make_response(logo_data, headers)

    @http.route('/pos/logo/data/<int:config_id>', type='json', auth='user', methods=['POST'])
    def get_pos_logo_data(self, config_id, **kwargs):
        """Endpoint JSON para obtener datos del logo de una sesión POS"""
        
        pos_config = request.env['pos.config'].browse(config_id)
        if not pos_config.exists():
            return {'error': 'Configuración POS no encontrada'}

        return pos_config.get_logo_data()