"""E2E safety entrypoint for Starlim business flows.
The central audit records protected-route checks and marks write flows BLOCKED unless a safe non-production tenant is provided.
"""
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
module = runpy.run_path(str(ROOT / "scripts" / "run_starlim_system_test.py"))
raise SystemExit(module["main"]())
