"""Integration entrypoint for Starlim Supabase/schema checks.
Runs the central audit because DB validations are intentionally read-only and report-backed.
"""
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
module = runpy.run_path(str(ROOT / "scripts" / "run_starlim_system_test.py"))
raise SystemExit(module["main"]())
