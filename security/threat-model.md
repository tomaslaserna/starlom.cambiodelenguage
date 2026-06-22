# Threat Model

Method: STRIDE plus ERP abuse cases.

Assets: users, sessions, tenant-scoped records, financial/fiscal records, audit logs and secrets.

Threats: spoofing via weak sessions, tampering with IDs/empresa_id/amounts, repudiation through missing logs, information disclosure across tenants, service limits/availability, elevation via direct admin URLs or mass assignment.
