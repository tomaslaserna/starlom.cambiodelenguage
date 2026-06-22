# Fixes applied

| Archivo | Problema | Cambio aplicado | Motivo | Test asociado |
| --- | --- | --- | --- | --- |
| scripts/run-starlim-system-test.cmd | Dependia de `python` en PATH y fallaba en Windows cuando Python no estaba instalado globalmente. | Ahora delega en `scripts/starlim-test-all.ps1`. | Evitar falsos BLOCKED de tooling y usar deteccion robusta de Python. | scripts/starlim-test-all.ps1 |
| scripts/starlim-test-all.ps1 y wrappers | El prompt requeria comandos reproducibles de diagnostico/backend/frontend/all. | Se agregaron wrappers que detectan Python y PYTHONPATH para pg8000 sin imprimir secretos. | Repetibilidad local sin deploy ni escrituras en produccion. | scripts/starlim-test-all.ps1 |
