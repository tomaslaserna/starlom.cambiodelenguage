# Abuse Cases

- User from company A accesses company B by changing empresa_id or object IDs.
- User opens administrative URL directly.
- User changes payment, invoice, stock or customer IDs.
- User self-assigns permissions.
- Session survives user deactivation or permission removal.
- Postgres tenant context leaks between requests.
- Payment, stock movement, fiscal request or bank match submitted twice.
- Authorized fiscal document modified.
- Bank import contains spreadsheet formula injection.
- Error exposes SQL or secret.
