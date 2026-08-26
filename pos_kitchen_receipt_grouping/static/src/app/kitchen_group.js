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
 * Igual que ownGroupOf: el POS delega los campos del template al product.product,
 * pero se explicita el fallback para no depender de esa delegación.
 */
function firstCategoryOf(product) {
    return product?.pos_categ_ids?.[0] || product?.product_tmpl_id?.pos_categ_ids?.[0] || null;
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
    const categ = firstCategoryOf(product);
    if (!categ) {
        return { name: FALLBACK_GROUP_NAME, index: FALLBACK_GROUP_INDEX };
    }
    const fromCateg = asBlock(categ.kitchen_group_id);
    if (fromCateg) {
        return fromCateg;
    }
    return { name: categ.name, index: toIndex(categ.kitchen_sequence) };
}

/**
 * Secuencia de cocina de un producto: la de su primera categoría POS.
 */
export function kitchenSequenceOf(product) {
    return toIndex(firstCategoryOf(product)?.kitchen_sequence);
}

/**
 * Ordena las líneas por la secuencia de cocina de su categoría, conservando el
 * orden de carga entre las que comparten secuencia. El core respeta el orden del
 * array dentro de cada bloque, así que ordenar acá alcanza para controlar el
 * orden de las líneas impresas.
 *
 * @param {Array} changes
 * @param {(change: object) => object | undefined} getProduct
 * @returns {Array} copia ordenada; no muta el array recibido
 */
export function sortChangeLines(changes, getProduct) {
    return changes
        .map((change, position) => ({
            change,
            position,
            sequence: kitchenSequenceOf(getProduct(change)),
        }))
        .sort((a, b) => a.sequence - b.sequence || a.position - b.position)
        .map((entry) => entry.change);
}
