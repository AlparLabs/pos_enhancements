import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { ArDuplicatedReceipt } from "./ar_duplicated_receipt";

patch(PosStore.prototype, {
    /**
     * For invoiced sales, when the POS is configured to print a duplicate,
     * print ORIGINAL + DUPLICADO as a SINGLE print job.
     *
     * We must NOT print twice via two printer.print() calls: the POS renderer is
     * a shared single slot and web printing (printWeb) fires window.print()
     * detached and blocking, so a second re-entrant print deadlocks the renderer
     * (symptom: the POS hangs on "Cargando" after validating and the duplicate
     * never prints). Rendering both copies in one component avoids that entirely.
     */
    async printReceipt(opts = {}) {
        const { basic = false, order = this.getOrder(), printBillActionTriggered = false } = opts;

        const shouldPrintDuplicate =
            this.config.l10n_ar_receipt_print_duplicate &&
            !basic &&
            !printBillActionTriggered &&
            Boolean(order?.l10n_ar_document_type_name);

        if (!shouldPrintDuplicate) {
            return super.printReceipt(opts);
        }

        const result = await this.printer.print(
            ArDuplicatedReceipt,
            { order, basic_receipt: basic },
            this.printOptions
        );

        // Mirror core printReceipt() bookkeeping. The duplicate is part of the
        // same job, so this counts as a single print.
        if (result) {
            const count = order.nb_print ? order.nb_print + 1 : 1;
            if (order.isSynced) {
                const wasDirty = order.isDirty();
                await this.data.write("pos.order", [order.id], { nb_print: count });
                if (!wasDirty) {
                    order._dirty = false;
                }
            } else {
                order.nb_print = count;
            }
        }
        if (result?.warningCode) {
            this.displayPrinterWarning(result, _t("Receipt Printer"));
        }
        return result;
    },
});
