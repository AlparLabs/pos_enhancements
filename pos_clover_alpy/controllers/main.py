# -*- coding: utf-8 -*-
# Part of AlparLabs. See LICENSE file for full copyright and licensing details.

import json
import logging
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class CloverPosController(http.Controller):

    @http.route('/pos_clover/notification', type='json', auth='public', methods=['POST'], csrf=False)
    def clover_notification(self, **kwargs):
        """Webhook listener for asynchronous Clover notifications / status updates."""
        try:
            data = request.get_json_data()
            _logger.info("Clover Webhook Notification received: %s", data)
            return {'status': 'received'}
        except Exception as e:
            _logger.error("Error processing Clover notification: %s", e)
            return {'status': 'error', 'message': str(e)}
