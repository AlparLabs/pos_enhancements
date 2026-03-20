# -*- coding: utf-8 -*-
# Part of Creyox Technologies.

from datetime import datetime

from pytz import timezone, UTC

from odoo import api, models


class Company(models.Model):
    _inherit = "res.company"

    @api.model
    def get_company_current_time(self):
        # Get the company's timezone, defaulting to UTC if it's not set
        company_tz = timezone(self.env.context.get("tz") or "UTC")
        utc_now = datetime.now(UTC)
        company_time = utc_now.astimezone(company_tz)
        return company_time.strftime("%Y-%m-%d %H:%M:%S")
