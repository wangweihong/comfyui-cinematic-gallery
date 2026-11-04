"""Generate fixed-seed style candidates; never accept without review."""
import argparse
import copy
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.generation' / 'styles'
BASE = 'http://127.0.0.1:8188'

def api(path, data=None):
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(BASE + path, data=body, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def write(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def workflow(record, seed=202611040001):
    graph={
      '1':{'class_type':'UNETLoader','inputs':{'unet_name':'minmaxh3/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors','weight_dtype':'default'}},
      '2':{'class_type':'CLIPLoader','inputs':{'clip_name':'text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors','type':'minimax','device':'default'}},
      '3':{'class_type':'VAELoader','inputs':{'vae_name':'vae/minimax_h3_video_vae_int8_convrot.safetensors'}},
      '4':{'class_type':'MiniMaxH3ReferenceToVideo','inputs':{'clip':['2',0],'vae':['3',0],'prompt':record['example_prompt_en'],'width':576,'height':320,'length':record['planned_frames'],'ref_image_size':'match'}},
      '5':{'class_type':'RandomNoise','inputs':{'noise_seed':seed}},
      '6':{'class_type':'KSamplerSelect','inputs':{'sampler_name':'er_sde'}},
      '7':{'class_type':'BasicScheduler','inputs':{'model':['1',0],'scheduler':'simple','steps':16,'denoise':1.0}},
      '8':{'class_type':'BasicGuider','inputs':{'model':['1',0],'conditioning':['4',0]}},
      '9':{'class_type':'SamplerCustomAdvanced','inputs':{'noise':['5',0],'guider':['8',0],'sampler':['6',0],'sigmas':['7',0],'latent_image':['4',1]}},
      '10':{'class_type':'VAEDecode','inputs':{'samples':['9',0],'vae':['3',0]}},
      '11':{'class_type':'CreateVideo','inputs':{'images':['10',0],'fps':24.0,'bit_depth':'auto','color_space':'sRGB','codec':'none'}},
      '12':{'class_type':'SaveVideo','inputs':{'video':['11',0],'filename_prefix':'cinematic_gallery/styles/'+record['id'],'format':'mp4','format.codec':'h264','format.codec.encoding':'auto'}},
    }
    purposes=['加载本地H3参考视频模型','加载H3文本编码器','加载视频VAE','编码完整示例并创建低分辨率视频潜空间','设置可复现随机种子','选择ER-SDE采样器','设置16步完整采样','使用单条件引导','生成固定场景艺术风格帧序列','解码视频画面','组装24fps无声视频','保存艺术风格候选素材']
    for (key,node),purpose in zip(graph.items(),purposes):
        node['_meta']={'title':node['class_type']+' - '+purpose}
    return graph

def validate_comparison(graph, record, profile):
    """Fail before submission/acceptance if anything but style/path/title has drifted."""
    expected=copy.deepcopy(profile['workflow_template'])
    actual=copy.deepcopy(graph)
    expected['4']['inputs']['prompt']=profile['base_prompt_en']+'\n\n'+record['prompt_en']
    for data in (expected,actual):
        data['12']['inputs']['filename_prefix']='OUTPUT'
        for node in data.values():node.pop('_meta',None)
    if actual!=expected:raise ValueError('Fixed style-comparison workflow parameters have changed')
    if any(not node.get('_meta',{}).get('title','').startswith(node['class_type']+' - ') for node in graph.values()):
        raise ValueError('Workflow titles must retain the original node name and Chinese purpose')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('ids',nargs='*')
    parser.add_argument('--attempt',type=int,default=1)
    parser.add_argument('--all',action='store_true',help='Generate all 74 fixed-seed candidates instead of the six calibrations')
    args=parser.parse_args()
    if args.all and args.ids: parser.error('--all cannot be combined with explicit IDs')
    if args.attempt<1: parser.error('--attempt must be positive')
    payload=json.loads((ROOT/'library/styles/catalog.json').read_text())
    records={r['id']:r for r in payload['records']}
    ids=args.ids or [r['id'] for r in payload['records'] if args.all or r['first_batch']]
    for index,id in enumerate(ids):
        row=records[id]
        folder=WORK/'jobs'/id/f'attempt-{args.attempt:02d}'
        jobfile=folder/'submission.json'
        candidate=folder/'candidate.mp4'
        if candidate.exists():
            print(id,'candidate already downloaded',flush=True);continue
        if not jobfile.exists():
            queue=api('/queue')
            # One task at a time. Do not enqueue over someone else's active work.
            while queue['queue_running'] or queue['queue_pending']:
                print('Waiting for idle ComfyUI queue',flush=True);time.sleep(10);queue=api('/queue')
            seed=202611040001
            profile=json.loads((ROOT/'library/styles/profile.json').read_text())
            import hashlib
            assert hashlib.sha256(profile['base_prompt_en'].encode()).hexdigest()==profile['base_prompt_sha256']
            assert row['example_prompt_en']==profile['base_prompt_en']+'\n\n'+row['prompt_en']
            graph=workflow(row,seed)
            validate_comparison(graph,row,profile)
            write(folder/'api.json',graph)
            try: submission=api('/prompt',{'prompt':graph,'client_id':'cinematic-gallery-fixed-style-generation'})
            except urllib.error.HTTPError as exc:
                print(exc.read().decode(),flush=True);raise
            write(jobfile,submission)
            print(id,'submitted',submission['prompt_id'],flush=True)
        submission=json.loads(jobfile.read_text())
        prompt_id=submission['prompt_id']
        started=time.monotonic()
        last_note=0
        while True:
            history=api('/history/'+prompt_id)
            if prompt_id in history:
                result=history[prompt_id];write(folder/'history.json',result)
                if result.get('status',{}).get('status_str')=='error':
                    raise RuntimeError(id+': '+json.dumps(result['status'],ensure_ascii=False))
                outputs=result.get('outputs',{})
                files=[f for output in outputs.values() for group in ('images','gifs','videos') for f in output.get(group,[]) if f.get('filename','').endswith('.mp4')]
                if not files: raise RuntimeError('No saved MP4: '+str(outputs))
                file=files[0]
                with urllib.request.urlopen(BASE+'/view?'+urllib.parse.urlencode({k:file[k] for k in ('filename','subfolder','type')}),timeout=120) as response:
                    candidate.write_bytes(response.read())
                print(id,'downloaded',candidate.stat().st_size,'bytes',flush=True)
                break
            if time.monotonic()-started-last_note>30:
                last_note=time.monotonic()-started
                print(id,'running',round(last_note),'seconds',flush=True)
            time.sleep(3)
if __name__=='__main__':main()
