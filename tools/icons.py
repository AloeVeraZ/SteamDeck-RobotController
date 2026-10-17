"""Rasterize the existing code-native robot mark for OS icon formats."""
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
def build():
    n=1024;im=Image.new('RGBA',(n,n));d=ImageDraw.Draw(im);scale=n/64
    def box(v):return tuple(round(x*scale) for x in v)
    green='#a5f5cc';ink='#16271f';width=round(4*scale)
    d.rounded_rectangle((0,0,n-1,n-1),radius=18*scale,fill=green)
    d.rounded_rectangle(box((14,20,50,48)),radius=8*scale,outline=ink,width=width)
    for line in [(32,20,32,12),(24,48,24,53),(40,48,40,53),(9,29,9,40),(55,29,55,40),(25,30,25,37),(39,30,39,37),(27,42,37,42)]:
        coords=box(line);d.line(coords,fill=ink,width=width)
        for x,y in [(coords[0],coords[1]),(coords[2],coords[3])]:d.ellipse((x-width/2,y-width/2,x+width/2,y+width/2),fill=ink)
    im.save(ROOT/'ui'/'icon.png');im.save(ROOT/'ui'/'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)],bitmap_format='bmp');im.save(ROOT/'ui'/'icon.icns')
if __name__=='__main__':build()
