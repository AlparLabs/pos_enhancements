# -*- coding: utf-8 -*-
from odoo import api, fields, models


class LoyaltyProgram(models.Model):
    _inherit = 'loyalty.program'

    filter_by_days = fields.Boolean(
        string="Restringir por días de la semana",
        default=False,
        help="Si está activado, la promoción solo será válida durante los días de la semana seleccionados."
    )
    monday = fields.Boolean(string="Lunes", default=True)
    tuesday = fields.Boolean(string="Martes", default=True)
    wednesday = fields.Boolean(string="Miércoles", default=True)
    thursday = fields.Boolean(string="Jueves", default=True)
    friday = fields.Boolean(string="Viernes", default=True)
    saturday = fields.Boolean(string="Sábado", default=True)
    sunday = fields.Boolean(string="Domingo", default=True)

    filter_by_hours = fields.Boolean(
        string="Restringir por franja horaria",
        default=False,
        help="Si está activado, la promoción solo será válida dentro del rango horario configurado (ej. Happy Hour)."
    )
    hour_from = fields.Float(
        string="Hora Desde",
        default=0.0,
        help="Hora de inicio de vigencia de la promoción (ej. 18.0 para 18:00)."
    )
    hour_to = fields.Float(
        string="Hora Hasta",
        default=23.99,
        help="Hora de finalización de vigencia de la promoción (ej. 21.0 para 21:00)."
    )

    @api.model
    def _load_pos_data_fields(self, config):
        fields = super()._load_pos_data_fields(config)
        return list(set(fields + [
            'filter_by_days', 'monday', 'tuesday', 'wednesday', 'thursday',
            'friday', 'saturday', 'sunday', 'filter_by_hours', 'hour_from', 'hour_to'
        ]))

    def _is_valid_at_datetime(self, dt=None):
        """Verifica si el programa está vigente en la fecha y hora indicadas."""
        self.ensure_one()
        if not dt:
            dt = fields.Datetime.now()

        # Validación por día de la semana (0 = Lunes, 6 = Domingo)
        if self.filter_by_days:
            weekday_map = {
                0: self.monday,
                1: self.tuesday,
                2: self.wednesday,
                3: self.thursday,
                4: self.friday,
                5: self.saturday,
                6: self.sunday,
            }
            if not weekday_map.get(dt.weekday(), True):
                return False

        # Validación por franja horaria
        if self.filter_by_hours:
            current_hour = dt.hour + dt.minute / 60.0
            if current_hour < self.hour_from or current_hour > self.hour_to:
                return False

        return True
