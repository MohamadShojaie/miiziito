# Payment agent security notes
#
# - Bind the local API to 127.0.0.1 when possible.
# - Set MIIZIITO_PAYMENT_AGENT_TOKEN (or MIIZIITO_AGENT_TOKEN) so POS→agent
#   calls must present X-Payment-Agent-Token.
# - Optional: MIIZIITO_PAYMENT_ALLOWED_ORIGINS=comma,separated,origins
# - Optional: MIIZIITO_PAYMENT_ALLOW_REMOTE=1 only for controlled LAN agents.
# - Never log PAN, CVV, PIN, or track data.
# - Test Connection must never perform a financial transaction.
# - Amounts in domain records are IRT (toman) integers.
