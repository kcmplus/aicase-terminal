"""Validate an existing CI artifact before publishing its unchanged bytes."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import zipfile


def select_artifact(run, artifacts, repository, run_id):
    if (str(run['id']) != run_id or run['repository']['full_name'] != repository
            or run['head_repository']['full_name'] != repository
            or run['path'] != '.github/workflows/build-terminal.yml'
            or run['event'] != 'push' or run['head_branch'] != 'main'
            or run['status'] != 'completed' or run['conclusion'] != 'success'):
        raise ValueError('Choose a successful main push run of Build supplier integration package.')
    commit = run['head_sha']
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Invalid source commit.')
    candidates = [a for a in artifacts['artifacts'] if re.fullmatch(
        r'aicase-terminal-supplier-display-only-[0-9A-Za-z.+-]+-' + commit[:12] + r'\.zip', a['name'])]
    if len(candidates) != 1:
        raise ValueError('Expected exactly one supplier ZIP for the source commit.')
    artifact = candidates[0]
    if artifact['expired'] or not re.fullmatch(r'sha256:[0-9a-f]{64}', artifact.get('digest') or ''):
        raise ValueError('Artifact expired or has no SHA256 digest; build again.')
    if (str(artifact['workflow_run']['id']) != run_id
            or artifact['workflow_run']['head_sha'] != commit):
        raise ValueError('Artifact does not belong to the selected build.')
    return dict(artifact_id=artifact['id'], artifact_name=artifact['name'],
                sha256=artifact['digest'].removeprefix('sha256:'), commit=commit)


def verify_zip(path, expected_sha256, commit):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError('ZIP SHA256 differs from the original Actions artifact.')
    with zipfile.ZipFile(path) as archive:
        info = json.loads(archive.read('phonecase-diy-gy/BUILD_INFO.json'))
        if (info['commit'] != commit or info['local_changes'] is not False
                or info['kind'] != 'integrated-ui-and-supplier-host-entry'):
            raise ValueError('ZIP metadata does not match the clean source build.')
        version = info['version']
        if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?', version):
            raise ValueError('Invalid package version.')
        if path.name != f'aicase-terminal-supplier-display-only-{version}-{commit[:12]}.zip':
            raise ValueError('ZIP name differs from its build metadata.')
        if archive.testzip() is not None:
            raise ValueError('Corrupt ZIP.')
    return version


def main():
    temporary = Path(os.environ['RUNNER_TEMP'])
    if sys.argv[1] == 'select':
        result = select_artifact(
            json.loads((temporary / 'source-run.json').read_text()),
            json.loads((temporary / 'source-artifacts.json').read_text()),
            os.environ['GH_REPO'], os.environ['SOURCE_RUN_ID'])
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            for key, value in result.items():
                stream.write(f'{key}={value}\n')
    elif sys.argv[1] == 'verify':
        commit = os.environ['SOURCE_COMMIT']
        digest = os.environ['EXPECTED_SHA256']
        version = verify_zip(Path('release') / os.environ['ARTIFACT_NAME'], digest, commit)
        source = (f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GH_REPO']}"
                  f"/actions/runs/{os.environ['SOURCE_RUN_ID']}")
        notes = Path('docs/RELEASE_NOTES.md').read_text()
        notes += (f"\n\nRelease tag: {os.environ['RELEASE_TAG']}\n\n"
                  f'Original package version: {version}\n\n'
                  '本次直接发布已有构建；ZIP 字节、文件名和包内版本保持不变，'
                  'Release 标签是交付批次标识，不代表重新编译或更新包内版本。\n\n'
                  f'Source build: {source}\n\nCommit: {commit}\n\nSHA256: {digest}\n')
        (temporary / 'existing-release-notes.md').write_text(notes)
    else:
        raise ValueError('Expected select or verify.')


if __name__ == '__main__':
    main()
