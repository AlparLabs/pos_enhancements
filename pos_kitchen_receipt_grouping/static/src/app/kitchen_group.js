/** @odoo-module **/

// Funciones puras: no importan nada del POS ni de OWL, así se testean con Hoot
// sin levantar un entorno POS.

export const FALLBACK_GROUP_NAME = "Otros";
export const FALLBACK_GROUP_INDEX = 999999;
export const DEFAULT_KITCHEN_SEQUENCE = 10;

function toIndex(value) {
    return typeof value === "number" ? value : DEFAULT_KITCHEN_SEQUENCE;
}

function asBlock(group) {
    if (!group?.name) {
        return null;
    }
    return { name: group.name, index: toIndex(group.sequence) };
}

/**
 * El campo vive en product.template; según cómo esté cargado el registro en el
 * POS puede alcanzarse directo sobre la variante o a través de product_tmpl_id.
 */
function ownGroupOf(product) {
    return product?.kitchen_group_id || product?.product_tmpl_id?.kitchen_group_id || null;
}

/**
 * Devuelve el bloque del ticket de cocina al que pertenece un producto:
 * grupo propio → grupo de la primera categoría POS → la categoría misma →
 * bloque "Otros" al final.
 *
 * @returns {{ name: string, index: number }}
 */
export function resolveKitchenGroup(product) {
    const own = asBlock(ownGroupOf(product));
    if (own) {
        return own;
    }
    const categ = product?.pos_categ_ids?.[0];
    if (!categ) {
        return { name: FALLBACK_GROUP_NAME, index: FALLBACK_GROUP_INDEX };
    }
    const fromCateg = asBlock(categ.kitchen_group_id);
    if (fromCateg) {
        return fromCateg;
    }
    return { name: categ.name, index: toIndex(categ.kitchen_sequence) };
}
