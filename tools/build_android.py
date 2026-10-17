"""Build and sign the standalone Android APK with Android SDK tools (no Gradle deps)."""
from pathlib import Path
import hashlib,json,os,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist'
def run(args,env):
    subprocess.run([str(a) for a in args],cwd=ROOT,env=env,check=True)
def build():
    paths=ROOT/'.cache'/'android-build'/'paths.json'
    if paths.exists():p=json.loads(paths.read_text());java=Path(p['java']);tools=Path(p['tools']);android=Path(p['android_jar'])
    else:
        java=Path(os.environ['JAVA_HOME'])/'bin';sdk=Path(os.environ['ANDROID_HOME']);tools=sdk/'build-tools'/'35.0.0';android=sdk/'platforms'/'android-35'/'android.jar'
    ext='.exe' if os.name=='nt' else '';env={**os.environ,'JAVA_HOME':str(java.parent),'PATH':str(java)+os.pathsep+os.environ.get('PATH','')}
    stage=ROOT/'.cache'/'android-v2';generated=stage/'generated';classes=stage/'classes';dex=stage/'dex'
    for folder in (stage,generated,classes,dex,OUT):folder.mkdir(parents=True,exist_ok=True)
    src=ROOT/'android';resources=stage/'resources.zip';base=stage/'base.apk'
    run([tools/('aapt2'+ext),'compile','--dir',src/'res','-o',resources],env)
    run([tools/('aapt2'+ext),'link','-o',base,'--manifest',src/'AndroidManifest.xml','-I',android,'--java',generated,resources],env)
    files=[*src.joinpath('src').rglob('*.java'),*generated.rglob('*.java')]
    run([java/('javac'+ext),'-encoding','UTF-8','-source','17','-target','17','-classpath',android,'-d',classes,*files],env)
    run([java/('java'+ext),'-cp',tools/'lib'/'d8.jar','com.android.tools.r8.D8','--min-api','26','--lib',android,'--output',dex,*classes.rglob('*.class')],env)
    unsigned=stage/'unsigned.apk'
    with zipfile.ZipFile(base) as source,zipfile.ZipFile(unsigned,'w',zipfile.ZIP_DEFLATED) as dest:
        for entry in source.infolist():dest.writestr(entry,source.read(entry.filename))
        for entry in dex.glob('*.dex'):dest.write(entry,entry.name)
    aligned=stage/'aligned.apk';run([tools/('zipalign'+ext),'-f','4',unsigned,aligned],env)
    key=ROOT/'.cache'/'android-build'/'personal-signing.p12';key.parent.mkdir(parents=True,exist_ok=True)
    if not key.exists():run([java/('keytool'+ext),'-genkeypair','-keystore',key,'-storepass','android','-keypass','android','-alias','deckdriverstation','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Deck Driver Station Personal Build'],env)
    output=OUT/'DeckDriverStation-2.0.0-Android.apk';signer=tools/'lib'/'apksigner.jar'
    run([java/('java'+ext),'-jar',signer,'sign','--ks',key,'--ks-pass','pass:android','--ks-key-alias','deckdriverstation','--out',output,aligned],env)
    run([java/('java'+ext),'-jar',signer,'verify','--verbose',output],env)
    run([tools/('aapt2'+ext),'dump','badging',output],env)
    with output.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    output.with_name(output.name+'.sha256').write_text(f'{digest}  {output.name}\n')
    print('Android APK ready: '+str(output),flush=True)
if __name__=='__main__':build()
