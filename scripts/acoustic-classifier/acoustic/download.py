"""Dataset fetching helpers / placement instructions.

UrbanSound8K sits behind a request form and cannot be fetched non-interactively,
so we print exact placement instructions.  ESC-50 is freely cloneable and we can
fetch it automatically when git is available.
"""

from __future__ import annotations

import os
import subprocess

from .datasets import DATA_ROOT, US8K_INSTRUCTIONS, esc50_paths, us8k_paths

ESC50_GIT = "https://github.com/karolpiczak/ESC-50.git"


def instructions(root: str = DATA_ROOT) -> None:
    print("=== UrbanSound8K (primary, manual download) ===")
    p = us8k_paths(root)
    if os.path.exists(p["meta"]):
        print(f"Already present at {p['base']}")
    else:
        print(US8K_INSTRUCTIONS.format(base=p["base"]))


def fetch_esc50(root: str = DATA_ROOT) -> bool:
    """Clone ESC-50 into ``root`` if not already present.  Returns success."""
    q = esc50_paths(root)
    if os.path.exists(q["meta"]):
        print(f"ESC-50 already present at {q['base']}")
        return True
    os.makedirs(root, exist_ok=True)
    print(f"Cloning ESC-50 (~600 MB) into {q['base']} ...")
    try:
        subprocess.run(["git", "clone", "--depth", "1", ESC50_GIT, q["base"]], check=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"ESC-50 clone failed ({e}). Clone manually:\n    git clone {ESC50_GIT} {q['base']}")
        return False
    return os.path.exists(q["meta"])
