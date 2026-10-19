"""Rasterize the code-native robot mark (ui/icon.svg) for OS icon formats."""
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
def build():
    n=1024;im=Image.new('RGBA',(n,n));d=ImageDraw.Draw(im);scale=n/64
    def box(v):return tuple(round(x*scale) for x in v)
    def dot(x,y,r):d.ellipse(box((x-r,y-r,x+r,y+r)),fill=ink)
    green='#a5f5cc';ink='#0f1a14';width=round(5*scale)
    d.rounded_rectangle((0,0,n-1,n-1),radius=16*scale,fill=green)
    d.rounded_rectangle(box((11.5,19.5,52.5,51.5)),radius=10.5*scale,fill=ink)
    d.rounded_rectangle(box((16.5,24.5,47.5,46.5)),radius=5.5*scale,fill=green)
    d.line(box((32,22,32,15)),fill=ink,width=width);dot(32,15,2.5);dot(32,12,4);dot(25,35.5,3.5);dot(39,35.5,3.5)
    im.save(ROOT/'ui'/'icon.png');im.save(ROOT/'ui'/'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)],bitmap_format='bmp');im.save(ROOT/'ui'/'icon.icns')
if __name__=='__main__':build()
