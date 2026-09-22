# POS Restaurant Table Customer

Módulo para Odoo 19 (POS Restaurant) que muestra el nombre del cliente asignado en la parte superior de cada mesa ocupada en la pantalla de planos de pisos (`FloorScreen`).

## Características

* **Visualización Dinámica:** Detecta la orden activa de la mesa (`table.getOrder()`) y, si tiene un cliente asignado (`partner_id`), muestra un badge con su nombre.
* **Diseño Armónico:** 
  * Se ubica en la parte superior de la mesa (`top-0 start-50`, `translate(-50%, -110%)`).
  * Utiliza estilo de píldora redondeada (`badge rounded-pill text-bg-primary`) e ícono `<i class="fa fa-user-circle me-1"/>`.
  * No interfiere con el Timer (`text-bg-warning`) ni con el Mozo (`text-bg-info`), que se ubican en la parte inferior.
* **Manejo de Textos Largos:** Truncado automático con puntos suspensivos (`text-overflow: ellipsis`) y tooltip nativo (`title`) con el nombre completo del cliente al posar el mouse.
* **Reactividad Nativa:** Si se asigna, cambia o remueve el cliente en la orden, la vista del plano se actualiza automáticamente.

## Requisitos

* `pos_restaurant`
