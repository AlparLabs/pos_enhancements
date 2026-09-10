# POS NPS Survey QR on Receipt (Odoo 19)

Módulo para Odoo 19 que permite imprimir un código QR con enlace a una encuesta de satisfacción (NPS) en los recibos de Punto de Venta.

## Características

- **Configurable por Punto de Venta**: Se activa individualmente desde los Ajustes de cada POS (*Punto de Venta -> Configuración -> Ajustes*).
- **URL estática simple**: Soporta enlaces a cualquier herramienta de encuestas (Research, Google Forms, Typeform, Odoo Survey, etc.).
- **Textos personalizables**: Permite configurar un título (ej. *"¿Cómo fue tu experiencia?"*) y subtítulo explicativo (ej. *"Escaneá el código QR y dejanos tu opinión."*).
- **Renderizado nativo**: Utiliza el controlador de códigos de barra y QR integrado en Odoo (`/report/barcode/?barcode_type=QR`).
- **Diseño optimizado para papel térmico**: Ubicado sobre el pie de página con línea punteada divisoria y dimensiones calculadas para impresoras térmicas de 80mm.
- **Opción para Pre-Cuenta**: Casilla opcional para incluir el código QR de encuesta también en el comprobante de pre-cuenta de restaurante (`pos_restaurant_pre_cuenta`).
