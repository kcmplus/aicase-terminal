"""Package the integrated supplier UI, compiled assets and native entry (no keys)."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'supplier-host'
required = ['dist/index.html', 'src/popomo/terminal.js', 'package-lock.json',
            'src-tauri/Cargo.toml', 'src/skins/default/pages/Home.vue']
for name in required:
    if not (source / name).is_file():
        raise SystemExit(f'Missing {name}; run npm run build:supplier first.')

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

commit = git('rev-parse', 'HEAD')
dirty = bool(git('status', '--porcelain'))
version = json.loads((root / 'package.json').read_text())['version']
name = f'aicase-terminal-supplier-display-only-{version}-{commit[:12]}{"-dirty" if dirty else ""}.zip'
output = root / 'release' / name
output.parent.mkdir(exist_ok=True)
excluded = {'node_modules', 'target', 'backup', 'gen', '.git', 'preview-images'}
files = {}
for path in sorted(source.rglob('*')):
    rel = path.relative_to(source)
    if any(part in excluded or part.startswith('.') for part in rel.parts):
        continue
    if path.is_symlink():
        raise SystemExit(f'Unexpected symlink: {rel}')
    if not path.is_file():
        continue
    if path.suffix in {'.key', '.pub', '.log', '.map', '.zip'} or path.name == 'build.ps1':
        raise SystemExit(f'Unexpected sensitive or generated file: {rel}')
    files['phonecase-diy-gy/' + rel.as_posix()] = path.read_bytes()

for name in ['SUPPLIER_HANDOFF.md', 'CLOUD_CONNECTION.md', 'CLOUD_ORDER_FLOW.md']:
    files['phonecase-diy-gy/docs/' + name] = (root / 'docs' / name).read_bytes()
metadata = {
    'package': 'aicase-terminal-supplier', 'version': version,
    'commit': commit, 'local_changes': dirty,
    'built_at': datetime.now(timezone.utc).isoformat(),
    'kind': 'integrated-ui-and-supplier-host-entry',
    'requires_supplier_core': True,
    'terminal_mode': 'display-only; H5 owns customer confirmation',
    'original_supplier_archive': json.loads((source / 'SOURCE.json').read_text()),
    'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
}
files['phonecase-diy-gy/BUILD_INFO.json'] = (json.dumps(metadata, ensure_ascii=False, indent=2) + '\n').encode()
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in files.items():
        archive.writestr(name, data)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    for name, digest in metadata['sha256'].items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == digest
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n')
print(f'Package: {output}\nSHA256: {digest}\nSize: {output.stat().st_size} bytes')
