"""Alias kept for the commands documented before ADR 0021.

    python scripts/build_alsace_vineyard.py [options]
    == python scripts/build_vineyard.py --region alsace [options]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_vineyard import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main(["--region", "alsace", *sys.argv[1:]]))
