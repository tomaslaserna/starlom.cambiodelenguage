# Data Classification

| Class | Examples | Controls |
|---|---|---|
| Public | Static assets, landing content | Integrity |
| Internal | Operational dashboard | Authenticated access |
| Confidential | Users, customers, providers, margins | RBAC and tenant isolation |
| Financial | Sales, payments, bank statements, treasury | Strong authorization and audit |
| Personal | User/customer contact data | Least privilege and privacy-aware logs |
| Fiscal | Invoices, tax data, authorizations | Immutability and audit |
| Credentials/secrets | DB passwords, service keys, pepper | Secret store and rotation |
| Especially sensitive | Salaries, dividends, obligations | Extra permissions and reauth roadmap |
