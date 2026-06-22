#!/usr/bin/env bash
set +e
status=0
python3 scripts/security_audit.py
code=$?
if [ "$code" -gt "$status" ]; then status=$code; fi
python3 -m unittest discover -s tests/security -p "test_*.py" -v
code=$?
if [ "$code" -gt "$status" ]; then status=$code; fi
python3 scripts/run_starlim_system_test.py
code=$?
if [ "$code" -gt "$status" ]; then status=$code; fi
exit "$status"