UPDATE pos_payment_method
   SET mp_bearer_token = 'dummy_value',
       mp_webhook_secret_key = 'dummy_value',
       mp_external_pos_id = NULL,
       mp_user_id = NULL,
       mp_qr_string = NULL
   WHERE mp_bearer_token IS NOT NULL;
