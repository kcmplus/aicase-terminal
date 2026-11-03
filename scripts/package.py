"""Package the compiled frontend only (Python 3 standard library)."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
if not (dist / 'index.html').is_file():
    raise SystemExit('Missing dist/index.html. Run npm run build first.')

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

commit = git('rev-parse', 'HEAD')
dirty = bool(git('status', '--porcelain'))
version = json.loads((root / 'package.json').read_text())['version']
name = f'aicase-terminal-web-{version}-{commit[:12]}{"-dirty" if dirty else ""}.zip'
output = root / 'release' / name
output.parent.mkdir(exist_ok=True)
files = []
for path in sorted(dist.rglob('*')):
    rel = path.relative_to(dist)
    if path.is_symlink():
        raise SystemExit(f'Unexpected symlink in dist: {rel}')
    if path.is_file() and rel.parts[0] != 'preview-images':
        if any(part.startswith('.') for part in rel.parts) or path.suffix == '.map':
            raise SystemExit(f'Unexpected hidden/source-map file in dist: {rel}')
        files.append((path, rel.as_posix()))
metadata = {
    'package': 'aicase-terminal-web', 'version': version, 'commit': commit,
    'local_changes': dirty, 'built_at': datetime.now(timezone.utc).isoformat(),
    'kind': 'frontend-assets-for-supplier-tauri-host',
    'sha256': {rel: hashlib.sha256(path.read_bytes()).hexdigest() for path, rel in files},
}
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path, rel in files:
        archive.write(path, rel)
    archive.writestr('BUILD_INFO.json', json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    archive.writestr('INTEGRATION.txt',
        'Unzip into a dedicated frontend directory. Point the supplier Tauri build.frontendDist to it.\n'
        'This is a compiled HTML/CSS/JS frontend, not a standalone application or installer.\n'
        'The supplier must provide Rust commands, event permissions, scoped image access, and packaging.\n'
        'The terminal UI is read-only. Business payment/arrival verification still needs integration.\n'
        'If VITE_STOREFRONT_URL was not set at build time, configure the host h5_base_url.\n')
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'index.html' in archive.namelist()
digest = hashlib.sha256(output.read_bytes()).hexdigest()
print(f'Package: {output}\nSHA256: {digest}\nSize: {output.stat().st_size} bytes')
if os.environ.get('GITHUB_OUTPUT'):
    with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
        stream.write(f'path={output.relative_to(root).as_posix()}\nname={output.name}\nsha256={digest}\n')
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
        stream.write(f'## Frontend package\n\n`{name}`\n\nSHA256: `{digest}`\n\n'
                     'Download the ZIP from this run’s Artifacts. This package requires the supplier Tauri host.\n')
