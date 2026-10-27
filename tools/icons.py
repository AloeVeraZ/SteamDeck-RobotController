"""Rasterize the code-native robot mark (ui/icon.svg) for OS icon formats, and the installer's round mark and sidebar."""
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
GREEN='#a5f5cc';INK='#0f1a14'
def mark(n,round_=False):
    im=Image.new('RGBA',(n,n));d=ImageDraw.Draw(im);scale=n/64
    def box(v):return tuple(round(x*scale) for x in v)
    def dot(x,y,r):d.ellipse(box((x-r,y-r,x+r,y+r)),fill=INK)
    width=round(5*scale)
    if round_:d.ellipse((0,0,n-1,n-1),fill=GREEN)
    else:d.rounded_rectangle((0,0,n-1,n-1),radius=16*scale,fill=GREEN)
    d.rounded_rectangle(box((11.5,19.5,52.5,51.5)),radius=10.5*scale,fill=INK)
    d.rounded_rectangle(box((16.5,24.5,47.5,46.5)),radius=5.5*scale,fill=GREEN)
    d.line(box((32,22,32,15)),fill=INK,width=width);dot(32,15,2.5);dot(32,12,4);dot(25,35.5,3.5);dot(39,35.5,3.5)
    return im
SIZES=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]
def build():
    im=mark(1024)
    im.save(ROOT/'ui'/'icon.png');im.save(ROOT/'ui'/'icon.ico',sizes=SIZES,bitmap_format='bmp');im.save(ROOT/'ui'/'icon.icns')
    # The installer: the same mark in a circle (Setup's own icon and its title bar), and the Welcome/Finish sidebar
    # (164 x 314, as NSIS's Modern UI draws it) with the round mark on the app's dark background.
    mark(1024,True).save(ROOT/'packaging'/'installer.ico',sizes=SIZES,bitmap_format='bmp')
    w,h,s=164,314,4;side=Image.new('RGB',(w*s,h*s),'#151617');d=ImageDraw.Draw(side)
    logo=mark(112*s,True);side.paste(logo,((w*s-logo.width)//2,64*s),logo)
    d.rounded_rectangle(((w//2-18)*s,196*s,(w//2+18)*s,199*s),radius=2*s,fill=GREEN)
    side.resize((w,h),Image.LANCZOS).save(ROOT/'packaging'/'installer-sidebar.bmp')
if __name__=='__main__':build()
