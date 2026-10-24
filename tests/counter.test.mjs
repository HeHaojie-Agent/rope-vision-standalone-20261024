import assert from 'node:assert/strict';
import {JumpCounter,PoseJumpCounter,countAt} from '../docs/counter.js';
const c=new JumpCounter();
for(let i=0;i<330;i++){const t=i/30;const y=t<.5||t>=10.5?.7:.7-.04*(1-Math.cos(2*Math.PI*(t-.5)/.5));c.update(t,y,.5,1);}
assert.equal(c.events.length,20,'twenty full jumps');
assert.equal(countAt(c.events,0),0);
for(const event of c.events){assert.equal(countAt(c.events,event.time),event.number);assert.equal(countAt(c.events,event.time-.001),event.number-1);}
const still=new JumpCounter();for(let i=0;i<300;i++)still.update(i/30,.7+Math.sin(i)*.0005,.5,1);assert.equal(still.events.length,0,'subthreshold noise');
const lost=new JumpCounter();for(let i=0;i<100;i++)lost.update(i/30,.5+Math.sin(i)*.1,.5,.2);assert.equal(lost.events.length,0,'low confidence does not count');
c.reset();assert.equal(c.events.length,0);
console.log('PASS: jump cycles, video-time lookup, noise rejection, missing landmarks and reset.');

function pose(t,lift=0,footLift=lift,shift=0){
 const p=Array.from({length:33},()=>({x:.5,y:.1-lift+shift,visibility:.95}));
 for(const i of[11,12])p[i].y=.3-lift+shift;
 for(const i of[23,24])p[i].y=.5-lift+shift;
 for(const i of[27,28])p[i].y=.9-footLift+shift;
 p[11].x=.44;p[12].x=.56;p[23].x=.46;p[24].x=.54;p[27].x=.47;p[28].x=.53;
 return p;
}
for(const fps of[30,60])for(const hz of[1.5,2.5,4,6]){
 const n=100,pc=new PoseJumpCounter(),length=.5+n/hz+.5;
 for(let i=0;i<length*fps;i++){
  const t=i/fps,u=t-.5,active=u>=0&&u<n/hz;
  const j=active?.025*(1-Math.cos(2*Math.PI*hz*u)):0;
  pc.update(t,pose(t,j));
 }
 assert.equal(pc.events.length,n,`100 pose-input cycles at ${hz} Hz / ${fps} fps`);
 for(const e of pc.events)assert.equal(countAt(pc.events,e.time),e.number);
}
const bends=new PoseJumpCounter();
for(let i=0;i<1200;i++){const t=i/60,j=-.04*(1-Math.cos(2*Math.PI*t*2));bends.update(t,pose(t,j,0));}
assert.equal(bends.events.length,0,'knee bends with planted feet');
const jitter=new PoseJumpCounter();
for(let i=0;i<1200;i++){const t=i/60,j=.001*Math.sin(i*1.73);jitter.update(t,pose(t,j));}
assert.equal(jitter.events.length,0,'subthreshold joint noise');
const switcher=new PoseJumpCounter();
for(let i=0;i<100;i++)switcher.update(i/60,pose(i/60,0,0,i>=40?.25:0));
assert.equal(switcher.events.length,0,'tracking position discontinuity');
const shoulderOnly=new PoseJumpCounter();
for(let i=0;i<600;i++){const t=i/60,p=pose(t);for(const j of[11,12])p[j].y-=.04*(1-Math.cos(t*4*Math.PI));shoulderOnly.update(t,p);}
assert.equal(shoulderOnly.events.length,0,'isolated shoulder motion');
const invisible=new PoseJumpCounter();
for(let i=0;i<600;i++){const p=pose(i/60,.05*Math.sin(i));p[27].visibility=.1;invisible.update(i/60,p);}
assert.equal(invisible.events.length,0,'occluded feet not guessed');assert.equal(invisible.validFrames,0);
console.log('PASS: 800 labelled pose-input cycles at 30/60 fps; planted-feet bends, noise, identity jumps, shoulder-only movement and occlusion. Synthetic checks do not establish real-video accuracy.');

// Regression: a single low-confidence foot frame must not discard every cycle.
for(const scenario of['one-frame-gap','drifting-ground']){
 const c=new PoseJumpCounter(),fps=60,hz=2,n=20;
 for(let i=0;i<11*fps;i++){
  const t=i/fps,u=t-.5,active=u>=0&&u<n/hz,phase=((u*hz)%1+1)%1;
  let lift=active?.025*(1-Math.cos(2*Math.PI*hz*u)):0;
  if(scenario==='drifting-ground')lift+=Math.max(0,Math.min(.065,(t-1)*.03));
  const p=pose(t,lift);
  if(scenario==='one-frame-gap'&&active&&phase>=.3&&phase<.3+hz/fps)p[27].visibility=.2;
  const before=c.events.length,result=c.update(t,p);
  if(result.phase==='lost')assert.equal(c.events.length,before,'no event invented on a missing frame');
 }
 assert.equal(c.events.length,n,scenario+' keeps 20 real cycles');
}
const longGap=new PoseJumpCounter();
for(let i=0;i<60;i++){const t=i/60;const p=pose(t,t<.3?.04:0);if(t>=.3&&t<.8)p[27].visibility=.1;longGap.update(t,p);}
assert.equal(longGap.events.length,0,'do not join a cycle across a prolonged occlusion');
console.log('PASS: brief landmark loss, changing ground level and prolonged occlusion regressions.');
