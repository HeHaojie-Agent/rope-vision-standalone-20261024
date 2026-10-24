import {PoseJumpCounter,countAt} from './counter.js?v=20261024-missfix';
const $=id=>document.getElementById(id), video=$('source'),canvas=$('view'),ctx=canvas.getContext('2d'),signal=$('signal');
const STEP=1/60, edges=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32]];
const makeCounter=()=>new PoseJumpCounter(+$('sensitivity').value,$('jumpMode').value);
let model,modelPromise,modelTick=0,objectURL,loaded=false,loading=false,playing=false,busy=false,target=null,current=0,frames=[],counter=makeCounter(),roi=null,cropping=false,cropStart=null,cropEnd=null,lastCount=0,fileName='',lastEventCount=-1;
export const getDiagnostics=()=>({samplingHz:60,mode:$('jumpMode').value,model:$('modelQuality').value,events:counter.events,frames});
const sourceCanvas=document.createElement('canvas'),sourceCtx=sourceCanvas.getContext('2d');
const fmt=(t,cent=true)=>{t=Math.max(0,t||0);return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`+(cent?'.'+String(Math.floor(t%1*100)).padStart(2,'0'):'');};
const message=(text,error=false)=>{$('messageText').textContent=text;$('message').classList.toggle('error',error);};
const status=text=>$('videoStatus').textContent=text;
async function ensureModel(){
 if(model)return model;if(modelPromise)return modelPromise;
 status('加载识别模型…');message('正在加载本地识别模型，首次启动需要几秒钟。');
 modelPromise=(async()=>{const {FilesetResolver,PoseLandmarker}=await import('./vendor/vision_bundle.js');const wasm=await FilesetResolver.forVisionTasks('./vendor/wasm');const options={baseOptions:{modelAssetPath:`./vendor/pose_landmarker_${$('modelQuality').value}.task`,delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55};try{model=await PoseLandmarker.createFromOptions(wasm,options);}catch(e){options.baseOptions.delegate='CPU';model=await PoseLandmarker.createFromOptions(wasm,options);}return model;})().catch(e=>{modelPromise=null;throw e;});return modelPromise;
}
function stop(){playing=false;target=null;updateControls();}
function updateControls(){
 $('play').textContent=(playing||target!=null)?'Ⅱ':'▶';$('play').setAttribute('aria-label',(playing||target!=null)?'暂停识别':'开始或继续识别');
 $('play').disabled=!loaded||loading||cropping;$('restart').disabled=!loaded||loading;$('crop').disabled=!loaded||loading;$('recount').disabled=!loaded||loading;
 document.body.classList.toggle('busy',busy);
}
function waitIdle(){return new Promise(resolve=>{const check=()=>busy?setTimeout(check,25):resolve();check();});}
function resetModelTracking(){model?.close();model=null;modelPromise=null;}
async function loadFile(file){
 if(!file||loading)return;if(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v|avi)$/i.test(file.name)){message('请选择视频文件（MP4、MOV 或 WebM）。',true);return;}
 stop();loading=true;updateControls();await waitIdle();resetModelTracking();cropping=false;$('cropHint').hidden=true;
 if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(file);loaded=false;frames=[];counter=makeCounter();current=0;roi=null;lastEventCount=-1;fileName=file.name;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clean();reject(Error('视频读取超时'));},15000);const clean=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',ok);video.removeEventListener('error',bad);};const ok=()=>{clean();resolve();};const bad=()=>{clean();reject(Error('浏览器无法解码此视频，请转换为 H.264 编码的 MP4 后重试。'));};video.addEventListener('loadeddata',ok);video.addEventListener('error',bad);video.src=objectURL;video.load();});
  if(!Number.isFinite(video.duration)||!video.videoWidth)throw Error('无法读取视频时长，请选择完整的视频文件。');
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;loaded=true;canvas.hidden=false;$('empty').hidden=true;$('stageTop').hidden=false;
  $('timeline').max=Math.max(0,video.duration-.001);$('timeline').disabled=false;$('filename').textContent=file.name;$('filemeta').textContent=`${(file.size/1024/1024).toFixed(1)} MB · ${fmt(video.duration,false)}`;$('resolution').textContent=`${video.videoWidth} × ${video.videoHeight}`;$('roiLabel').textContent='整个画面 · 单人识别';$('crop').textContent='框选';
  render(null,0);status('就绪');message('视频已就绪。点击 ▶ 开始逐帧识别；多人画面或展示录像请先框选跳绳者。');
 }catch(e){canvas.hidden=true;$('empty').hidden=false;$('stageTop').hidden=true;$('timeline').disabled=true;status('导入失败');message(e.message,true);}
 finally{loading=false;updateControls();$('file').value='';}
}
function seek(t){return new Promise((resolve,reject)=>{
 t=Math.min(Math.max(0,t),Math.max(0,video.duration-.001));if(Math.abs(video.currentTime-t)<.0001&&video.readyState>=2)return resolve();
 const timer=setTimeout(()=>{clean();reject(Error('读取视频帧超时，请重试或使用 H.264 MP4 视频。'));},10000);
 const clean=()=>{clearTimeout(timer);video.removeEventListener('seeked',ok);video.removeEventListener('error',bad);};const ok=()=>{clean();resolve();};const bad=()=>{clean();reject(Error('读取视频帧失败'));};video.addEventListener('seeked',ok);video.addEventListener('error',bad);video.currentTime=t;
});}
function infer(t){
 const r=roi||{x:0,y:0,w:1,h:1},w=video.videoWidth,h=video.videoHeight;
 sourceCanvas.width=Math.min(640,Math.round(w*r.w));sourceCanvas.height=Math.max(1,Math.round(sourceCanvas.width*h*r.h/(w*r.w)));
 sourceCtx.drawImage(video,r.x*w,r.y*h,r.w*w,r.h*h,0,0,sourceCanvas.width,sourceCanvas.height);
 const result=model.detectForVideo(sourceCanvas,modelTick+=STEP*1000);const local=result.landmarks[0];
 const landmarks=local?local.map(p=>({x:r.x+p.x*r.w,y:r.y+p.y*r.h,visibility:Math.min(p.visibility??0,p.presence??1)})):null;
 const motion=counter.update(t,landmarks);return {time:t,landmarks,...motion,validRatio:counter.validFrames/counter.frames};
}
async function pump(){
 if(busy||!loaded||cropping)return;busy=true;updateControls();
 try{
  if(!model&&(playing||(target!=null&&target>=frames.length))){await ensureModel();if(!playing&&target==null)return;}
  const last=Math.round(Math.max(0,video.duration-.001)/STEP);
  while(playing||target!=null){
   const start=performance.now(),requested=target;
   let index=requested!=null?(requested<frames.length?requested:frames.length):(frames.length===0?0:current+1);
   index=Math.min(index,last);await seek(Math.min(index*STEP,video.duration-.001));
   if(index>=frames.length){if(!model)await ensureModel();frames.push(infer(Math.min(index*STEP,video.duration-.001)));}
   current=index;render(frames[index],Math.min(index*STEP,video.duration-.001));
   if(target!=null&&current===target){target=null;playing=false;}
   if(current>=last){playing=false;target=null;status('识别完成');message(`识别完成：共 ${counter.events.length} 次人体跳跃。可拖动进度回看识别过程，或导出时间记录。`);}
   else if(playing){status(index<frames.length-1?'回放中':'识别中');message('正在逐帧识别；随时暂停即可查看当前画面与累计次数。');}
   else if(target!=null){status('补齐识别中');message(`正在补齐前方片段：${fmt(current*STEP)} → ${fmt(target*STEP)}。可点击暂停停止。`);}
   else{status('已暂停');message('已暂停，画面、轨迹和计数均停留在当前视频时间。');}
   if(playing){const delay=STEP*1000/+$('speed').value-(performance.now()-start);if(delay>0)await new Promise(r=>setTimeout(r,delay));}
   else await new Promise(r=>setTimeout(r,0));
  }
 }catch(e){stop();status('识别中断');message('识别未完成：'+e.message+'。可点击播放重试。',true);console.error(e);}
 finally{busy=false;updateControls();if(!playing&&target==null&&loaded&&current*STEP<video.duration-.04&&$('videoStatus').textContent==='识别中')status('已暂停');}
}
function render(frame,t){
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(video,0,0,canvas.width,canvas.height);
 const w=canvas.width,h=canvas.height,unit=Math.max(1,w/640),p=frame?.landmarks;
 if(roi){ctx.fillStyle='#081b2066';ctx.beginPath();ctx.rect(0,0,w,h);ctx.rect(roi.x*w,roi.y*h,roi.w*w,roi.h*h);ctx.fill('evenodd');ctx.strokeStyle='#baf5dc99';ctx.lineWidth=unit;ctx.setLineDash([7*unit,5*unit]);ctx.strokeRect(roi.x*w,roi.y*h,roi.w*w,roi.h*h);ctx.setLineDash([]);}
 if($('trail').checked&&frame){const start=Math.max(0,current-45);ctx.strokeStyle='#f1c66dd0';ctx.lineWidth=2.3*unit;ctx.beginPath();let begun=false;for(let i=start;i<=current;i++){const f=frames[i];if(!f?.landmarks||f.y==null){begun=false;continue;}const x=(f.landmarks[23].x+f.landmarks[24].x)/2*w,y=f.y*h;if(!begun)ctx.moveTo(x,y);else ctx.lineTo(x,y);begun=true;}ctx.stroke();}
 if(p&&$('skeleton').checked){ctx.lineWidth=2*unit;ctx.strokeStyle='#8ff2c9';ctx.shadowColor='#0a2e23';ctx.shadowBlur=3*unit;for(const[a,b]of edges){if(p[a].visibility<.4||p[b].visibility<.4)continue;ctx.beginPath();ctx.moveTo(p[a].x*w,p[a].y*h);ctx.lineTo(p[b].x*w,p[b].y*h);ctx.stroke();}for(let i=0;i<p.length;i++){if((i>0&&i<11)||p[i].visibility<.4)continue;ctx.beginPath();ctx.fillStyle=i>=23?'#ffd482':'#d5ffe9';ctx.arc(p[i].x*w,p[i].y*h,3*unit,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
  const visible=p.filter(p=>p.visibility>.5);if(visible.length){const x=Math.max(0,Math.min(...visible.map(p=>p.x))*w-12*unit),y=Math.max(0,Math.min(...visible.map(p=>p.y))*h-20*unit),right=Math.min(w,Math.max(...visible.map(p=>p.x))*w+12*unit),bottom=Math.min(h,Math.max(...visible.map(p=>p.y))*h+10*unit);ctx.strokeStyle='#baf5dc88';ctx.lineWidth=unit;ctx.strokeRect(x,y,right-x,bottom-y);}
 }
 const n=countAt(counter.events,t);ctx.font=`600 ${18*unit}px "Segoe UI",sans-serif`;const text=`${n} 次  /  ${fmt(t)}`;const tw=ctx.measureText(text).width;ctx.fillStyle='#102c29dd';ctx.fillRect(14*unit,h-46*unit,tw+24*unit,32*unit);ctx.fillStyle='#c5ffe0';ctx.fillText(text,26*unit,h-24*unit);
 if(cropping&&cropStart&&cropEnd){ctx.strokeStyle='#ffda82';ctx.fillStyle='#baf5dc22';ctx.lineWidth=2*unit;const a=cropStart,b=cropEnd;ctx.fillRect(a.x*w,a.y*h,(b.x-a.x)*w,(b.y-a.y)*h);ctx.strokeRect(a.x*w,a.y*h,(b.x-a.x)*w,(b.y-a.y)*h);}
 $('count').textContent=n;if(n>lastCount){$('count').classList.remove('bump');void $('count').offsetWidth;$('count').classList.add('bump');}lastCount=n;
 const phase=!frame?'准备识别':frame.phase==='lost'?'识别不确定 · 需复核':frame.phase==='air'?'跃起 · 追踪中':'落地 · 追踪中';$('motion').textContent=phase;$('trackingLabel').textContent=frame?(frame.phase!=='lost'?'人体已锁定':frame.reason):'准备识别';$('countDot').classList.toggle('active',!!frame&&frame.phase!=='lost');$('quality').textContent=frame?`有效人体帧 ${Math.round(frame.validRatio*100)}%`:'等待识别';
 const active=counter.events.slice(0,n);const rate=n>=2?Math.round((n-1)*60/(active[n-1].time-active[0].time)):null;$('cadence').innerHTML=(rate??'—')+'<small> 次/分</small>';
 const ft=fmt(t);$('elapsed').innerHTML=ft.slice(0,-3)+'<small>'+ft.slice(-3)+'</small>';$('clock').innerHTML=ft+' <em>/ '+fmt(video.duration)+'</em>';$('timeline').value=t;
 $('coverage').textContent=frames.length?`已识别至 ${fmt(frames.at(-1).time)}`:'尚未识别';$('timeline').style.background=`linear-gradient(to right,#a4d9c5 ${frames.length?frames.at(-1).time/video.duration*100:0}%,#e8efed 0)`;
 $('export').disabled=counter.events.length===0;drawSignal(t);renderEvents(n);
}
function drawSignal(t=0){
 const rect=signal.getBoundingClientRect(),dpr=devicePixelRatio||1;signal.width=rect.width*dpr;signal.height=rect.height*dpr;const c=signal.getContext('2d'),w=signal.width,h=signal.height;c.clearRect(0,0,w,h);
 const samples=counter.samples.filter(s=>s.time>=Math.max(0,t-8)&&s.time<=t+.001);$('signalEmpty').hidden=samples.length>1;if(samples.length<2)return;
 const min=Math.min(...samples.map(s=>s.y)),max=Math.max(...samples.map(s=>s.y)),range=Math.max(.015,max-min),t0=Math.max(0,t-8);const xy=s=>[(s.time-t0)/8*w,h*.78-(s.y-min)/range*h*.56];
 c.strokeStyle='#42aa89';c.lineWidth=1.8*dpr;c.beginPath();let prev;for(const s of samples){const[x,y]=xy(s);if(!prev||s.time-prev.time>.25)c.moveTo(x,y);else c.lineTo(x,y);prev=s;}c.stroke();
 for(const e of counter.events){if(e.time<t0||e.time>t)continue;const x=(e.time-t0)/8*w;c.strokeStyle='#e2b86d66';c.setLineDash([3*dpr,4*dpr]);c.beginPath();c.moveTo(x,h*.1);c.lineTo(x,h*.94);c.stroke();c.setLineDash([]);c.fillStyle='#d9ad5d';c.beginPath();c.arc(x,h*.12,3*dpr,0,Math.PI*2);c.fill();}
}
function renderEvents(n){if(n===lastEventCount)return;lastEventCount=n;const list=$('events');list.replaceChildren();if(!n){list.innerHTML='<div class="events-empty">每一次完整跳跃<br><span>都会在这里留下时间记录</span></div>';return;}for(const e of counter.events.slice(0,n).slice(-100).reverse()){const b=document.createElement('button');b.className='event-row';const num=document.createElement('b');num.textContent=String(e.number).padStart(2,'0');const label=document.createTextNode('完成一次跳跃');const tm=document.createElement('span');tm.textContent=fmt(e.time);b.append(num,label,tm);b.title='回看此时刻';b.onclick=()=>jumpTo(e.time);list.append(b);}}
function jumpTo(t){if(!loaded||loading)return;stop();target=Math.min(Math.round((video.duration-.001)/STEP),Math.max(0,Math.round(t/STEP)));updateControls();pump();}
async function resetAnalysis(){stop();await waitIdle();resetModelTracking();counter=makeCounter();frames=[];current=0;lastEventCount=-1;await seek(0);render(null,0);status('准备重新识别');message('识别记录已清空，点击 ▶ 从头识别。');}
$('upload').onclick=$('replace').onclick=()=>$('file').click();$('file').onchange=e=>loadFile(e.target.files[0]);
const drop=$('dropzone');for(const name of ['dragenter','dragover'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('dragover');});for(const name of ['dragleave','drop'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('dragover');});drop.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
$('play').onclick=()=>{if(playing||target!=null){stop();status('已暂停');message('已暂停，画面、轨迹和计数均停留在当前视频时间。');}else{if(current>=Math.round((video.duration-.001)/STEP))current=-1;playing=true;pump();}updateControls();};
$('restart').onclick=()=>jumpTo(0);$('timeline').oninput=e=>jumpTo(+e.target.value);$('skeleton').onchange=$('trail').onchange=()=>loaded&&render(frames[current],Math.min(current*STEP,video.duration-.001));
$('sensitivity').onchange=$('jumpMode').onchange=()=>{if(loaded)resetAnalysis();else counter=makeCounter();};$('recount').onclick=resetAnalysis;
$('modelQuality').onchange=async()=>{stop();await waitIdle();model?.close();model=null;modelPromise=null;if(loaded)await resetAnalysis();message('已切换姿态模型。精细模型优先定位质量；快速模型适合性能较低的设备。');};
$('crop').onclick=async()=>{stop();await waitIdle();if(roi){roi=null;$('roiLabel').textContent='整个画面 · 单人识别';$('crop').textContent='框选';await resetAnalysis();return;}cropping=!cropping;$('cropHint').hidden=!cropping;$('crop').textContent=cropping?'取消':'框选';canvas.style.cursor=cropping?'crosshair':'default';cropStart=null;cropEnd=null;updateControls();};
function point(e){const r=canvas.getBoundingClientRect(),s=Math.min(r.width/canvas.width,r.height/canvas.height),w=canvas.width*s,h=canvas.height*s,x0=r.x+(r.width-w)/2,y0=r.y+(r.height-h)/2;return {x:Math.max(0,Math.min(1,(e.clientX-x0)/w)),y:Math.max(0,Math.min(1,(e.clientY-y0)/h))};}
canvas.onpointerdown=e=>{if(!cropping)return;cropStart=point(e);cropEnd=cropStart;canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!cropping||!cropStart)return;cropEnd=point(e);render(frames[current],current*STEP);};canvas.onpointerup=async e=>{if(!cropping||!cropStart)return;cropEnd=point(e);const a=cropStart,b=cropEnd,r={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};cropStart=null;cropEnd=null;if(r.w<.04||r.h<.08){message('区域太小，请框选跳绳者的完整身体。',true);render(frames[current],current*STEP);return;}roi=r;cropping=false;$('cropHint').hidden=true;canvas.style.cursor='default';$('roiLabel').textContent='已框选 · 聚焦单人';$('crop').textContent='全画面';updateControls();await resetAnalysis();};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else drop.requestFullscreen().catch(()=>message('当前浏览器暂不支持全屏。'));};
$('export').onclick=()=>{const rows=['\uFEFF跳跃序号,视频时间（秒）,视频时间,相对跳跃幅度'];for(const e of counter.events)rows.push(`${e.number},${e.time.toFixed(3)},${fmt(e.time)},${e.amplitude.toFixed(5)}`);const blob=new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName.replace(/\.[^.]+$/,'')+'-跳绳记录.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message(`已导出全部已识别记录，共 ${counter.events.length} 次。`);};
$('help').onclick=()=>$('guide').showModal();$('closeHelp').onclick=()=>$('guide').close();$('guide').onclick=e=>{if(e.target===$('guide'))$('guide').close();};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON','SUMMARY'].includes(document.activeElement.tagName)&&!$('guide').open){e.preventDefault();if(!$('play').disabled)$('play').click();}if(e.code==='Escape'&&cropping)$('crop').click();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(playing||target!=null)){stop();status('已暂停');message('页面切到后台，已自动暂停识别。');}});
window.addEventListener('resize',()=>drawSignal(Math.max(0,current)*STEP));drawSignal();
