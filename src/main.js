import p5 from 'p5';

// ─── Real visa bulletin data (May 2026 / Cato 2023) ───────────────
// Each person is assigned a nationality + EB category
// Wait time = years from priority date filing to current final action date cutoff
// Sources: State Dept Visa Bulletin, Cato Institute 2023, beyondborderglobal 2026
//
// India distribution (63% of backlog):
//   EB-1: ~5% of Indian H-1B filers  → wait ~3 yrs  (priority date Apr 2023 current in Oct 2025)
//   EB-2: ~55%                        → wait ~12 yrs (Jul 2014 cutoff as of May 2026)
//   EB-3: ~40%                        → wait ~12.5 yrs (Nov 2013 cutoff as of May 2026)
//
// China distribution (14% of backlog):
//   EB-1: ~15%  → wait ~2 yrs   (Apr 2023 cutoff)
//   EB-2: ~50%  → wait ~5 yrs   (Jan 2022 cutoff)
//   EB-3: ~35%  → wait ~5 yrs   (Aug 2020 cutoff)
//
// Philippines (5% of relevant H-1B queue):
//   EB-3: mostly  → wait ~5.5 yrs
//   EB-2: current → wait ~1 yr
//
// Other (18%):
//   All categories current → wait ~1.5 yrs

const PROFILES = [
  // India EB-2 (most common, worst case)
  { id:'IN_EB2',  prob:0.347, waitMin:10, waitMax:14, deathW:0.38, label:'India EB-2'  },
  // India EB-3
  { id:'IN_EB3',  prob:0.252, waitMin:11, waitMax:14, deathW:0.38, label:'India EB-3'  },
  // India EB-1 (rare, faster)
  { id:'IN_EB1',  prob:0.031, waitMin:2,  waitMax:4,  deathW:0.01, label:'India EB-1'  },
  // China EB-2
  { id:'CN_EB2',  prob:0.070, waitMin:4,  waitMax:6,  deathW:0.03, label:'China EB-2'  },
  // China EB-3
  { id:'CN_EB3',  prob:0.049, waitMin:4,  waitMax:6,  deathW:0.03, label:'China EB-3'  },
  // China EB-1
  { id:'CN_EB1',  prob:0.021, waitMin:1,  waitMax:3,  deathW:0.01, label:'China EB-1'  },
  // Philippines EB-3
  { id:'PH_EB3',  prob:0.034, waitMin:5,  waitMax:6,  deathW:0.01, label:'Philippines EB-3' },
  // Philippines EB-2
  { id:'PH_EB2',  prob:0.016, waitMin:1,  waitMax:2,  deathW:0.002,label:'Philippines EB-2' },
  // Other
  { id:'OTH',     prob:0.180, waitMin:1,  waitMax:2,  deathW:0.001,label:'Other'        },
];

// Build cumulative probability lookup
const CUM = [];
let acc = 0;
for (const pr of PROFILES) { acc += pr.prob; CUM.push({ thresh: acc, profile: pr }); }

function pickProfile(rand) {
  for (const c of CUM) { if (rand < c.thresh) return c.profile; }
  return PROFILES[PROFILES.length - 1];
}

// H-1B program: effectively started 1990; realistic green card filings from 1993
// (PERM + I-140 pipeline adds ~2 yrs before priority date)
const QUEUE_START = 1993;
const NOW         = 2026;

// For a dot at path position t (0=front, 1=back):
//   entryYear = year they filed their priority date
//   exitYear  = entryYear + their specific wait time (from their profile)
// Queue front (t=0) = oldest filers still waiting → entryYear near QUEUE_START
// Queue back (t=1)  = newest filers → entryYear near NOW
function calcYears(t, profile, waitYearsActual) {
  // entryYear: spread across the realistic filing window
  // India EB-2/EB-3 backlog goes back to early 2000s (priority dates now at 2013-2014)
  // So their oldest filers entered ~2000-2005; newest ~2024
  let windowStart, windowEnd;
  if (profile.id.startsWith('IN_EB2') || profile.id.startsWith('IN_EB3')) {
    windowStart = 2000; windowEnd = 2024;
  } else if (profile.id.startsWith('IN_EB1')) {
    windowStart = 2021; windowEnd = 2025;
  } else if (profile.id.startsWith('CN_EB2') || profile.id.startsWith('CN_EB3')) {
    windowStart = 2018; windowEnd = 2025;
  } else if (profile.id.startsWith('CN_EB1')) {
    windowStart = 2022; windowEnd = 2025;
  } else if (profile.id.startsWith('PH')) {
    windowStart = 2018; windowEnd = 2025;
  } else {
    windowStart = 2023; windowEnd = 2025;
  }
  const entryYear = Math.round(windowStart + t * (windowEnd - windowStart));
  const exitYear  = entryYear + waitYearsActual;
  return { entryYear, exitYear };
}

const BG = [251, 247, 236];

const CONFIG = {
  dotCount:        106,
  minRadius:       6,
  maxRadius:       13,
  riseSpeed:       0.9,
  yearAccumRate:   0.0025,
  yellowThreshold: 0.95,  // 95% of wait time is gray for condemned dots
  deathChance:     0.0020,
  springK:         0.10,
};

// ─── Catmull-Rom ─────────────────────────────────────────────────
function cr(p0,p1,p2,p3,t){
  const t2=t*t,t3=t2*t;
  return{
    x:0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y:0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
  };
}

function buildPath(W,H){
  const A=[
    {x:0.86,y:0.22},  // gate — shifted right + down
    {x:0.72,y:0.19},
    {x:0.55,y:0.20},
    {x:0.37,y:0.25},
    {x:0.19,y:0.33},  // upper-left
    {x:0.12,y:0.42},  // twist 1
    {x:0.19,y:0.51},
    {x:0.34,y:0.55},
    {x:0.52,y:0.56},
    {x:0.68,y:0.55},
    {x:0.80,y:0.59},  // center-right
    {x:0.84,y:0.66},  // twist 2
    {x:0.72,y:0.72},
    {x:0.54,y:0.73},
    {x:0.36,y:0.73},
    {x:0.18,y:0.75},  // center-left
    {x:0.12,y:0.82},  // twist 3
    {x:0.21,y:0.88},
    {x:0.37,y:0.91},
    {x:0.54,y:0.92},
    {x:0.67,y:0.90},  // lower-right
    {x:0.71,y:0.84},  // twist 4 — brief right peak   
    {x:0.56,y:0.91},
    {x:0.38,y:0.95},
    {x:0.20,y:0.97},  // tail — lower-left
  ].map(a=>({x:a.x*W,y:a.y*H}));

  const pts=[];
  const g0={x:A[0].x*2-A[1].x,y:A[0].y*2-A[1].y};
  const gN={x:A[A.length-1].x*2-A[A.length-2].x,y:A[A.length-1].y*2-A[A.length-2].y};
  const full=[g0,...A,gN];
  for(let i=1;i<full.length-2;i++)
    for(let s=0;s<=55;s++) pts.push(cr(full[i-1],full[i],full[i+1],full[i+2],s/55));
  return pts;
}

function getPos(pts,t){
  return pts[Math.floor(Math.max(0,Math.min(0.9999,t))*(pts.length-1))];
}

function dotBaseColor(waitFrac,p){
  if(waitFrac<CONFIG.yellowThreshold){
    const v=p.map(waitFrac,0,CONFIG.yellowThreshold,205,30);
    return[v,v,v];
  }
  const ph=p.map(waitFrac,CONFIG.yellowThreshold,1.0,0,1);
  return[p.lerp(30,230,ph),p.lerp(30,185,ph),p.lerp(30,60,ph)];
}

function risingColor(prog,p){
  return[p.lerp(230,BG[0],prog),p.lerp(185,BG[1],prog),p.lerp(60,BG[2],prog)];
}

const FIDGETS=['pace','spin','bounce'];
const HOVER_FX=['year','glow','breath','lunge','shake'];

new p5(function(p){
  let pathPts=[],dots=[],gatePt={x:0,y:0},gateTimer=0;
  let doorOpen=0,doorState='closed',doorTimer=0;
  const GRAIN_FRAMES=8;
  let grainFrames=[],grainIdx=0,grainTick=0,_distPts=[];

  function makeGrain(){
    const g=p.createGraphics(p.width,p.height);
    g.pixelDensity(1);
    g.loadPixels();
    const W=g.width,H=g.height,px=g.pixels;
    const n=Math.floor(W*H*0.05);
    for(let i=0;i<n;i++){
      const idx=4*(Math.floor(Math.random()*H)*W+Math.floor(Math.random()*W));
      const dark=Math.random()<0.05;
      const v=dark?Math.random()*40+30|0:Math.random()*80+80|0;
      px[idx]=v; px[idx+1]=v*0.88|0; px[idx+2]=v*0.74|0;
      px[idx+3]=dark?Math.random()*40+55|0:Math.random()*35+22|0;
    }
    g.updatePixels();
    return g;
  }

  p.setup=function(){
    p.createCanvas(p.windowWidth,p.windowHeight).parent('app');
    p.pixelDensity(window.devicePixelRatio||1);
    init();
    for(let i=0;i<GRAIN_FRAMES;i++) grainFrames.push(makeGrain());
  };

  function init(){
    pathPts=buildPath(p.width,p.height);
    gatePt=pathPts[0];
    dots=[];
    for(let i=0;i<CONFIG.dotCount;i++){
      // Start queue from t=0.04 so no one begins right at the gate
      const t=0.04 + (i/(CONFIG.dotCount-1))*0.96;
      const pos=getPos(pathPts,t);
      const nd=makeDot(pos.x,pos.y,t);
      nd.targetT=t;
      nd.waitYears=p.random(0,nd.waitMax*0.82);
      dots.push(nd);
    }
    assignFidgets();
    gateTimer = Math.floor(p.random(20*60, 30*60));
  }

  function makeDot(x,y,t){
    const profile=pickProfile(p.random());
    // Each person's actual wait is sampled from their profile's range
    const waitMax=Math.round(p.random(profile.waitMin,profile.waitMax));
    return{
      x,y,t,profile,waitMax,
      r:p.random(CONFIG.minRadius,CONFIG.maxRadius),
      waitYears:0,
      state:'waiting',
      originX:x,originY:y,
      riseY:0,riseLen:p.random(80,200),riseProgress:0,
      alpha:255,
      hovered:false,hoverEffect:null,hoverTimer:0,hoverVal:0,
      fidget:null,fidgetPhase:p.random(Math.PI*2),fidgetDelay:p.random(0,220),
      targetT:t,moveDelay:0,moving:false,
      condemned:false,
      canDie: Math.random()<0.15,
      isDragged:false,returning:false,dragVX:0,dragVY:0,
      enterGate:false,enterProgress:0,_enterScale:1,
      enterColor:[60,180,90],
    };
  }

  function assignFidgets(){
    for(let i=4;i<dots.length;i++){
      if(p.random()<0.17){
        dots[i].fidget=FIDGETS[Math.floor(p.random(FIDGETS.length))];
        dots[i].fidgetDelay=p.random(0,240);
      }
    }
  }

  function tickGate(){
    if(dots.some(d=>d.state==='entering')||doorState!=='closed') return;
    if(--gateTimer<=0){
      const front=dots.filter(d=>d.state==='waiting').sort((a,b)=>a.t-b.t)[0];
      if(front){front.enterGate=true;front.state='entering';}
      gateTimer=Math.floor(p.random(20*60,30*60));
    }
  }

  function cascade(fromT){
    const slot=1.0/(CONFIG.dotCount-1);
    dots
      .filter(d=>d.state==='waiting'&&d.t>=fromT-0.005)
      .sort((a,b)=>a.t-b.t)
      .forEach((d,i)=>{
        d.targetT=Math.max(0,d.targetT-slot);
        d.moveDelay=i*Math.floor(p.random(0,2));
        d.moving=true;
      });
  }

  function addBack(){
    const pos=getPos(pathPts,1.0);
    const nd=makeDot(pos.x,pos.y,1.0);
    if(p.random()<0.17){
      nd.fidget=FIDGETS[Math.floor(p.random(FIDGETS.length))];
      nd.fidgetDelay=p.random(60,200);
    }
    dots.push(nd);
  }

  function update(d){
    if(d.isDragged&&d.state==='waiting'){
      // Keep queue position current so return target is always correct
      d.t=d.targetT;d.moving=false;
      const qpos=getPos(pathPts,d.t);
      d.originX=qpos.x;d.originY=qpos.y;
      // Lag toward mouse — feels like picking up a small weight
      d.x=p.lerp(d.x,p.mouseX,0.25);
      d.y=p.lerp(d.y,p.mouseY,0.25);
    }else if(d.returning&&d.state==='waiting'){
      // Spring back to queue position
      d.dragVX=(d.dragVX+0.10*(d.originX-d.x))*0.80;
      d.dragVY=(d.dragVY+0.10*(d.originY-d.y))*0.80;
      d.x+=d.dragVX;d.y+=d.dragVY;
      if(p.dist(d.x,d.y,d.originX,d.originY)<0.8&&Math.abs(d.dragVX)<0.08){
        d.x=d.originX;d.y=d.originY;d.t=d.targetT;d.returning=false;
      }
    }else if(d.moving&&d.state==='waiting'){
      if(d.moveDelay>0){d.moveDelay--;}
      else{
        const diff=d.targetT-d.t;
        if(Math.abs(diff)>0.00008) d.t+=diff*CONFIG.springK;
        else{d.t=d.targetT;d.moving=false;}
        const pos=getPos(pathPts,d.t);
        d.x=pos.x;d.y=pos.y;d.originX=pos.x;d.originY=pos.y;
      }
    }

    if(d.state==='entering'){
      d.enterProgress+=0.020;
      d._enterScale=Math.max(0.05,1-d.enterProgress*0.95);
      d.alpha=p.map(d.enterProgress,0.55,1.0,255,0);
      const ph=Math.min(1,d.enterProgress*1.6);
      d.enterColor=[p.lerp(180,45,ph),p.lerp(180,175,ph),p.lerp(180,85,ph)];
      d.x=p.lerp(d.originX,gatePt.x,Math.min(1,d.enterProgress*1.6));
      d.y=p.lerp(d.originY,gatePt.y,Math.min(1,d.enterProgress*1.6));
      if(d.enterProgress>0.2&&doorState==='closed'){doorState='opening';doorTimer=0;}
      if(d.enterProgress>=1.15){
        const idx=dots.indexOf(d);
        if(idx!==-1){dots.splice(idx,1);addBack();cascade(0);}
        doorState='closing';doorTimer=0;
      }
      return;
    }

    if(d.state==='waiting'){
      // Always accumulate, but clamp hard at waitMax (fully yellow).
      // condemned=true once yellow — prevents reset past waitMax from cycling back.
      d.waitYears+=CONFIG.yearAccumRate*(d.waitMax/10);
      // Only 15% of dots (canDie) ever turn yellow; others clamp at just below threshold
      if(d.canDie){
        if(d.waitYears/d.waitMax>=CONFIG.yellowThreshold) d.condemned=true;
        if(d.condemned && d.waitYears>d.waitMax) d.waitYears=d.waitMax;
      } else {
        if(d.waitYears/d.waitMax>=CONFIG.yellowThreshold)
          d.waitYears=d.waitMax*(CONFIG.yellowThreshold-0.005);
      }
      if(d.fidget&&!d.isDragged){if(d.fidgetDelay>0)d.fidgetDelay--;else d.fidgetPhase+=0.068;}
      if(!d.isDragged&&!d.hovered&&p.dist(p.mouseX,p.mouseY,d.x,d.y)<d.r+10){
        d.hovered=true;
        d.hoverEffect=HOVER_FX[Math.floor(p.random(HOVER_FX.length))];
        d.hoverTimer=110;d.hoverVal=0;
      }
      if(d.hovered){d.hoverVal++;d.hoverTimer--;if(d.hoverTimer<=0){d.hovered=false;d.hoverEffect=null;}}
      // Only die once deep yellow (waitFrac >= 0.93), so gradient is visible first
      const waitFracNow=d.waitYears/d.waitMax;
      if(d.condemned&&waitFracNow>=0.97&&!d.isDragged&&p.random()<CONFIG.deathChance*d.profile.deathW){
        d.state='rising';d.riseY=0;d.riseProgress=0;d.riseLen=p.random(80,200);
      }
    }else if(d.state==='rising'){
      d.riseY+=CONFIG.riseSpeed+p.random(-0.1,0.1);
      d.riseProgress=Math.min(1,d.riseY/d.riseLen);
      if(d.riseY>d.riseLen+40) d.state='linefade';

    }else if(d.state==='linefade'){
      d.riseProgress=Math.min(1,d.riseProgress+0.018);
      if(d.riseProgress>=1){
        const savedT=d.t,idx=dots.indexOf(d);
        if(idx!==-1){dots.splice(idx,1);addBack();cascade(savedT);}
      }
    }
  }

  function updateDoor(){
    doorTimer++;
    if(doorState==='opening'){doorOpen=Math.min(1,doorTimer/30);if(doorOpen>=1)doorState='open';}
    else if(doorState==='closing'){doorOpen=Math.max(0,1-(doorTimer/35));if(doorOpen<=0)doorState='closed';}
    else if(doorState==='closed') doorOpen=0;
  }

  function drawDot(d){
    if(d.state==='rising'||d.state==='linefade'){
      const[r,g,b]=risingColor(d.riseProgress,p);
      if(d.riseY>0){
        const ll=Math.min(d.riseY,d.riseLen);
        p.stroke(r,g,b);p.strokeWeight(0.8);
        p.line(d.originX,d.originY,d.originX,d.originY-ll);
      }
      if(d.state==='rising'){p.noStroke();p.fill(r,g,b);p.ellipse(d.originX,d.originY-d.riseY,d.r*2,d.r*2);}
      return;
    }
    if(d.state==='entering'){
      const[r,g,b]=d.enterColor;
      p.noStroke();p.fill(r,g,b,d.alpha);
      p.ellipse(d.x,d.y,d.r*2*d._enterScale,d.r*2*d._enterScale);
      if(d.enterProgress<0.6){
        p.noFill();p.stroke(r,g,b,d.alpha*0.4);p.strokeWeight(0.7);
        const ring=p.map(d.enterProgress,0,0.6,d.r,d.r+20);
        p.ellipse(d.x,d.y,ring*2,ring*2);
      }
      return;
    }

    const waitFrac=Math.min(1,d.waitYears/d.waitMax);
    const[r,g,b]=dotBaseColor(waitFrac,p);
    let ox=0,oy=0,drawR=d.r;

    if(d.fidget&&d.fidgetDelay<=0){
      const ph=d.fidgetPhase;
      if(d.fidget==='pace') ox=Math.sin(ph)*5;
      if(d.fidget==='bounce') oy=-Math.abs(Math.sin(ph))*5;
      if(d.fidget==='spin'){
        p.noFill();p.stroke(170,163,152,80);p.strokeWeight(0.7);
        p.ellipse(d.x+Math.cos(ph)*(d.r+6),d.y+Math.sin(ph)*(d.r+6),4,4);
      }
    }
    if(d.fidget==='pace'&&d.fidgetDelay<=0){
      p.noStroke();p.fill(r,g,b,28);
      p.ellipse(d.x+ox*0.4,d.y,d.r*1.6,d.r*1.6);
    }
    if(d.hovered&&d.hoverEffect){
      if(d.hoverEffect==='glow'){p.noStroke();p.fill(235,220,150,22);p.ellipse(d.x,d.y,(d.r+16)*2,(d.r+16)*2);}
      else if(d.hoverEffect==='breath') drawR=d.r+Math.sin(d.hoverVal*0.11)*4.5;
      else if(d.hoverEffect==='lunge'){
        if(d.hoverVal<15) ox-=p.map(d.hoverVal,0,15,0,8);
        else if(d.hoverVal<35) ox+=p.map(d.hoverVal,15,35,-8,0);
      }
      else if(d.hoverEffect==='shake') ox+=p.random(-3,3);
    }
    // Drag: ghost at queue position + elastic tether + lift glow
    if(d.isDragged||d.returning){
      const dist=p.dist(d.x,d.y,d.originX,d.originY);
      if(dist>2){
        p.noStroke();p.fill(r,g,b,24);
        p.ellipse(d.originX,d.originY,d.r*2,d.r*2);
        const ta=p.map(dist,0,220,0,68,true);
        p.stroke(r,g,b,ta);p.strokeWeight(0.8);
        p.line(d.originX,d.originY,d.x+ox,d.y+oy);
      }
    }
    if(d.isDragged){
      p.noStroke();p.fill(r,g,b,16);
      p.ellipse(d.x+ox,d.y+oy,(drawR+18)*2,(drawR+18)*2);
      drawR*=1.14;
    }
    p.noStroke();p.fill(r,g,b);
    p.ellipse(d.x+ox,d.y+oy,drawR*2,drawR*2);

    // Year tooltip: always show on hover (regardless of which effect)
    if(d.hovered){
      const{entryYear,exitYear}=calcYears(d.t,d.profile,d.waitMax);
      const safeEntry=Math.max(1993,entryYear);
      const fa=d.hoverTimer>20?190:p.map(d.hoverTimer,0,20,0,190);
      p.fill(68,58,42,fa);p.noStroke();
      p.textSize(9);p.textAlign(p.CENTER);p.textFont('monospace');
      p.text(`${safeEntry} – ${exitYear}`,d.x+ox,d.y+oy-d.r-7);
    }
  }

  function drawGate(){
    const gx=gatePt.x,gy=gatePt.y;
    const gw=119,gh=162;
    const top=gy-gh*0.6;

    // continuous radial gradient halo
    for(let i=16;i>=0;i--){
      const frac=i/16;
      p.noStroke();p.fill(45,175,90,p.map(frac,0,1,0,22));
      const radius=p.lerp(gw*0.55,gw*1.8,1-frac);
      p.ellipse(gx,gy,radius*2,radius*2);
    }
    p.noFill();p.stroke(40,162,82,220);p.strokeWeight(3);
    p.rect(gx-gw/2,top,gw,gh,6);

    const leftW=(gw/2)*(1-doorOpen);
    if(leftW>1){p.fill(40,162,82,200);p.noStroke();p.rect(gx-gw/2+1,top+1,leftW,gh-2,doorOpen>0.01?0:5);}
    const rightW=(gw/2)*(1-doorOpen);
    if(rightW>1){p.fill(40,162,82,200);p.noStroke();p.rect(gx+gw/2-rightW-1,top+1,rightW,gh-2,doorOpen>0.01?0:5);}
    if(doorOpen>0.1){p.fill(220,255,225,doorOpen*28);p.noStroke();p.rect(gx-gw/2+3,top+3,gw-6,gh-6,4);}

    p.fill(38,158,78,235);p.noStroke();p.rect(gx-30,top-38,60,20,4);
    p.fill(220,255,228,250);p.textSize(10);p.textAlign(p.CENTER);p.textFont('monospace');
    p.text('EXIT',gx,top-25);

    const mx=gx+gw/2+16,my=top+32;
    p.fill(40,162,82,170);p.noStroke();p.ellipse(mx,my,13,13);
    p.stroke(40,162,82,170);p.strokeWeight(1.8);p.noFill();
    p.line(mx,my+7,mx+2,my+21);p.line(mx+2,my+21,mx+9,my+34);
    p.line(mx+2,my+21,mx-7,my+34);p.line(mx,my+11,mx+8,my+18);
    p.noStroke();p.fill(38,158,78,175);p.ellipse(gx+3,gy,6,6);
  }

  function drawDisturbance(){
    const vx=p.mouseX-p.pmouseX,vy=p.mouseY-p.pmouseY;
    const speed=Math.hypot(vx,vy);
    const R=54,cx=p.mouseX,cy=p.mouseY;

    // Spawn grain particles when mouse moves
    if(speed>0.5){
      const n=Math.min(Math.ceil(speed*2.8),20);
      for(let i=0;i<n;i++){
        const a=Math.random()*Math.PI*2;
        const s=Math.random()*speed*0.6+0.6;
        _distPts.push({
          x:cx+(Math.random()-0.5)*R*0.8,
          y:cy+(Math.random()-0.5)*R*0.8,
          vx:Math.cos(a)*s,vy:Math.sin(a)*s,
          life:1.0,sz:Math.random()*1.8+0.4,
          v:(105+Math.random()*78)|0,
        });
      }
      if(_distPts.length>600) _distPts.splice(0,_distPts.length-600);
    }

    // Erase grain — soft circular clearing, genuinely removes texture
    p.erase();
    p.noStroke();
    for(let i=0;i<=12;i++){
      const t=i/12;
      p.fill(255,t*t*255);
      p.ellipse(cx,cy,R*2*(1-t*0.78),R*2*(1-t*0.78));
    }
    p.noErase();

    // Update and draw scattered grain particles
    p.noStroke();
    for(let i=_distPts.length-1;i>=0;i--){
      const dp=_distPts[i];
      dp.x+=dp.vx;dp.y+=dp.vy;
      dp.vx*=0.89;dp.vy*=0.89;
      dp.life-=0.016;
      if(dp.life<=0){_distPts.splice(i,1);continue;}
      p.fill(dp.v,dp.v*0.88|0,dp.v*0.74|0,dp.life*48);
      p.ellipse(dp.x,dp.y,dp.sz,dp.sz);
    }
  }

  function drawPath(){
    p.noFill();p.stroke(205,193,176,50);p.strokeWeight(0.5);
    p.beginShape();
    for(const pt of pathPts) p.vertex(pt.x,pt.y);
    p.endShape();
  }

  function drawTitle(){
    p.noStroke();p.textFont('monospace');
    p.fill(78,70,55,175);p.textSize(13);p.textAlign(p.LEFT);
    p.text('PERMANENT TEMPORARY',18,26);
  }

  p.draw=function(){
    p.background(BG[0],BG[1],BG[2]);
    if(++grainTick>=5){grainTick=0;grainIdx=(grainIdx+1)%GRAIN_FRAMES;}
    p.image(grainFrames[grainIdx],0,0);
    drawDisturbance();
    updateDoor();tickGate();drawPath();drawGate();
    for(const d of[...dots]) update(d);
    for(const d of dots) if(!d.isDragged) drawDot(d);
    for(const d of dots) if(d.isDragged) drawDot(d);
    drawTitle();
  };

  p.mousePressed=function(){
    for(let i=dots.length-1;i>=0;i--){
      const d=dots[i];
      if(d.state!=='waiting') continue;
      if(p.dist(p.mouseX,p.mouseY,d.x,d.y)<=d.r+8){
        d.isDragged=true;d.returning=false;d.moving=false;
        d.dragVX=0;d.dragVY=0;
        d.hovered=false;d.hoverEffect=null;
        // bring to top of draw order
        dots.splice(i,1);dots.push(d);
        break;
      }
    }
  };

  p.mouseReleased=function(){
    for(const d of dots){
      if(d.isDragged){
        d.isDragged=false;
        d.returning=true;
        // flick velocity from last mouse movement
        d.dragVX=(p.mouseX-p.pmouseX)*0.28;
        d.dragVY=(p.mouseY-p.pmouseY)*0.28;
        break;
      }
    }
  };

  p.windowResized=function(){
    p.resizeCanvas(p.windowWidth,p.windowHeight);
    _distPts=[];init();
    grainFrames.forEach(g=>g.remove());grainFrames=[];
    for(let i=0;i<GRAIN_FRAMES;i++) grainFrames.push(makeGrain());
  };
});