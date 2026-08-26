def migrate(cr, version):
    """Elimina pos_category.kitchen_sequence.

    El campo ordenaba las líneas dentro de cada bloque del ticket, pero era un
    campo de la categoría POS decidiendo un orden que el cocinero no ve, porque
    la categoría no se imprime. Ahora el único eje de orden es el grupo de
    cocina: la secuencia del grupo ordena los bloques y adentro las líneas
    salen en el orden en que se cargaron.

    Odoo no borra la columna de un campo que dejó de existir, así que se
    elimina acá para no dejarla huérfana.
    """
    cr.execute(
        """
        ALTER TABLE pos_category
        DROP COLUMN IF EXISTS kitchen_sequence
        """
    )
