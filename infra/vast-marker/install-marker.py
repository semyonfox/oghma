"""Install the Marker++ archive into the running venv with pip.

Marker++ resolves with uv and declares `[tool.uv] override-dependencies` where
an upstream cap is wrong (surya-ocr still caps pillow below 11). pip has no
override mechanism, so a plain `pip install archive` fails with
ResolutionImpossible. uv itself cannot be used here because it ignores the
venv's system site packages and would install a second torch over the cu129
build that vLLM uses.

So this mirrors uv's semantics: install the archive without dependencies,
install its other requirements normally, then force the overridden packages.
"""

import subprocess
import sys
import tarfile
import tomllib
from importlib.metadata import requires

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

ARCHIVE = sys.argv[1]
PYPROJECT = "marker-plus-plus/pyproject.toml"


def pip(*args: str) -> None:
    subprocess.run([sys.executable, "-m", "pip", "install", *args], check=True)


with tarfile.open(ARCHIVE) as archive:
    member = archive.extractfile(PYPROJECT)
    if member is None:
        raise SystemExit(f"{PYPROJECT} missing from {ARCHIVE}")
    pyproject = tomllib.load(member)

overrides = [
    Requirement(spec)
    for spec in pyproject.get("tool", {}).get("uv", {}).get("override-dependencies", [])
]
overridden = {canonicalize_name(requirement.name) for requirement in overrides}

pip("--no-deps", ARCHIVE)

remaining = []
for spec in requires("marker-pdf") or []:
    requirement = Requirement(spec)
    # extras are not installed in this image
    if requirement.marker is not None and "extra" in str(requirement.marker):
        continue
    if canonicalize_name(requirement.name) in overridden:
        continue
    remaining.append(str(requirement))

pip(*remaining)
if overrides:
    # --no-deps keeps pip from re-resolving the packages that carry the stale cap
    pip("--no-deps", *(str(requirement) for requirement in overrides))
    print("applied Marker++ overrides:", ", ".join(map(str, overrides)))
