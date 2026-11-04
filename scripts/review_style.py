"""Probe/review candidates. Acceptance is explicit, with a recorded visual review note."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from PIL import Image, ImageDraw
from generate_styles import validate_comparison

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.generation'/'styles'

def probe(path):
    data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
    streams=data['streams']
    assert len(streams)==1 and streams[0]['codec_type']=='video', 'Expected a silent video'
    stream=streams[0]
    assert stream['codec_name']=='h264' and stream['pix_fmt']=='yuv420p'
    assert (stream['width'],stream['height'])==(576,320)
    assert stream['r_frame_rate']=='24/1'
    assert 5<=float(data['format']['duration'])<=10
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True,stdout=subprocess.DEVNULL)
    return dict(width=576,height=320,fps=24,duration=float(data['format']['duration']),frames=int(stream['nb_frames']),codec='h264',pixel_format=stream['pix_fmt'],audio=False)

def sheets(path,folder):
    folder.mkdir(parents=True,exist_ok=True)
    # Every frame is included, grouped chronologically for temporal/geometry inspection.
    framefolder=folder/'frames';framefolder.mkdir(exist_ok=True)
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-vf','scale=192:-1','-y',str(framefolder/'%04d.jpg')],check=True)
    files=sorted(framefolder.glob('*.jpg'))
    for start in range(0,len(files),60):
        page=Image.new('RGB',(192*10,132*6),'#ffffff'); draw=ImageDraw.Draw(page)
        for index,file in enumerate(files[start:start+60]):
            x=(index%10)*192;y=(index//10)*132
            with Image.open(file) as frame:page.paste(frame,(x,y))
            draw.text((x+5,y+108),f'frame {start+index:03d}   {(start+index)/24:.2f}s',fill='#333333')
        page.save(folder/f'all-frames-{start//60+1}.jpg',quality=92)
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-vf','fps=1.5,scale=384:-1,tile=4x3','-frames:v','1','-y',str(folder/'overview.jpg')],check=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('ids',nargs='+')
    parser.add_argument('--attempt',type=int,default=1)
    parser.add_argument('--accept',action='store_true')
    parser.add_argument('--notes')
    args=parser.parse_args()
    catalogfile=ROOT/'library/styles/catalog.json'
    payload=json.loads(catalogfile.read_text())
    for id in args.ids:
        row=next(r for r in payload['records'] if r['id']==id)
        job=WORK/'jobs'/id/f'attempt-{args.attempt:02d}'
        path=job/'candidate.mp4'
        metadata=probe(path)
        assert metadata['frames']==row['planned_frames'],(id,metadata)
        if not args.accept:sheets(path,job/'review')
        else:
            assert args.notes and args.notes.strip(),'Record actual visual review notes'
            graph=json.loads((job/'api.json').read_text())
            profile=json.loads((ROOT/'library/styles/profile.json').read_text())
            assert graph['5']['inputs']['noise_seed']==profile['seed']
            assert graph['4']['inputs']['prompt']==profile['base_prompt_en']+'\n\n'+row['prompt_en']
            assert metadata['frames']==124
            validate_comparison(graph,row,profile)
            target=ROOT/'library/styles/videos'/f'{id}.mp4'
            target.parent.mkdir(parents=True,exist_ok=True)
            encoding = ['-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-an']
            subprocess.run(['ffmpeg','-v','error','-i',str(path),*encoding,'-movflags','+faststart','-y',str(target)],check=True)
            poster=ROOT/'library/styles/posters'/f'{id}.jpg'
            poster.parent.mkdir(parents=True,exist_ok=True)
            subprocess.run(['ffmpeg','-v','error','-ss','1.5','-i',str(target),'-frames:v','1','-q:v','2','-y',str(poster)],check=True)
            folder=ROOT/'example_workflows/styles';folder.mkdir(parents=True,exist_ok=True)
            shutil.copy(job/'api.json',folder/f'{id}.api.json')
            row.update(metadata,status='ready',video=target.name,poster=poster.name)
            row['generation']={'seed':graph['5']['inputs']['noise_seed'],'model':graph['1']['inputs']['unet_name'], 'steps':graph['7']['inputs']['steps'],'sampler':graph['6']['inputs']['sampler_name'],'scheduler':graph['7']['inputs']['scheduler'],'cfg':1,'workflow':f'example_workflows/styles/{id}.api.json','video_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'review_notes_zh':args.notes}
            row['generation'].update(base_prompt_sha256=profile['base_prompt_sha256'], style_prompt_en=row['prompt_en'], style_prompt_zh=row['prompt_zh'], candidate_sha256=hashlib.sha256(path.read_bytes()).hexdigest(), encoding=profile['encoding'], review_method='Chronological frame contact sheets, decoded motion analysis and visual style comparison', attempt=args.attempt)
            row['example_prompt_en']=graph['4']['inputs']['prompt']
        print(id,json.dumps(metadata), 'accepted' if args.accept else 'review sheets prepared')
    if args.accept:catalogfile.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
