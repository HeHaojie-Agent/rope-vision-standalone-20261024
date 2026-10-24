// Hysteresis state machine. Coordinates increase downwards; emit on a confirmed descent.
export class JumpCounter {
 constructor(sensitivity=.016){this.sensitivity=sensitivity;this.reset();}
 reset(){this.samples=[];this.events=[];this.filtered=null;this.ground=null;this.peak=null;this.phase='ground';this.lastSeen=-Infinity;this.lastCount=-Infinity;this.start=0;this.groundEvidence=null;this.cycle=null;}
 update(t,y,height,confidence=1,evidence=null){
  if(!Number.isFinite(y)||!Number.isFinite(height)||confidence<.5){this.filtered=null;this.cycle=null;return {phase:'lost',y:null};}
  const dt=t-this.lastSeen;
  if(dt>.15||this.filtered==null){this.filtered=y;this.ground=y;this.peak=y;this.phase='ground';this.groundEvidence=evidence;}
  const alpha=1-Math.exp(-Math.min(.1,dt)/.018);
  this.lastSeen=t;this.filtered=this.filtered==null?y:alpha*y+(1-alpha)*this.filtered;
  const v=this.filtered,threshold=Math.max(.0015,height*this.sensitivity);
  if(this.phase==='ground'){
   if(v>=(this.ground??v)){this.ground=v;this.groundEvidence=evidence;}
   // Keep a slowly moving ground level when posture or camera drifts.
   if(this.ground-v<threshold)this.ground=this.ground*.97+v*.03;
   if(this.ground-v>threshold*1.3){this.phase='air';this.peak=v;this.start=t;this.cycle=this.groundEvidence?{base:this.groundEvidence,foot:evidence.foot,shoulder:evidence.shoulder,hip:evidence.hip}:null;}
  }else{
   this.peak=Math.min(this.peak,v);
   if(this.cycle&&evidence){this.cycle.foot=Math.min(this.cycle.foot,evidence.foot);this.cycle.shoulder=Math.min(this.cycle.shoulder,evidence.shoulder);this.cycle.hip=Math.min(this.cycle.hip,evidence.hip);}
   const amp=this.ground-this.peak,age=t-this.start;
   // Confirm descent relative to this cycle's peak. Requiring 78% return to
   // an older ground level loses jumps when the stance gradually changes.
   if(v-this.peak>=Math.max(threshold,amp*.50)){
    const c=this.cycle;
    // Reject knee bends and torso oscillation when the supporting feet never lift.
    const corroborated=!evidence||!!c&&(c.base.foot-c.foot>=height*.006&&c.base.shoulder-c.shoulder>=threshold*.35&&c.base.hip-c.hip>=threshold*.35&&Math.abs(evidence.x-c.base.x)<height*.25);
    if(age>=.033&&age<=1.2&&t-this.lastCount>=.10&&amp>=threshold*1.3&&corroborated){this.events.push({time:t,number:this.events.length+1,amplitude:amp/height});this.lastCount=t;}
    this.phase='ground';this.ground=v;this.groundEvidence=evidence;this.cycle=null;
   }else if(age>1.2){this.phase='ground';this.ground=v;this.groundEvidence=evidence;this.cycle=null;}
  }
  this.samples.push({time:t,y:v,height});return {phase:this.phase,y:v};
 }
}
export const countAt=(events,t)=>{let l=0,r=events.length;while(l<r){let m=(l+r)>>1;if(events[m].time<=t+1e-6)l=m+1;else r=m;}return l;};

export class PoseJumpCounter {
 constructor(sensitivity=.016,mode='both'){this.sensitivity=sensitivity;this.mode=mode;this.body=new JumpCounter(sensitivity);this.events=[];this.samples=[];this.last=null;this.scale=null;this.side=0;this.lastStep=-Infinity;this.frames=0;this.validFrames=0;}
 update(t,p){
  this.frames++;
  // Hold the current cycle across at most 80 ms of missing landmarks. No
  // positions or events are invented during the gap; a valid, continuous
  // observation must still corroborate the descent afterwards.
  const lost=(reason,force=false)=>{if(force||!this.last||t-this.last.t>.08){this.last=null;this.side=0;this.body.update(t,null,null,0);}return {phase:'lost',y:null,confidence:0,reason};};
  if(!p||[11,12,23,24,27,28].some(i=>!p[i]||!Number.isFinite(p[i].x)||!Number.isFinite(p[i].y)||!Number.isFinite(p[i].visibility)||p[i].visibility<.5||p[i].y<-.05||p[i].y>1.05))return lost('遮挡或关键点不完整');
  const shoulder=(p[11].y+p[12].y)/2,hip=(p[23].y+p[24].y)/2,x=(p[23].x+p[24].x)/2;
  const left=p[27].y,right=p[28].y,foot=Math.max(left,right);
  const measured=Math.max(.04,Math.abs(hip-shoulder)*3,foot-shoulder);
  const y=hip*.65+shoulder*.35;
  if(this.last&&t-this.last.t<.15&&(Math.abs(y-this.last.y)>measured*.23||Math.abs(x-this.last.x)>measured*.3||measured/this.scale>1.55||measured/this.scale<.65))return lost('人体位置突变，请检查换人或镜头移动',true);
  this.scale=this.scale==null?measured:this.scale*.96+measured*.04;
  const confidence=Math.min(...[11,12,23,24,27,28].map(i=>p[i].visibility));
  const evidence={foot,shoulder,hip,x};const motion=this.body.update(t,y,this.scale,confidence,evidence);
  if(this.mode==='both')this.events=this.body.events;
  else{
   // One count per confirmed left/right support transition; never mix this with torso cycles.
   const d=left-right,threshold=this.scale*Math.max(.018,this.sensitivity*1.5),sign=d>threshold?1:d<-threshold?-1:0;
   if(sign&&this.side&&sign!==this.side&&t-this.lastStep>=.10&&this.last&&t-this.last.t<=.1){this.events.push({time:t,number:this.events.length+1,amplitude:Math.abs(d)/this.scale});this.lastStep=t;}
   if(sign)this.side=sign;
  }
  this.validFrames++;this.last={t,x,y};if(motion.y!=null)this.samples.push({time:t,y:motion.y,height:this.scale});return {...motion,confidence,reason:null};
 }
}
