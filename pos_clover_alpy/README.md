# POS Clover / Fiserv (Alpy)

Módulo de integración de terminales inteligentes **Clover (Fiserv)** con el Punto de Venta de **Odoo 19.0 / 20.0**, desarrollado por **AlparData / AlparLabs**.

---

## 🌟 Características Principales

- **Conexión Cloud Pay Display (Recomendado)**:
  - Comunicación directa en tiempo real entre Odoo y la terminal Clover vía Wi-Fi o 4G.
  - Sin necesidad de IP fija local ni configuración de certificados SSL en los puestos de caja.
- **Conexión REST Pay Display (Red Local - LAN)**:
  - Soporte para operar mediante red interna conectando directamente a la IP del dispositivo.
- **Soporte Regional para Argentina (LATAM)**:
  - Manejo de parámetros de cobro (`regionalExtras`): Salteo de pantalla de factura fiscal y cuotas.
- **Almacenamiento de Metadatos de Tarjeta**:
  - Marca de tarjeta (VISA, MasterCard, AMEX, CABAL, etc.), últimos 4 dígitos, código de autorización bancaria, número de transacción/cupón y lote de liquidación.
- **Impresión de Voucher en Ticket**:
  - Impresión automática de los datos del cupón fiscal Clover directamente en el ticket del POS de Odoo.
- **Herramienta de Diagnóstico (Ping)**:
  - Botón "Probar Conexión" en el formulario del método de pago para validar la comunicación con la terminal al instante.

---

## 🚀 Requisitos y Configuración en la Terminal Clover

### 1. Instalar Cloud Pay Display en el equipo Clover
1. En la pantalla principal del dispositivo Clover (Flex, Mini, Compact, Station Duo), abre la tienda **More Tools** (o desde el Merchant Dashboard web).
2. Busca la aplicación **Cloud Pay Display** y presiona **Connect / Instalar**.
3. Abre la aplicación **Cloud Pay Display** en la terminal y presiona **Start**.

### 2. Configurar en Odoo POS
1. Ve a **Punto de Venta -> Configuración -> Métodos de Pago**.
2. Crea o edita un método de pago (ej. *Clover Débito/Crédito*).
3. En el campo **Terminal de Pago**, selecciona: `Clover / Fiserv (Smart POS)`.
4. Completa los campos en la pestaña **Configuración Clover / Fiserv**:
   - **Ambiente**: *Sandbox / Pruebas* o *Producción (LATAM / Argentina)*.
   - **Modo de Conexión**: *Cloud Pay Display (Nube)*.
   - **API / Bearer Token**: Token obtenido del Developer Dashboard o Merchant Dashboard.
   - **Serial del Terminal (Device ID)**: Número de serie del equipo (ej. `C030UQ...`).
   - **Identificador de POS (Caja)**: Identificador único (ej. `CAJA_01`).
5. Presiona el botón **Probar Conexión (Ping)** para validar la comunicación.
6. Agrega el método de pago a tus Cajas / Puntos de Venta.

---

## 💳 Flujo de Cobro en el Punto de Venta

1. El cajero agrega los productos y presiona **Pago**.
2. Selecciona el método de pago Clover y hace clic en **Enviar**.
3. El POS pasa al estado *"Esperando tarjeta"* y la terminal Clover se activa solicitando al cliente insertar, apoyar (NFC) o deslizar su tarjeta.
4. Una vez procesado el pago en Clover:
   - Odoo recibe la confirmación (`SUCCESS`), guarda los datos de auditoría bancaria y marca la línea como cobrada.
   - Si el cliente o cajero cancela la operación en la terminal, Odoo libera la línea e informa la cancelación.
5. Al validar la venta, el ticket de Odoo imprime el comprobante con los datos del cupón bancario.

---

## 🛠️ Tecnologías Utilizadas

- **Odoo 19.0 / 20.0**: Owl 2 Framework, `PaymentInterface`, RPC API Silent Calls.
- **Clover / Fiserv API**: Cloud Pay Display & REST Pay Display API v1 (`/v1/payments`, `/v1/device/ping`, `/v1/device/cancel`, `/v1/payments/{id}/void`).

---

**Desarrollado por AlparData / AlparLabs**  
🌐 [https://www.alpardata.com.ar](https://www.alpardata.com.ar)
