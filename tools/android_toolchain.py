"""Fetch verified, workspace-local build dependencies; does not modify PATH/SDK settings."""
from pathlib import Path
import hashlib,json,os,shutil,urllib.request,xml.etree.ElementTree as ET,zipfile
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache'/'android-build'
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'DeckDriverStation-build'})
    return urllib.request.urlopen(req,timeout=120)
def download(url,file,checksum,algorithm):
    if not file.exists():
        print('Downloading '+file.name,flush=True)
        with get(url) as r,file.with_suffix('.part').open('wb') as out:shutil.copyfileobj(r,out)
        file.with_suffix('.part').replace(file)
    with file.open('rb') as data:actual=hashlib.file_digest(data,algorithm).hexdigest()
    if actual!=checksum:raise RuntimeError('Checksum mismatch: '+str(file))
def extract(file,dest):
    dest.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(file) as z:
        for entry in z.infolist():
            if not (dest/entry.filename).resolve().is_relative_to(dest.resolve()):raise RuntimeError('Unsafe archive path')
            z.extract(entry,dest)
def prepare():
    CACHE.mkdir(parents=True,exist_ok=True)
    if os.name!='nt':raise RuntimeError('Use JAVA_HOME and an installed Android SDK on Linux/macOS. This local bootstrap targets Windows.')
    packages=json.load(get('https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows'))
    p=packages[0]['binary']['package'];jdk=CACHE/p['name'];download(p['link'],jdk,p['checksum'],'sha256')
    java_dir=CACHE/'jdk'
    if not list(java_dir.glob('*/bin/javac.exe')):extract(jdk,java_dir)
    manifest=ROOT/'.cache'/'android-repository.xml'
    if not manifest.exists():manifest.write_bytes(get('https://dl.google.com/android/repository/repository2-1.xml').read())
    tree=ET.fromstring(manifest.read_bytes())
    for name,label in [('platforms;android-35','platform'),('build-tools;35.0.0','tools')]:
        package=next(p for p in tree.findall('.//{*}remotePackage') if p.attrib['path']==name)
        archives=package.findall('./{*}archives/{*}archive');a=next(a for a in archives if a.findtext('{*}host-os') in ('windows',None))
        complete=a.find('{*}complete');url=complete.findtext('{*}url');checksum=complete.find('{*}checksum');algorithm=checksum.attrib.get('type','sha1')
        file=CACHE/url.rsplit('/',1)[-1];download('https://dl.google.com/android/repository/'+url,file,checksum.text,algorithm)
        if not (CACHE/label/'complete').exists():extract(file,CACHE/label);(CACHE/label/'complete').touch()
    result={'java':str(next(java_dir.glob('*/bin/javac.exe')).parent),'android_jar':str(next((CACHE/'platform').glob('*/android.jar'))),'tools':str(next((CACHE/'tools').glob('*/aapt2.exe')).parent)}
    (CACHE/'paths.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
if __name__=='__main__':prepare()
