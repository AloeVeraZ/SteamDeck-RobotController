"""Verify the final downloadable artifacts against their checksums and app source."""
import hashlib,json,plistlib,tarfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']
OUT=ROOT/'dist'
def sources():
    yield ROOT/'package.json','package.json'
    for directory in ('src','ui'):
        for f in (ROOT/directory).rglob('*'):
            if f.is_file():yield f,f.relative_to(ROOT).as_posix()
def main():
    names=[f'DeckDriverStation-{VERSION}-SteamDeck.tar.gz',f'DeckDriverStation-{VERSION}-Windows.zip',f'DeckDriverStation-{VERSION}-macOS-arm64.zip',f'DeckDriverStation-{VERSION}-Android.apk']
    sums=[]
    for name in names:
        file=OUT/name
        with file.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
        assert digest==file.with_name(name+'.sha256').read_text().split()[0],name+' checksum mismatch'
        sums.append(f'{digest}  {name}')
        if name.endswith('.tar.gz'):
            prefix=f'DeckDriverStation-{VERSION}-SteamDeck/'
            with tarfile.open(file) as archive:
                for src,relative in sources():assert archive.extractfile(prefix+'app/'+relative).read()==src.read_bytes(),name+': '+relative
                assert archive.getmember(prefix+'install.sh').mode&0o111
                assert archive.getmember(prefix+'runtime/electron').mode&0o111
                assert b'Deck Driver Station.desktop' in archive.extractfile(prefix+'install.sh').read()
        elif name.endswith('.zip'):
            with zipfile.ZipFile(file) as archive:
                is_mac='macOS' in name
                prefix='Deck Driver Station.app/Contents/Resources/app/' if is_mac else f'DeckDriverStation-{VERSION}-Windows/app/'
                for src,relative in sources():assert archive.read(prefix+relative)==src.read_bytes(),name+': '+relative
                if is_mac:
                    assert archive.getinfo('Install-Mac.command').external_attr>>16&0o111
                    assert archive.getinfo('Deck Driver Station.app/Contents/MacOS/Electron').external_attr>>16&0o111
                    info=plistlib.loads(archive.read('Deck Driver Station.app/Contents/Info.plist'))
                    assert info['CFBundleIdentifier']=='dev.deckdriverstation.app'
                else:assert archive.read(f'DeckDriverStation-{VERSION}-Windows/runtime/electron.exe')[:2]==b'MZ'
        else:
            with zipfile.ZipFile(file) as archive:
                assert archive.read('classes.dex')[:4]==b'dex\n'
                assert archive.read('AndroidManifest.xml')
        print('Verified: '+name,flush=True)
    for suffix in ('SteamDeck.run','Windows-Setup.exe'):
        file=OUT/f'DeckDriverStation-{VERSION}-{suffix}'
        with file.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
        assert digest==file.with_name(file.name+'.sha256').read_text().split()[0]
        if suffix.endswith('.exe'):assert file.read_bytes()[:2]==b'MZ'
        else:
            with file.open('rb') as f:
                assert f.readline().startswith(b'#!/usr/bin/env bash')
                for _ in range(100):
                    if f.readline()==b'__ARCHIVE_BELOW__\n':break
                else:raise AssertionError('Self-extracting installer header is missing')
                payload=hashlib.file_digest(f,'sha256').hexdigest()
            assert payload==(OUT/f'DeckDriverStation-{VERSION}-SteamDeck.tar.gz.sha256').read_text().split()[0]
        sums.append(f'{digest}  {file.name}');print('Verified: '+file.name,flush=True)
    (OUT/'SHA256SUMS.txt').write_text('\n'.join(sums)+'\n')
if __name__=='__main__':main()
