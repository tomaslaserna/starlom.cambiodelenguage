# Monthly costs ERP connection

User approved real-source integration, local tests and review before publishing. No production writes.

Architecture: import a company-scoped read-only snapshot from salaries, operating costs and monthly decisions. Stable source IDs and explicit duplicate links; immutable cutover month, with no inferred salary history before it. Shared command service validates revisions and protected months. PostgreSQL adapter for ERP and SQLite adapter for an isolated local server copy exercise the same commands. Authenticated ERP route requires both metrics and salary read permissions; mutations require appropriate write permissions. No browser-owned state is trusted.

Tasks: source importer + unit tests; server stores/transaction/concurrency tests; authenticated route and real-source local preview; integrate totals when ledger activated and block legacy in-place edits; migration prepared but not applied; browser review + report.

No retroactive migration, automatic salary payment, commission accrual or duplicate deletion. Initial import retains source evidence; excluded manual salary copies are linked once and do not reappear when salary changes. Unconfirmed costs remain pending. Before production: apply reviewed migration, activate cutover explicitly and review outstanding source issues.
