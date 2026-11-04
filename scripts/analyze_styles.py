"""Decode every frame, measure motion and build chronological review contact sheets."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]

def analyze(path, identifier, output):
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-vf','scale=144:80','-f','rawvideo','-pix_fmt','rgb24','-'])
    frames=np.frombuffer(raw,dtype=np.uint8).reshape(-1,80,144,3)
    assert len(frames)==124,(identifier,len(frames))
    changes=np.abs(np.diff(frames.astype(np.float32),axis=0)).mean(axis=(1,2,3))
    assert np.percentile(changes,90)>.5,(identifier,'static')
    # Rhythmic held frames are intentionally allowed for comic/stop-motion styles.
    page=Image.new('RGB',(144*12,100*11+28),'white');draw=ImageDraw.Draw(page)
    draw.text((8,5),identifier,fill='black')
    for i,frame in enumerate(frames):
        x=(i%12)*144;y=(i//12)*100+28
        page.paste(Image.fromarray(frame),(x,y));draw.text((x+3,y+81),f'{i:03d}  {i/24:.2f}s',fill='black')
    output.mkdir(parents=True,exist_ok=True);page.save(output/(identifier+'-all.jpg'),quality=92)
    chroma=frames.max(axis=3).astype(float)-frames.min(axis=3).astype(float)
    return dict(id=identifier,frames=len(frames),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        adjacent_change_mean=round(float(changes.mean()),4),adjacent_change_p90=round(float(np.percentile(changes,90)),4),
        repeated_frame_pairs=int((changes==0).sum()),mean_chroma=round(float(chroma.mean()),4),
        review_sheet=str((output/(identifier+'-all.jpg')).relative_to(ROOT)))

def main():
    p=argparse.ArgumentParser();p.add_argument('ids',nargs='*');p.add_argument('--final',action='store_true');args=p.parse_args()
    catalog=json.loads((ROOT/'library/styles/catalog.json').read_text());rows=[r for r in catalog['records'] if not args.ids or r['id'] in args.ids]
    report=[]
    for row in rows:
        if args.final:path=ROOT/'library/styles/videos'/row['video']
        else:
            jobs=sorted((ROOT/'.generation/styles/jobs'/row['id']).glob('attempt-*/candidate.mp4'))
            if not jobs:continue
            path=jobs[-1]
        data=analyze(path,row['id'],ROOT/'.generation/styles/review');report.append(data)
        print(row['id'],data['adjacent_change_mean'],flush=True)
    target=ROOT/('docs/style-frame-validation.json' if args.final else '.generation/styles/frame-analysis.json')
    target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
