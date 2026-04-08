/** @odoo-module **/
/* global Accept */

import { _t } from '@web/core/l10n/translation';
import { loadJS } from '@web/core/assets';

import paymentForm from '@payment/js/payment_form';
import { rpc, RPCError } from '@web/core/network/rpc';

paymentForm.include({

    paywayMethodByName : {'Visa':'1', 'Diners Club':'8', 'Tarjeta Shopping':'23', 'Tarjeta Naranja':'24', 'PagoFacil':'25', 'RapiPago':'26', 'Italcred':'29', 'ArgenCard':'30', 'CoopePlus':'34', 'Nexo':'37', 'Credimás':'38', 'Tarjeta Nevada':'39', 'Nativa':'42', 'Tarjeta Cencosud':'43', 'Tarjeta Carrefour / Cetelem':'44', 'Tarjeta PymeNacion':'45', 'Caja de Pagos':'48', 'BBPS':'50', 'Cobro Express':'51', 'Qida':'52', 'Grupar':'54', 'Patagonia 365':'55', 'Tarjeta Club Día':'56', 'Tuya':'59', 'Distribution':'60', 'Tarjeta La Anónima':'61', 'CrediGuia':'62', 'Cabal Prisma':'63', 'Tarjeta SOL':'64', 'American Express':'65', 'Amex':'65', 'Favacard':'103', 'MasterCard Prisma':'104', 'MasterCard Prisma':'104', 'Nativa Prisma':'109', 'American Express Prisma':'111', 'Visa Débito':'31', 'MasterCard Debit Prisma':'105', 'Maestro Prisma':'106', 'Cabal Débito Prisma':'108'},
    paywayData: undefined,

    // #=== DOM MANIPULATION ===#

    /**
     * Prepare the inline form of payway for direct payment.
     *
     * @private
     * @param {number} providerId - The id of the selected payment option's provider.
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The online payment flow of the selected payment option.
     * @return {void}
     */
    async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'payway') {
            this._super(...arguments);
            return;
        }
        // Check if the inline form values were already extracted.
        this.paywayData ??= {}; // Store the form data of each instantiated payment method.
        this.paywayData[paymentOptionId] ??= {};
        let providerInfo = await rpc('/payment/payway/get_provider_info',
            {
                'rec_id': flow != 'token' ? providerId : paymentOptionId,
                'flow': flow,
                'net_amount': this.paymentContext['amount']
            });
        if (! Object.keys(providerInfo['card_tree']).length) {
            this._displayErrorDialog(
                _t("Payway payment Error"),
                _t("There are not any cards define for thes payment method"));
            return;
        }
        this.paywayData[paymentOptionId]['card_tree'] = providerInfo['card_tree'];
        this.paywayData[paymentOptionId]['payway_url'] = providerInfo['base_url']
        this.paywayData[paymentOptionId]['payway_public_key'] = providerInfo['public_key'];
        this.paywayData[paymentOptionId]['payway_inhabilitarCS'] = providerInfo['cybersource'];
        const radio = document.querySelector('input[name="o_payment_radio"]:checked');
        const inlineForm = this._getInlineForm(radio);
        const paywayForm = inlineForm.querySelector('[class="o_payway_form"]');
        this.paywayData[paymentOptionId]['form'] = paywayForm;

        if (flow === 'token') {

        } else {
            this._setPaymentFlow('direct');
            this._paywayListPaymentMethod(paymentOptionId);
                            /*document.getElementById('o_payway_card_number_' + paymentOptionId).addEventListener('change',function guessPayment(event){
                                self.guessPaywayPaymentMethod(event, paymentOptionId);
                            });*/
        }
    },
    _prepareTransactionRouteParams() {

        const transactionRouteParams = this._super(...arguments);
        return transactionRouteParams

    },
    _paywayListPaymentMethod(paymentOptionId){
        const form = this.paywayData[paymentOptionId]['form'];
        const paymentTree = this.paywayData[paymentOptionId]['card_tree']
        let paywayMethodSelect = form.querySelector('#o_payway_method');
        paywayMethodSelect.options.length = 0;
        self = this;
        Object.keys(paymentTree).map((key, index) => {
            //TODO : esto deberia ser un Qweb
            let opt = document.createElement('option');
            opt.text = paymentTree[key]['name'];
            opt.value = paymentTree[key]['payway_method'];
            opt.setAttribute("data-card-id", paymentTree[key]['id']);
            opt.setAttribute("data-payway-method-id", paymentTree[key]['payway_method']);
            paywayMethodSelect.appendChild(opt);
        });
        paywayMethodSelect.addEventListener('change', function handleClick(event) {
            self._paywaySetPaymentMethod(event, paymentOptionId);
        });
        paywayMethodSelect.dispatchEvent(new Event('change'));

    },
    _paywaySetPaymentMethod: function (event, paymentOptionId) {
        let methodSelect = event.target;
        let cardId = methodSelect.options[methodSelect.selectedIndex].dataset.cardId;
        this._paywaysetInstallments(cardId, paymentOptionId);
    },
    _paywaysetInstallments: function (cardId, paymentOptionId) {
        const form = this.paywayData[paymentOptionId]['form'];
        const paymentTree = this.paywayData[paymentOptionId]['card_tree']

        let show_installments = paymentTree[cardId]['installments'].length > 1;

        let installments_group = form.querySelector('#o_payway_installments_group');
        let installmentsSelect = form.querySelector("#o_payway_installments_select");

        installmentsSelect.options.length = 0;
        paymentTree[cardId]['installments'].forEach(installment => {
            //TODO : esto deberia ser un Qweb
            let opt = document.createElement('option');
            opt.text = installment.description;
            opt.value = installment.installment;
            opt.setAttribute("data-payway-amount", installment.amount);
            opt.setAttribute("data-payway-base-amount", installment.base_amount);
            opt.setAttribute("data-fees", installment.fee);
            opt.setAttribute("data-payway-installment-id", installment.id);
            opt.setAttribute("data-payway-divisor", installment.divisor);

            installmentsSelect.appendChild(opt);


        });

        if (show_installments) {
            installments_group.classList.remove("o_hidden");

        } else {
            installments_group.classList.add("o_hidden");
        }

    },

    // #=== PAYMENT FLOW ===#

    /**
     * Trigger the payment processing by submitting the data.
     *
     * @override method from payment.payment_form
     * @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The payment flow of the selected payment option.
     * @return {void}
     */
    async _initiatePaymentFlow(providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'payway') {
            this._super(...arguments); // Tokens are handled by the generic flow
            return;
        }
        const inputs = Object.values(
            this._paywayGetInlineFormInputs(providerCode, paymentOptionId, paymentMethodCode, flow)
        );
        if (!inputs.every(element => element.reportValidity())) {
            this._enableButton(); // The submit button is disabled at this point, enable it
            return;
        }
        await this._super(...arguments);
    },

    /**
     * Process the direct payment flow.
     *
     * @override method from payment.payment_form
     * @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {object} processingValues - The processing values of the transaction.
     * @return {void}
     */
    async _processDirectFlow(providerCode, paymentOptionId, paymentMethodCode, processingValues) {
        if (providerCode !== 'payway') {
            this._super(...arguments);
            return;
        }
        const form = this.paywayData[paymentOptionId]['form'];
        try {
            var decidir = new Decidir(this.paywayData[paymentOptionId]['payway_url'], this.paywayData[paymentOptionId]['payway_inhabilitarCS']);
            // TODO : Para que esto ? 
            // this.device_unique_identifier = this.uuidv4();
            decidir.setPublishableKey(this.paywayData[paymentOptionId]['payway_public_key']);
            decidir.createToken(form, function (status, response) {
                if (status != 200 && status != 201) {
                    let error = response['error'].map(function (obj) {
                        return obj['error']['message']
                    })
                    self._displayErrorDialog(
                        _t("Payway payment Error"),
                        _t("An error occurred when displayed this payment form.") +
                        _t(error.join('<br/>')));
                } else {
                    self._paywayResponseHandler(providerCode, paymentOptionId, paymentMethodCode, processingValues, response);
                }
            });
        } catch (_displayErrorDialog) {
            self._displayErrorDialog(
                _t("Payway payment Error"),
                _t("An error occurred when displayed this payment form.") +
                _t(error));

        }

    },


    _paywayResponseHandler: function (providerCode, paymentOptionId, paymentMethodCode, processingValues, response){
        // Initiate the payment

        const form = this.paywayData[paymentOptionId]['form'];

        let installmentsSelect = form.querySelector("#o_payway_installments_select");
        let paymentMethod =  form.querySelector('#o_payway_method');
        let fees = installmentsSelect.options[installmentsSelect.selectedIndex].dataset.fees;
        return rpc(
            '/payment/payway/payment',
           {
                'bin':response.bin,
                'last_four_digits':response.last_four_digits,
                'cardholder':response.cardholder,
                'reference': processingValues.reference,
                'partner_id': processingValues.partner_id,
                'access_token': this.paymentContext['accessToken'],
                'provider_id': processingValues.provider_id,
                'token': response.id,
                'payway_payment_method': paymentMethod.value,
                'payway_payment_instalment': parseInt(installmentsSelect.value),
                'fees': parseFloat(fees),
                'email': form.querySelector('#email').value,
            }
        )
        .then(() => window.location = '/payment/status')
        .catch((error) => {
            if (error instanceof RPCError) {
                this._displayErrorDialog(_t("Payment processing failed"), error.data.message);
                this._enableButton();
            } else {
                return Promise.reject(error);
            }
        });

    },



    // #=== GETTERS ===#

    /**
     * Return all relevant inline form inputs based on the payment method type of the provider.
     *
     * @private
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @return {Object} - An object mapping the name of inline form inputs to their DOM element
     */
    _paywayGetInlineFormInputs(providerCode, paymentOptionId, paymentMethodCode, flow) {
        const form = this.paywayData[paymentOptionId]['form'];

        if (flow === 'direct') {
            return {
                methods: form.querySelector('#o_payway_method'),
                card: form.querySelector('#o_payway_card_number'),
                month: form.querySelector('#o_payway_month'),
                year: form.querySelector('#o_payway_year'),
                code: form.querySelector('#o_payway_code'),
                vat: form.querySelector('#o_payway_vat_number'),
            };
        } else if (flow === 'token') {
            return {
                code: form.querySelector('#o_payway_token_code'),
            };
        }
    },

});
