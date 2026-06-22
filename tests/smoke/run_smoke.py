"""Smoke entrypoint for Starlim system checks.
Runs the central read-only audit and exits with the same status code.
Use this for quick route/static/production-read-only verification.
"""
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
module = runpy.run_path(str(ROOT / "scripts" / "run_starlim_system_test.py"))
raise SystemExit(module["main"]())
