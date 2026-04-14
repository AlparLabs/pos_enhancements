/* @odoo-module */

export function getNow() {
    return new Date();
}

export function parseServerDatetime(datetimeStr) {
    return new Date(datetimeStr.replace(" ", "T") + "Z");
}

export function formatDuration(diffMs) {
    const hours = String(Math.floor(diffMs / 3600000)).padStart(2, "0");
    const minutes = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, "0");
    const seconds = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}

export function diffHours(startDate, endDate) {
    return (endDate - startDate) / 3600000;
}

export function toServerDatetime(dateObj) {
    return dateObj.toISOString().slice(0, 19).replace("T", " ");
}