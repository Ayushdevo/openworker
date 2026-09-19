"""Pack the tool runner into one file.

The runner is delivered to a sandbox as a read-only mount of a single zipapp, so it always
matches this server's version and no image has to carry it. The file lives in the state
directory (`<state dir>/sandbox/`), which is a real folder on the machine, so a provider can
mount that folder into a sandbox whether the server runs on the host or in a sandbox itself.
"""

from __future__ import annotations

import hashlib
import os
import zipfile
from pathlib import Path
from typing import Optional

from ..secrets import state_dir

_PACKAGE = "owrunner"  # the name the runner package has inside the zipapp
_MAIN = f"from {_PACKAGE}.__main__ import main\nraise SystemExit(main())\n"


def _sources() -> list[Path]:
    root = Path(__file__).parent / "runner"
    return sorted(p for p in root.glob("*.py"))


def runner_dir() -> Path:
    return state_dir() / "sandbox"


def build_runner_zipapp(dest_dir: Optional[Path] = None) -> Path:
    """Build (or reuse) the runner zipapp and return its path. The name carries a hash of
    the sources, so an upgraded or edited runner never reuses a stale file."""
    sources = _sources()
    digest = hashlib.sha256()
    for src in sources:
        digest.update(src.name.encode())
        digest.update(src.read_bytes())
    dest_dir = Path(dest_dir) if dest_dir is not None else runner_dir()
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / f"runner-{digest.hexdigest()[:12]}.pyz"
    if target.exists():
        return target
    tmp = target.with_suffix(f".tmp{os.getpid()}")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("__main__.py", _MAIN)
        for src in sources:
            zf.write(src, f"{_PACKAGE}/{src.name}")
    os.chmod(tmp, 0o644)
    os.replace(tmp, target)
    return target
