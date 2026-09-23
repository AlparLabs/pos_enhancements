/** @odoo-module **/

/**
 * Format customer delivery details from a partner object and POS models.
 * @param {Object} partner - res.partner record
 * @param {Object} [models] - pos models store (optional)
 * @returns {Object|null}
 */
export function formatCustomerDeliveryDetails(partner, models) {
    if (!partner) {
        return null;
    }

    const streetParts = [partner.street, partner.street2]
        .filter(Boolean)
        .map((s) => (typeof s === "string" ? s.trim() : String(s)));
    const address = streetParts.join(", ");

    let stateName = "";
    if (partner.state_id) {
        if (typeof partner.state_id === "object") {
            stateName = partner.state_id.name || "";
        } else if (models && models["res.country.state"]) {
            stateName = models["res.country.state"].get(partner.state_id)?.name || "";
        }
    }

    const cityParts = [partner.city, stateName].filter(Boolean);
    const zipStr = partner.zip ? `CP ${partner.zip}` : "";
    if (zipStr) {
        cityParts.push(zipStr);
    }
    const city_state_zip = cityParts.join(", ");

    const phoneParts = [partner.phone, partner.mobile]
        .filter(Boolean)
        .map((p) => (typeof p === "string" ? p.trim() : String(p)));
    const uniquePhones = Array.from(new Set(phoneParts));
    const phone = uniquePhones.join(" / ");

    return {
        name: partner.name || "",
        street: address,
        city_state_zip: city_state_zip,
        phone: phone,
        email: partner.email || "",
    };
}
