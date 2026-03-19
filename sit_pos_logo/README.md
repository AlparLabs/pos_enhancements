# SIT POS Logo Customization

Módulo para personalizar el logotipo de cada sesión del punto de venta de Odoo individualmente.

## Características

✨ **Logo por Sesión POS:**
- Cada sesión del punto de venta puede tener su propio logo
- Logo personalizado independiente para cada POS
- Fallback automático al logo de la empresa
- Configuración individual por punto de venta

🎨 **Personalización Avanzada:**
- Tamaños configurables (ancho y alto)
- Vista previa en tiempo real
- Soporte para múltiples formatos de imagen
- Interfaz de configuración intuitiva

📱 **Compatibilidad:**
- Responsive design para diferentes tamaños de pantalla
- Optimizado para tablets (pantallas táctiles)
- Compatible con móviles y desktop
- Carga optimizada de imágenes

## Configuración

### 1. Instalación
1. Copiar el módulo en la carpeta de addons de Odoo
2. Actualizar la lista de aplicaciones
3. Instalar el módulo "SIT POS Logo Customization"

### 2. Configurar Logo por Sesión POS
1. Ir a **Punto de Venta → Configuración → Puntos de Venta**
2. Seleccionar la sesión POS que deseas configurar
3. En la sección "🎨 Logo Personalizado":
   - Marcar "Usar Logo Personalizado"
   - Subir la imagen del logo
   - Configurar dimensiones (ancho y alto)
4. Guardar cambios

### 3. Configuración Múltiple
- Puedes configurar logos diferentes para cada sesión POS
- Si no configuras logo personalizado, se usa el logo de la empresa
- Si no hay logo de empresa, se muestra el nombre de la empresa

## Casos de Uso

### 🏪 **Múltiples Tiendas:**
- Cada tienda puede tener su propio logo en el POS
- Manteniendo la identidad visual específica de cada ubicación

### 🏢 **Diferentes Marcas:**
- Una empresa con múltiples marcas
- Cada POS puede mostrar la marca correspondiente

### 🎯 **Eventos Especiales:**
- Logos temporales para promociones
- Cambios estacionales de imagen

## Configuración Avanzada

### Dimensiones Recomendadas por Tipo de Logo:

#### **Logo Horizontal (Ancho):**
- Ancho: 180-250 px
- Alto: 40-60 px
- Formato: PNG (transparente)

#### **Logo Vertical (Alto):**
- Ancho: 60-100 px  
- Alto: 60-80 px
- Formato: PNG (transparente)

#### **Logo Cuadrado:**
- Ancho: 60-80 px
- Alto: 60-80 px
- Formato: PNG (transparente)

### Formatos Soportados:
- **PNG** (recomendado para transparencia)
- **JPG/JPEG** (para logos con fondo)
- **SVG** (escalable)
- **GIF** (animado soportado)

## Solución de Problemas

### El logo no aparece:
1. Verificar que la empresa tenga logo configurado
2. Comprobar que el archivo de imagen sea válido
3. Limpiar caché del navegador (Ctrl+F5)
4. Verificar permisos de acceso a archivos estáticos

### Logo muy grande o pequeño:
1. Ajustar dimensiones en CSS
2. Redimensionar imagen original
3. Usar formato SVG para mejor escalabilidad

### Problemas de responsive:
1. Verificar media queries en CSS
2. Probar en diferentes dispositivos
3. Ajustar breakpoints según necesidades

## Compatibilidad

- **Odoo:** 18.0+
- **Navegadores:** Chrome, Firefox, Safari, Edge
- **Dispositivos:** Desktop, Tablet, Mobile
- **Módulos requeridos:** point_of_sale

## Soporte

- **Desarrollado por:** Service-IT - Biotecnología
- **Website:** https://service-it.pe
- **Versión:** 18.0.1.0.0
- **Licencia:** LGPL-3