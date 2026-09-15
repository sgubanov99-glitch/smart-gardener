// src/core/planner.js — планирование размещения объектов (ревизия 2.51)
import { familyOf, pairResult } from './compatibility.js';

const MIN_GAP = 0.5;
function norm(s){ return String(s||'').trim().toLowerCase(); }

export function shadeRects(scheme){
  const map={ N:[0,1], S:[0,-1], E:[-1,0], W:[1,0], NE:[-1,1], SW:[1,-1], NW:[1,1], SE:[-1,-1] };
  const dir = map[scheme.sunDir||'S']||map.S;
  const dx=dir[0], dy=dir[1];
  const rects=[];
  scheme.objects.forEach(c=>{
    const h=c.height_m||0;
    if(h<=0) return;
    const L=h*0.9;
    if(c.type==='building'){
      let x=c.x,y=c.y,w=c.w,l=c.l;
      if(dx>0) w+=L; else if(dx<0){x-=L;w+=L;}
      if(dy>0) l+=L; else if(dy<0){y-=L;l+=L;}
      rects.push({x,y,w,l});
    } else if(c.type==='tree'||c.type==='bush'){
      if(dx>0) rects.push({x:c.x+c.w,y:c.y,w:L,l:c.l});
      else if(dx<0) rects.push({x:c.x-L,y:c.y,w:L,l:c.l});
      if(dy>0) rects.push({x:c.x,y:c.y+c.l,w:c.w,l:L});
      else if(dy<0) rects.push({x:c.x,y:c.y-L,w:c.w,l:L});
    }
  });
  return rects;
}
export function lightZoneFor(scheme, obj){
  const rects=shadeRects(scheme);
  const step=0.5; let total=0, shaded=0;
  for(let py=obj.y+step/2; py<obj.y+obj.l; py+=step)
    for(let px=obj.x+step/2; px<obj.x+obj.w; px+=step){
      total++;
      if(rects.some(r=>px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.l)) shaded++;
    }
  if(!total) return 'full_sun';
  const f=shaded/total;
  return f<0.25?'full_sun':(f<=0.6?'partial_shade':'full_shade');
}
export function fitsLight(scheme, obj, plant){
  if(!plant||!Array.isArray(plant.light_requirements)||!plant.light_requirements.length) return true;
  return plant.light_requirements.map(r=>norm(r)).includes(lightZoneFor(scheme,obj));
}
export function neighborsCultures(scheme, obj, gap=1.5){
  const out=[];
  scheme.objects.forEach(o=>{
    if(o.id===obj.id) return;
    const cults = o.type==='greenhouse' ? (o.greenhouseBedCultures||[]).filter(Boolean) : (o.culture?[o.culture]:[]);
    if(!cults.length) return;
    const dx=Math.max(0, Math.max(o.x,obj.x)-Math.min(o.x+o.w,obj.x+obj.w));
    const dy=Math.max(0, Math.max(o.y,obj.y)-Math.min(o.y+o.l,obj.y+obj.l));
    if(Math.sqrt(dx*dx+dy*dy)<=gap) out.push(...cults);
  });
  return out;
}
export function compatOk(compat, culture, neighborCultures){
  return (neighborCultures||[]).every(n=> pairResult(compat, culture, n)!=='bad');
}
export function rotationOk(scheme, obj, culture, compat){
  if(obj.type!=='bed') return true;
  const fam=familyOf(compat,culture);
  if(!fam) return true;
  const year=new Date().getFullYear();
  const prev=(obj.history||[]).filter(h=>h.year<year).sort((a,b)=>b.year-a.year)[0];
  return !(prev && familyOf(compat,prev.culture)===fam);
}
// отдельные зоны: грядки/теплицы, деревья, кустарники
export function zoneFor(scheme, type){
  const W=scheme.widthM, L=scheme.lengthM;
  if(type==='tree') return {x:W*0.70, y:0,      w:W*0.30, l:L*0.60};
  if(type==='bush') return {x:W*0.70, y:L*0.65, w:W*0.30, l:L*0.35};
  return {x:0, y:0, w:W*0.66, l:L};
}
function rectsOverlap(a,b,gap){
  return !(a.x+a.w+gap<=b.x || b.x+b.w+gap<=a.x || a.y+a.l+gap<=b.y || b.y+b.l+gap<=a.y);
}
// свободное место с зазором; пробуем вертикально, затем горизонтально
export function freeSpot(scheme, type, w0, l0, zone){
  const step=Math.max(scheme.gridStepM||0.5, 0.5);
  const orients=[[w0,l0],[l0,w0]];
  for(const [w,l] of orients){
    for(let y=zone.y; y+l<=zone.y+zone.l+0.001; y+=step){
      for(let x=zone.x; x+w<=zone.x+zone.w+0.001; x+=step){
        const cand={x,y,w,l};
        let ok=true;
        for(const o of scheme.objects){ if(rectsOverlap(cand,o,MIN_GAP)){ ok=false; break; } }
        if(ok) return {x,y,w,l,flipped:(w!==w0)};
      }
    }
  }
  return null;
}
// построить план размещения запросов [{culture, place}]
export function planPlacements(scheme, compat, plants, requests){
  const plan=[]; const failed=[];
  const sim={ ...scheme, objects: scheme.objects.map(o=> o.type==='greenhouse' ? {...o, greenhouseBedCultures:(o.greenhouseBedCultures||[]).slice()} : o) };
  for(const req of requests){
    const plant=plants.find(p=>norm(p.name)===norm(req.culture));
    let type=req.place;
    if(plant){
      const t=norm(plant.type);
      if(t.includes('дерево')) type='tree';
      else if(t.includes('кустарник')) type='bush';
      else if(req.place==='greenhouse') type='greenhouse';
      else type='bed';
    }
    if(type==='greenhouse'){
      let placed=false;
      for(const gh of sim.objects){
        if(gh.type!=='greenhouse') continue;
        const cnt=gh.greenhouseBedCount||1;
        for(let i=0;i<cnt;i++){
          if(!(gh.greenhouseBedCultures||[])[i]){
            const others=(gh.greenhouseBedCultures||[]).filter(Boolean);
            if(compatOk(compat, req.culture, others)){
              plan.push({kind:'gh_assign', objId:gh.id, bedIndex:i, culture:req.culture});
              gh.greenhouseBedCultures[i]=req.culture;
              placed=true; break;
            }
          }
        }
        if(placed) break;
      }
      if(placed) continue;
      type='greenhouse_new';
    }
    if(type==='greenhouse_new'){
      const spot=freeSpot(sim,'greenhouse',3,6,zoneFor(sim,'bed'));
      if(!spot){ failed.push(req); continue; }
      plan.push({kind:'new', type:'greenhouse', culture:req.culture, x:spot.x,y:spot.y,w:spot.w,l:spot.l});
      sim.objects.push({id:-1-plan.length, type:'greenhouse', x:spot.x,y:spot.y,w:spot.w,l:spot.l, greenhouseBedCount:1, greenhouseBedCultures:[req.culture]});
      continue;
    }
    const zone=zoneFor(sim,type);
    const base = type==='bed'? [1,3] : type==='tree'? [2,2] : [1,1];
    const spot=freeSpot(sim,type,base[0],base[1],zone) || freeSpot(sim,type,base[0],base[1],{x:0,y:0,w:sim.widthM,l:sim.lengthM});
    if(!spot){ failed.push(req); continue; }
    const probe={id:-1-plan.length, x:spot.x,y:spot.y,w:spot.w,l:spot.l,type};
    if(plant && !fitsLight(sim, probe, plant)){ failed.push(req); continue; }
    if(!compatOk(compat, req.culture, neighborsCultures(sim, probe))){ failed.push(req); continue; }
    plan.push({kind:'new', type, culture:req.culture, x:spot.x,y:spot.y,w:spot.w,l:spot.l, flipped:spot.flipped});
    sim.objects.push({id:probe.id, type, x:spot.x,y:spot.y,w:spot.w,l:spot.l, height_m: type==='tree'?3: type==='bush'?1.5: undefined});
  }
  return {plan, failed};
}