@echo off
setlocal EnableDelayedExpansion
set STATUS=0
set PYTHONPATH=%TEMP%\codex_pg8000_pkg;%PYTHONPATH%

set "PY=python"
where python >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
    set "PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
  )
)

"%PY%" scripts\security_audit.py
set CODE=!ERRORLEVEL!
if !CODE! GTR !STATUS! set STATUS=!CODE!
"%PY%" -m unittest discover -s tests\security -p "test_*.py" -v
set CODE=!ERRORLEVEL!
if !CODE! GTR !STATUS! set STATUS=!CODE!
"%PY%" scripts\run_starlim_system_test.py
set CODE=!ERRORLEVEL!
if !CODE! GTR !STATUS! set STATUS=!CODE!
exit /b !STATUS!
