"""
=================
Template Matching
=================

We use template matching to identify the occurrence of an image patch
(in this case, a sub-image centered on a single template). Here, we
return a single match (the exact same template), so the maximum value in the
``match_template`` result corresponds to the template location. The other coins
look similar, and thus have local maxima; if you expect multiple matches, you
should use a proper peak-finding function.

The ``match_template`` function uses fast, normalized cross-correlation [1]_
to find instances of the template in the image. Note that the peaks in the
output of ``match_template`` correspond to the origin (i.e. top-left corner) of
the template.

.. [1] J. P. Lewis, "Fast Normalized Cross-Correlation", Industrial Light and
       Magic.

"""
import numpy as np
import matplotlib.pyplot as plt

from skimage.feature import match_template

from skimage.util import crop

import skimage.io as io

import sys
import os
import glob
import pandas as pd

# test #######
template = io.imread("ref/template.jpg",as_gray=True)
########


def match(file):
    image  = io.imread(file,as_gray=True)
    result = match_template(image, template)
    # size of result is image size - template size ( + 1)
    ij = np.unravel_index(np.argmax(result), result.shape)
    # ij is position of max as tuple
    # corresponds to top left corner of template
    x, y = ij[::-1]
    # get x and y of max position
    print(file,x,y)
    return x,y,image

    fig = plt.figure(figsize=(10, 7.5),dpi=100) # preserve resolution
    ax = plt.subplot(1,1,1)
    ax.imshow(image, cmap=plt.cm.gray)
    ax.set_axis_off()
    ax.set_title('image')
    # highlight matched region
    hcoin, wcoin = template.shape
    rect = plt.Rectangle((x, y), wcoin, hcoin, edgecolor='r', facecolor='none')
    ax.add_patch(rect)
  
    r = fig
    #plt.show()

    return r

##fig = plt.figure(figsize=(8, 3))
##ax1 = plt.subplot(1, 3, 1)
##ax2 = plt.subplot(1, 3, 2)
##ax3 = plt.subplot(1, 3, 3, sharex=ax2, sharey=ax2)
##
##ax1.imshow(template, cmap=plt.cm.gray)
##ax1.set_axis_off()
##ax1.set_title('template')
##
##ax2.imshow(image, cmap=plt.cm.gray)
##ax2.set_axis_off()
##ax2.set_title('image')
### highlight matched region
##hcoin, wcoin = template.shape
##rect = plt.Rectangle((x, y), wcoin, hcoin, edgecolor='r', facecolor='none')
##ax2.add_patch(rect)
##
##ax3.imshow(result)
##ax3.set_axis_off()
##ax3.set_title('`match_template`\nresult')
### highlight matched region
##ax3.autoscale(False)
##ax3.plot(x, y, 'o', markeredgecolor='r', markerfacecolor='none', markersize=10)

tx,ty = template.shape
#root, dirs, files = os.walk("img").send(None)
files = glob.glob("img/20*.jpg")
locs = pd.DataFrame(columns=["file","x","y"])
for f in files:
    x,y,img = match(f)
    #locs=locs.append({"file":f,"x":x,"y":y,"img":img},ignore_index=True)
    # don't safe image, we'll load it later again in color
    locs=locs.append({"file":f,"x":x,"y":y},ignore_index=True)
    # save image shape for later
    imgX = img.shape[1]
    imgY = img.shape[0]
    #break

locs.sort_values(by="file",inplace=True)

# we have the list of the files and the template positions
# note, image shape is Y/X 
minX = int(locs.x.min())
maxX = int(locs.x.max())
minY = int(locs.y.min())
maxY = int(locs.y.max())

cropX = 1*(maxX - minX)
cropY = 1*(maxY - minY)

print("Borders:",minX,maxX,minY,maxY)
print("Crop:",cropX,cropY)

idx = 0
for t in locs.itertuples():
    image  = io.imread(t.file,as_gray=False)
    cl = int(t.x - minX)# + cropX//2
    cr = int(cropX - cl)# + cropX//2
    ct = int(t.y - minY)# + cropY//2
    cb = int(cropY - ct)# + cropY//2
    img = crop(image,((ct,cb),(cl,cr),(0,0),))
    fn = t.file.split("/")[-1]   
    io.imsave("/".join(["out",fn]),img)
    fn = fn.split(".")
    fn = f"img_{idx:03}.{fn[1]}"
    idx +=1
    io.imsave("/".join(["out",fn]),img)
    
# https://en.wikibooks.org/wiki/FFMPEG_An_Intermediate_Guide/image_sequence#Slideshow_with_crossfading_between_the_pictures
# ffmpeg -r 1/5 -i out/img_%03d.jpg -c:v libx264 -vf fps=25 -pix_fmt yuv420p out.mp4
# with fading:
# ffmpeg -i out/img_%03d.jpg -c:v libx264 -vf zoompan=d=5:fps=2,framerate=25:interp_start=0:interp_end=255:scene=100  -pix_fmt yuv420p out.mp4
