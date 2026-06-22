# Data Flow Diagram

```mermaid
flowchart LR
  B[Browser] -->|HTTPS + PHPSESSID| V[Vercel PHP]
  V -->|PDO TLS| S[Supabase Postgres]
  S --> P[php_sessions]
  S --> D[Business tables]
  V --> A[Audit logs]
  V --> F[Fiscal/document integrations]
  I[Imports / bank files] --> V
```
