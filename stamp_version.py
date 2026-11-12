"""Writes static/pet/version.json: a stamp of every file the game loads.

Streamlit serves static files without cache headers, so browsers keep old copies
of the game's modules and models. The game compares this stamp with the one it
saw last; when it changes, it re-downloads its files once (bypassing the cache)
before starting. app.py runs this on every start, so it is always current.

    python stamp_version.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "static"
PET = ROOT / "pet"
# what the game loads: its own code, styles and models, plus the shared cat engine
PATTERNS = [
    (PET, ["js/**/*.js", "*.css", "models/*.glb", "data/*.json"]),
    (ROOT / "cat", ["*.js", "assets/cat_rigged.glb"]),
]


def stamp() -> dict:
    files = []
    h = hashlib.sha1()
    for base, globs in PATTERNS:
        for pattern in globs:
            for f in sorted(base.glob(pattern)):
                st = f.stat()
                h.update(f"{f.relative_to(ROOT)}|{st.st_size}|{st.st_mtime_ns}".encode())
                rel = f.relative_to(ROOT).as_posix()      # paths as the page (static/pet/index.html) sees them
                files.append("./" + rel[len("pet/"):] if rel.startswith("pet/") else "../" + rel)
    return {"v": h.hexdigest()[:12], "files": files}


def write() -> str:
    data = stamp()
    out = PET / "version.json"
    old = out.read_text(encoding="utf8") if out.exists() else ""
    new = json.dumps(data, indent=0)
    if new != old:
        out.write_text(new, encoding="utf8")
    return data["v"]


if __name__ == "__main__":
    print("version", write())
