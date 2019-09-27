
#!/usr/bin/env python3

# by sfillat 2019-09-27
# use ffmpeg to convert movie files to animated GIFs

# add testing for the right infile file formats .mov, .mp4 etc.

"""Make GIFs.

Usage:
    mov2gif.py [-d] [-h] INFILE

Use ffmpeg to convert movie files to animated GIFs

Arguments:
    INFILE      your movie file

Options:
    -h --help               show this help message and exit
	-d --dryrun				don't run the command
"""

import sys, os
from docopt import docopt

if __name__ == "__main__":

	arguments = docopt(__doc__, version='0.1')

	#infile=sys.argv[1]
	infile=(arguments['INFILE'])

	inbase = os.path.splitext(infile)

	outfile=inbase[0] + ".gif"

	myCmd="/usr/local/bin/ffmpeg -i %s -vf \"fps=24,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse\" -loop 1 %s"%(infile, outfile)


	
	if (arguments['-d']):
		print("not doing anything, but here's your command:")
		print(myCmd)
	else:
		print(myCmd)
		os.system(myCmd)
