"""Portable Linux, Windows, and macOS bundles, using verified Electron runtimes."""
from __future__ import annotations
import argparse,hashlib,io,json,os,plistlib,shutil,stat,tarfile,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
META=json.loads((ROOT/'package.json').read_text());VERSION=META['version'];ELECTRON=META['devDependencies']['electron']
CACHE=ROOT/'.cache';OUT=ROOT/'dist';BASE=f'https://github.com/electron/electron/releases/download/v{ELECTRON}'
def download(url,dest):
    if dest.exists():return
    print('Downloading '+dest.name,flush=True)
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'DeckDriverStation-build'}),timeout=120) as r,dest.with_suffix('.part').open('wb') as f:shutil.copyfileobj(r,f)
    dest.with_suffix('.part').replace(dest)
def runtime_archive(target):
    CACHE.mkdir(exist_ok=True);name=f'electron-v{ELECTRON}-{target}.zip';archive=CACHE/name;manifest=CACHE/f'SHASUMS256-{ELECTRON}.txt'
    download(BASE+'/SHASUMS256.txt',manifest);download(BASE+'/'+name,archive)
    sums={p[1].lstrip('*'):p[0] for line in manifest.read_text().splitlines() if len(p:=line.split())==2}
    with archive.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    if digest!=sums.get(name):raise RuntimeError('Electron checksum mismatch: '+name)
    return archive
def runtime(target):
    archive=runtime_archive(target);dest=CACHE/f'runtime-{target}-{ELECTRON}';executable='electron.exe' if target.startswith('win32') else 'electron'
    if not (dest/executable).exists():
        dest.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as z:
            for e in z.infolist():
                if not (dest/e.filename).resolve().is_relative_to(dest.resolve()):raise RuntimeError('Unsafe archive path')
                z.extract(e,dest)
                if os.name!='nt' and (dest/e.filename).is_file():(dest/e.filename).chmod((e.external_attr>>16)&0o777 or 0o644)
    return dest
def app_files():
    yield ROOT/'package.json','package.json'
    for folder in ('src','ui'):
        for file in sorted((ROOT/folder).rglob('*')):
            if file.is_file():yield file,file.relative_to(ROOT).as_posix()
def finish(file):
    with file.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    file.with_name(file.name+'.sha256').write_text(f'{digest}  {file.name}\n');print('Ready: '+str(file),flush=True)
def linux():
    source=runtime('linux-x64');name=f'DeckDriverStation-{VERSION}-SteamDeck';file=OUT/(name+'.tar.gz')
    def permissions(e):
        e.uid=e.gid=0;e.uname=e.gname='';e.mode=0o755 if e.isdir() or Path(e.name).name in ('electron','chrome_crashpad_handler','chrome-sandbox','launch.sh','install.sh') else 0o644;return e
    with tarfile.open(file,'w:gz',compresslevel=6) as t:
        t.add(source,arcname=name+'/runtime',filter=permissions)
        for src,relative in app_files():t.add(src,arcname=name+'/app/'+relative,filter=permissions)
        for script in ('launch.sh','install.sh'):
            data=(ROOT/'packaging'/script).read_text().replace('\r\n','\n').encode();e=tarfile.TarInfo(name+'/'+script);e.mode=0o755;e.size=len(data);t.addfile(e,io.BytesIO(data))
        for doc in ('QUICKSTART.md','COMPATIBILITY.md','VALIDATION.md','UPDATES.md'):t.add(ROOT/'docs'/doc,arcname=name+'/'+doc,filter=permissions)
    with tarfile.open(file) as t:
        assert t.getmember(name+'/runtime/electron').mode&stat.S_IXUSR
        assert t.getmember(name+'/install.sh').mode&stat.S_IXUSR
    finish(file)
def windows():
    archive=runtime_archive('win32-x64');name=f'DeckDriverStation-{VERSION}-Windows';file=OUT/(name+'.zip')
    with zipfile.ZipFile(file,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        with zipfile.ZipFile(archive) as source:
            for e in source.infolist():z.writestr(name+'/runtime/'+e.filename,source.read(e.filename))
        for src,relative in app_files():z.write(src,name+'/app/'+relative)
        for script in ('Install-Windows.ps1','Install-Windows.cmd','Launch-Windows.cmd'):z.write(ROOT/'packaging'/script,name+'/'+script)
        z.write(ROOT/'docs'/'QUICKSTART.md',name+'/QUICKSTART.md')
        z.write(ROOT/'docs'/'UPDATES.md',name+'/UPDATES.md')
    finish(file)
def mac(arch):
    archive=runtime_archive('darwin-'+arch);bundle='Deck Driver Station.app';file=OUT/f'DeckDriverStation-{VERSION}-macOS-{arch}.zip'
    with zipfile.ZipFile(file,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        with zipfile.ZipFile(archive) as original:
            for e in original.infolist():
                if '/_CodeSignature/' in e.filename or e.filename.endswith('/_CodeSignature/'):continue
                name=e.filename.replace('Electron.app',bundle,1) if e.filename.startswith('Electron.app') else 'Runtime licenses/'+e.filename;data=original.read(e.filename)
                if e.filename=='Electron.app/Contents/Info.plist':
                    p=plistlib.loads(data);p.update(CFBundleName='Deck Driver Station',CFBundleDisplayName='Deck Driver Station',CFBundleIdentifier='dev.deckdriverstation.app',CFBundleShortVersionString=VERSION,CFBundleVersion=VERSION,CFBundleIconFile='deck.icns',NSLocalNetworkUsageDescription='Connect to the robot websites you select on your local Wi-Fi network.');data=plistlib.dumps(p)
                info=zipfile.ZipInfo(name,e.date_time);info.external_attr=e.external_attr;info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
        for src,relative in app_files():
            info=zipfile.ZipInfo(bundle+'/Contents/Resources/app/'+relative);info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,src.read_bytes())
        z.write(ROOT/'ui'/'icon.icns',bundle+'/Contents/Resources/deck.icns');z.write(ROOT/'docs'/'QUICKSTART.md','QUICKSTART.md')
        z.write(ROOT/'docs'/'UPDATES.md','UPDATES.md')
        info=zipfile.ZipInfo('Install-Mac.command');info.create_system=3;info.external_attr=0o100755<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,(ROOT/'packaging'/'Install-Mac.command').read_text().replace('\r\n','\n'))
    with zipfile.ZipFile(file) as z:
        assert z.getinfo(bundle+'/Contents/MacOS/Electron').external_attr>>16&0o111
        assert plistlib.loads(z.read(bundle+'/Contents/Info.plist'))['CFBundleIdentifier']=='dev.deckdriverstation.app'
    finish(file)
def main():
    p=argparse.ArgumentParser();p.add_argument('--target',choices=['steamdeck','windows','macos-arm64','all'],default='steamdeck');p.add_argument('--runtime-only',choices=['linux-x64','win32-x64']);p.add_argument('--fetch-only',choices=['darwin-arm64']);args=p.parse_args();OUT.mkdir(exist_ok=True)
    if args.runtime_only:print(runtime(args.runtime_only));return
    if args.fetch_only:print(runtime_archive(args.fetch_only));return
    if args.target in ('steamdeck','all'):linux()
    if args.target in ('windows','all'):windows()
    if args.target in ('macos-arm64','all'):mac('arm64')
if __name__=='__main__':main()
