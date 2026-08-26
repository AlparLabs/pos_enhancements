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
    // Categoría sin grupo asignado: se imprime bajo su propio nombre, ordenada
    // por el `sequence` de la categoría, que es un campo del core y ya viaja al
    // POS. Es lo que hace que el ticket salga igual que antes hasta que se
    // asignen los grupos.
    return { name: categ.name, index: toIndex(categ.sequence) };
}

/**
 * Ordena las líneas dentro de cada bloque.
 *
 * El único eje de orden del ticket es el grupo de cocina: la secuencia del grupo
 * ordena los bloques y, adentro, las líneas salen en el orden en que el mozo las
 * cargó. La categoría POS no ordena nada, porque no se imprime y un orden que no
 * se ve no se puede explicar.
 *
 * Lo único que se corrige es la contigüidad de los combos: los hijos de un mismo
 * combo se anclan a la posición del primero, así no se intercalan con productos
 * sueltos cargados en el medio. El core respeta el orden del array dentro de
 * cada bloque, así que ordenar acá alcanza.
 *
 * @param {Array} changes
 * @returns {Array} copia ordenada; no muta el array recibido
 */
export function sortChangeLines(changes) {
    const comboAnchor = new Map();
    changes.forEach((change, position) => {
        const combo = change?.combo_parent_uuid;
        if (combo && !comboAnchor.has(combo)) {
            comboAnchor.set(combo, position);
        }
    });
    return changes
        .map((change, position) => ({
            change,
            position,
            anchor: change?.combo_parent_uuid
                ? comboAnchor.get(change.combo_parent_uuid)
                : position,
        }))
        .sort((a, b) => a.anchor - b.anchor || a.position - b.position)
        .map((entry) => entry.change);
}
