/** @odoo-module */

// Estilos CSS adicionales para el logo personalizado del POS
// El logo se renderiza directamente en el template XML heredado (navbar.xml)

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

// Agregar estilos dinámicos para logos personalizados
patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this._addCustomLogoStyles();
    },

    _addCustomLogoStyles() {
        // Crear estilos CSS dinámicos para el logo
        const style = document.createElement('style');
        style.id = 'pos-custom-logo-styles';
        
        const css = `
            /* Logo personalizado del POS */
            .pos-logo {
                object-fit: contain;
                cursor: pointer;
                transition: opacity 0.3s ease;
            }
            
            .pos-logo:hover {
                opacity: 0.85;
            }
            
            /* Fallback de nombre de empresa */
            .company-name-fallback {
                color: #2c3e50;
                font-weight: 600;
                font-size: 16px;
                letter-spacing: 0.5px;
                cursor: pointer;
                transition: opacity 0.3s ease;
                user-select: none;
            }
            
            .company-name-fallback:hover {
                opacity: 0.85;
            }
            
            /* Responsive para pantallas pequeñas */
            @media (max-width: 768px) {
                .pos-logo {
                    max-height: 35px !important;
                    max-width: 120px !important;
                }
                
                .company-name-fallback {
                    font-size: 14px;
                }
            }
        `;

        style.textContent = css;
        
        // Remover estilos existentes si los hay
        const existingStyle = document.getElementById('pos-custom-logo-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        document.head.appendChild(style);
    }
});
