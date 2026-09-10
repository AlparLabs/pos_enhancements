# POS Restaurant Sync Safeguard

Módulo diseñado específicamente para entornos gastronómicos de alta concurrencia, redes Wi-Fi locales con latencia a servidores en la nube (como Odoo.sh en EE.UU. operado desde Argentina o Latinoamérica) y múltiples terminales/comanderas.

## Problemas que resuelve

### 1. Bloqueo por Comandera Colgada (Timeout en Red Local)
* **Problema:** En el flujo estándar de Odoo POS Restaurant, si una comandera (ej. la de Barra) se apaga, pierde IP o tiene el buffer lleno, la llamada `printer.print(...)` queda en espera indefinida (30-60 segundos o cuelgue de promesa). Esto congela el hilo de JavaScript, aborta la llamada al backend y la mesa queda con el candado de *"sincronizando/enviando"* sin que las demás PCs puedan verla.
* **Solución:** Envolver todas las impresoras (`this.printers` y `this.printer`) con un timeout asíncrono estricto de **3.5 segundos** mediante `Promise.race`. Si una impresora no responde, se lanza una alerta toast amarilla no bloqueante y el flujo continúa: la orden se marca como comandada y se persiste en el servidor central.

### 2. Liberación Garantizada de Bloqueos de UI (`try / finally`)
* **Problema:** Cuando una excepción no controlada interrumpe el comande, los flags de bloqueo en la orden (`isSubmitting`, `isSending`, `syncing`) permanecen activos en memoria, obligando al usuario a reiniciar la página con `F5`.
* **Solución:** `sendOrderInPreparation` y `printChanges` se ejecutan dentro de bloques de salvaguarda con limpieza forzada de flags en `finally`. La mesa se libera de inmediato para que el personal pueda volver a interactuar sin recargar el navegador.

### 3. "Auto-Heal" contra WebSockets Zombies en `FloorScreen`
* **Problema:** Tablets que entran en reposo o sufren microcortes de Wi-Fi pueden perder silenciosamente el canal WebSocket de `bus.bus`. Cuando esto ocurre, la tablet queda "sorda" y no se entera de las mesas abiertas por otros mozos ("mesas que desaparecen").
* **Solución:** Al volver al plano de pisos o al recuperar visibilidad (`document.visibilitychange` cuando el mozo desbloquea la pantalla), se dispara una sincronización en background (con throttle de 10s) que reconcilia las órdenes borrador de la sesión activa contra el backend.

## Compatibilidad
* **Odoo Version:** 19.0 (compatible con 18.0)
* **Dependencias:** `point_of_sale`, `pos_restaurant`
* **Tipo:** 100% Frontend (sin modificaciones en tablas de base de datos ni modelos Python).
