// src/ui/isoView.js — псевдо-3D изометрия (ревизия 2.173)
// 2.173: эмодзи на объектах заменены на иконки спрайтов:
//        культуры — из icons.svg (crop-*), пустые объекты и фолбэк — site-иконки
//        smart-gardener.svg (si-house / si-greenhouse / si-bed / si-tree / si-bush)
// 2.57: иконки культур на canvas — растрируем <symbol> спрайта в Image (фолбэк эмодзи)
import { getCropIconId } from './ux.js';

const TYPE_COLORS = {
  building:   ['#F6E8D8','#E7D3BC','#D9C0A4'],
  greenhouse: ['#E3F2E6','#CBE3D0','#B5D2BA'],
  bed:        ['#EDF6DC','#D8E8C0','#C2D6A6']
};
// 2.173: site-иконки типов объектов (пустые объекты и фолбэк вместо эмодзи)
const TYPE_ICON_ID = { building:'si-house', greenhouse:'si-greenhouse', bed:'si-bed', tree:'si-tree', bush:'si-bush' };
const TRUNK_COLOR  = '#C9A98A';
const CROWN_LIGHT  = '#D3E6B8';
const CROWN_DARK   = '#A6C489';
const BUSH_LIGHT   = '#D8E9BE';
const BUSH_DARK    = '#ACC98F';
const SHADOW_FILL  = 'rgba(63,62,58,.14)';
const PLANT_EMOJI = {
  'томат':'🍅','огурец':'🥒','перец':'🫑','капуста':'🥬','редис':'🌶',
  'морковь':'🥕','свёкла':'🟣','лук':'🧅','чеснок':'🧄','картофель':'🥔',
  'клубника':'🍓','земляника садовая':'🍓','укроп':'🌿','петрушка':'🌿',
  'салат':'🥬','шпинат':'🥬','тыква':'🎃','кабачок':'🥒','патиссон':'🎃',
  'дыня':'🍈','арбуз':'🍉','баклажан':'🍆','горох':'🫛','фасоль':'🫘',
  'репа':'🍠','рукола':'🌿','щавель':'🍃','кинза':'🌿'
};

function project(gx, gy, t){ return { x:(gx-gy)*t, y:(gx+gy)*t*0.5 }; }
function pointInPoly(px, py, pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=pts[i].x, yi=pts[i].y, xj=pts[j].x, yj=pts[j].y;
    const hit = ((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
    if(hit) inside=!inside;
  }
  return inside;
}
function sunShadeDir(sunDir){
  const map={ N:[0,1], S:[0,-1], E:[-1,0], W:[1,0], NE:[-1,1], SW:[1,-1], NW:[1,1], SE:[-1,-1] };
  return map[sunDir||'S']||map.S;
}

/* ---------- 2.57: растр иконок спрайта для canvas (кэш) ---------- */
const iconCache = new Map();
let requestIsoRender = ()=>{};
function iconImage(id){
  if(!id) return null;
  const hit = iconCache.get(id);
  if(hit) return hit.ready ? hit.img : null;
  const sym = document.getElementById(id);
  if(!sym){ iconCache.set(id,{ready:true,img:null}); return null; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  ['viewBox','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'].forEach(a=>{
    const v = sym.getAttribute(a);
    if(v!=null) svg.setAttribute(a,v);
  });
  svg.innerHTML = sym.innerHTML;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  const img = new Image();
  const entry = {ready:false, img};
  iconCache.set(id, entry);
  img.onload = ()=>{ entry.ready=true; requestIsoRender(); };
  img.src = url;
  return null;
}
function drawCultureIcon(ctx, culture, cx, cy, size){
  const id = getCropIconId(culture);
  const img = id ? iconImage(id) : null;
  if(img){ ctx.drawImage(img, cx-size/2, cy-size/2, size, size); return true; }
  return false;
}
/* ---------- 2.173: site-иконка типа объекта (вместо эмодзи) ---------- */
function drawTypeIcon(ctx, type, cx, cy, size){
  const img = iconImage(TYPE_ICON_ID[type]);
  if(img){ ctx.drawImage(img, cx-size/2, cy-size/2, size, size); return true; }
  return false;
}

export function createIsoView({ scheme, plants, onSelect }){
  const canvas = document.getElementById('isoCanvas');
  if(!canvas) return { render(){} };
  const ctx = canvas.getContext('2d');
  let order = [];
  let zoom = 1;

  function emojiFor(culture){
    const n = String(culture||'').trim().toLowerCase();
    if(PLANT_EMOJI[n]) return PLANT_EMOJI[n];
    const p = (plants||[]).find(pp => String(pp.name).trim().toLowerCase()===n);
    return (p && p.emoji) || '🌿';
  }
  function poly(pts){
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }
  function sphere(cx, cy, r, light, dark){
    const g = ctx.createRadialGradient(cx - r*0.35, cy - r*0.35, r*0.15, cx, cy, r);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(63,62,58,.18)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function contactShadow(cx, cy, rx, ry){
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(63,62,58,.10)'; ctx.fill();
  }
  function drawCastShadows(t){
    const dir = sunShadeDir(scheme.sunDir);
    const dx=dir[0], dy=dir[1];
    ctx.fillStyle = SHADOW_FILL;
    scheme.objects.forEach(c=>{
      const h=c.height_m||0;
      if(h<=0) return;
      const L=h*0.9;
      if(c.type==='building'){
        let x=c.x,y=c.y,w=c.w,l=c.l;
        if(dx>0) w+=L; else if(dx<0){x-=L;w+=L;}
        if(dy>0) l+=L; else if(dy<0){y-=L;l+=L;}
        const p0=project(x,y,t),p1=project(x+w,y,t),p2=project(x+w,y+l,t),p3=project(x,y+l,t);
        poly([p0,p1,p2,p3]); ctx.fill();
      } else if(c.type==='tree'||c.type==='bush'){
        const rM=Math.min(c.w,c.l)*0.5+(c.type==='tree'?h*0.12:0);
        const offM=h*0.35;
        const pc=project(c.x+c.w/2+dx*offM, c.y+c.l/2+dy*offM, t);
        const rx=rM*t*1.2, ry=rx*0.5;
        ctx.beginPath(); ctx.ellipse(pc.x,pc.y,rx,ry,0,0,Math.PI*2); ctx.fill();
      }
    });
  }
  function ensureControls(){
    const wrap = canvas.parentElement;
    if(!wrap) return;
    wrap.style.position='relative';
    if(!wrap.querySelector('.iso-zoom')){
      const bar=document.createElement('div');
      bar.className='iso-zoom';
      bar.style.cssText='position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:5';
      const mk=(txt,fn,title)=>{
        const b=document.createElement('button');
        b.type='button'; b.textContent=txt; b.title=title||'';
        b.style.cssText='width:34px;height:34px;border:none;border-radius:10px;background:#FFF7E8;box-shadow:0 6px 14px rgba(62,62,58,.10);cursor:pointer;font-size:16px;font-weight:700;color:#3F3E3A';
        b.addEventListener('click',fn);
        bar.appendChild(b);
      };
      mk('+',()=>{ zoom=Math.min(2.5,zoom*1.15); render(); },'Приблизить');
      mk('−',()=>{ zoom=Math.max(0.5,zoom/1.15); render(); },'Отдалить');
      mk('⟲',()=>{ zoom=1; render(); },'Сбросить масштаб');
      wrap.appendChild(bar);
    }
    if(!wrap.querySelector('.iso-hint')){
      const hint=document.createElement('div');
      hint.className='iso-hint';
      hint.style.cssText='position:absolute;left:12px;bottom:10px;font-size:12px;color:#6B6A64;background:rgba(255,252,244,.85);border-radius:8px;padding:4px 8px;z-index:5';
      wrap.appendChild(hint);
    }
  }

  function render(){
    ensureControls();
    const hint = canvas.parentElement && canvas.parentElement.querySelector('.iso-hint');
    if(hint){
      const SUN={N:'Север',NW:'Северо-Запад',W:'Запад',SW:'Юго-Запад',S:'Юг',SE:'Юго-Восток',E:'Восток',NE:'Северо-Восток'};
      hint.textContent='☀ Солнце: '+(SUN[scheme.sunDir||'S']||'Юг')+' · тени против солнца · колесо мыши / кнопки — зум';
    }
    const wrap = canvas.parentElement;
    const cw = wrap ? wrap.clientWidth : 900;
    const vh = window.innerHeight || 800;
    const span = scheme.widthM + scheme.lengthM;
    const maxH = scheme.objects.reduce((m,o)=>Math.max(m,o.height_m||0),1);
    const fill = 0.66;
    const tW = (cw*fill)/span;
    const tH = (vh*fill)/(span*0.5 + maxH*0.8);
    const baseT = Math.max(10, Math.min(tW,tH));
    const t = baseT*zoom;
    const corners=[project(0,0,t),project(scheme.widthM,0,t),project(scheme.widthM,scheme.lengthM,t),project(0,scheme.lengthM,t)];
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    corners.forEach(c=>{minX=Math.min(minX,c.x);maxX=Math.max(maxX,c.x);minY=Math.min(minY,c.y);maxY=Math.max(maxY,c.y);});
    minY -= maxH*t*0.8;
    const W=Math.ceil(maxX-minX)+40, H=Math.ceil(maxY-minY)+40;
    canvas.width=W; canvas.height=H;
    const ox=-minX+20, oy=-minY+20;
    ctx.clearRect(0,0,W,H);
    ctx.save(); ctx.translate(ox,oy);
    const g0=project(0,0,t),g1=project(scheme.widthM,0,t),g2=project(scheme.widthM,scheme.lengthM,t),g3=project(0,scheme.lengthM,t);
    poly([g0,g1,g2,g3]); ctx.fillStyle='rgba(245,251,236,.75)'; ctx.fill();
    ctx.strokeStyle='rgba(120,160,120,.25)'; ctx.lineWidth=1;
    for(let gx=0;gx<=scheme.widthM+0.001;gx+=scheme.gridStepM){
      const a=project(gx,0,t),c=project(gx,scheme.lengthM,t);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
    }
    for(let gy=0;gy<=scheme.lengthM+0.001;gy+=scheme.gridStepM){
      const a=project(0,gy,t),c=project(scheme.widthM,gy,t);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
    }
    drawCastShadows(t);
    order = scheme.objects.slice().sort((a,b)=>(a.x+a.y)-(b.x+b.y));
    order.forEach(o=>{
      const gc = project(o.x+o.w/2, o.y+o.l/2, t);
      if(o.type==='tree'){
        const h=o.height_m||3;
        const totalPx=h*t*0.8;
        const trunkH=totalPx*0.45;
        const trunkW=Math.max(3,t*0.22);
        const crownR=Math.max(t*0.55,totalPx*0.38);
        contactShadow(gc.x,gc.y,crownR*0.8,crownR*0.35);
        ctx.fillStyle=TRUNK_COLOR;
        ctx.fillRect(gc.x-trunkW/2, gc.y-trunkH, trunkW, trunkH);
        ctx.strokeStyle='rgba(63,62,58,.20)'; ctx.lineWidth=1;
        ctx.strokeRect(gc.x-trunkW/2, gc.y-trunkH, trunkW, trunkH);
        const crownCy=gc.y-trunkH-crownR*0.75;
        sphere(gc.x,crownCy,crownR,CROWN_LIGHT,CROWN_DARK);
        // 2.173: иконка культуры → фолбэк site-иконка типа → фолбэк эмодзи
        if(!drawCultureIcon(ctx, o.culture, gc.x, crownCy, crownR*1.1)){
          if(!drawTypeIcon(ctx, o.type, gc.x, crownCy, crownR*1.1)){
            ctx.font=`${Math.max(12,crownR*0.8)}px serif`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(emojiFor(o.culture), gc.x, crownCy);
          }
        }
        o._isoCircle={x:gc.x+ox,y:crownCy+oy,r:crownR};
        o._isoTop=null;
      } else if(o.type==='bush'){
        const r=Math.max(t*0.5, Math.min(o.w,o.l)*t*0.5);
        contactShadow(gc.x,gc.y,r*0.85,r*0.38);
        const cy=gc.y-r*0.85;
        sphere(gc.x,cy,r,BUSH_LIGHT,BUSH_DARK);
        if(!drawCultureIcon(ctx, o.culture, gc.x, cy, r*1.1)){
          if(!drawTypeIcon(ctx, o.type, gc.x, cy, r*1.1)){
            ctx.font=`${Math.max(12,r*0.8)}px serif`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(emojiFor(o.culture), gc.x, cy);
          }
        }
        o._isoCircle={x:gc.x+ox,y:cy+oy,r:r};
        o._isoTop=null;
      } else {
        const h=o.height_m||0.4;
        const hz=h*t*0.8;
        const A=project(o.x,o.y,t),B=project(o.x+o.w,o.y,t),C=project(o.x+o.w,o.y+o.l,t),D=project(o.x,o.y+o.l,t);
        const tA={x:A.x,y:A.y-hz},tB={x:B.x,y:B.y-hz},tC={x:C.x,y:C.y-hz},tD={x:D.x,y:D.y-hz};
        const cols=TYPE_COLORS[o.type]||TYPE_COLORS.bed;
        poly([tD,tC,C,D]); ctx.fillStyle=cols[2]; ctx.fill();
        poly([tB,tC,C,B]); ctx.fillStyle=cols[1]; ctx.fill();
        poly([tA,tB,tC,tD]); ctx.fillStyle=cols[0]; ctx.fill();
        ctx.strokeStyle='rgba(63,62,58,.20)'; ctx.lineWidth=1; ctx.stroke();
        const cx=(tA.x+tC.x)/2, cy=(tA.y+tC.y)/2;
        if(o.type==='greenhouse'){
          const cs=(o.greenhouseBedCultures||[]).filter(Boolean);
          if(cs.length){
            const size=t*0.7, gap=size*0.2;
            const total=cs.length*size+(cs.length-1)*gap;
            let x0=cx-total/2+size/2;
            cs.forEach((c,i)=>{
              const xx=x0+i*(size+gap);
              if(!drawCultureIcon(ctx,c,xx,cy,size)){
                ctx.font=`${Math.max(12,size*0.9)}px serif`;
                ctx.textAlign='center'; ctx.textBaseline='middle';
                ctx.fillText(emojiFor(c),xx,cy);
              }
            });
          } else {
            // 2.173: пустая теплица — site-иконка вместо 🌱
            if(!drawTypeIcon(ctx,'greenhouse',cx,cy,t*0.8)){
              ctx.font=`${Math.max(14,t*0.8)}px serif`;
              ctx.textAlign='center'; ctx.textBaseline='middle';
              ctx.fillText('🌱',cx,cy);
            }
          }
        } else {
          // 2.173: грядка/постройка — иконка культуры → site-иконка типа → фолбэк эмодзи
          if(!drawCultureIcon(ctx, o.culture, cx, cy, t*0.9)){
            if(!drawTypeIcon(ctx, o.type, cx, cy, t*0.9)){
              ctx.font=`${Math.max(14,t*0.8)}px serif`;
              ctx.textAlign='center'; ctx.textBaseline='middle';
              ctx.fillText(emojiFor(o.culture),cx,cy);
            }
          }
        }
        o._isoTop=[tA,tB,tC,tD].map(p=>({x:p.x+ox,y:p.y+oy}));
        o._isoCircle=null;
      }
    });
    ctx.restore();
  }

  canvas.addEventListener('wheel',(e)=>{
    e.preventDefault();
    zoom=Math.min(2.5,Math.max(0.5, zoom*(e.deltaY<0?1.1:0.9)));
    render();
  },{passive:false});
  canvas.addEventListener('click',(e)=>{
    const r=canvas.getBoundingClientRect();
    const px=e.clientX-r.left, py=e.clientY-r.top;
    for(let i=order.length-1;i>=0;i--){
      const o=order[i];
      if(o._isoCircle){
        const dx=px-o._isoCircle.x, dy=py-o._isoCircle.y;
        if(dx*dx+dy*dy<=o._isoCircle.r*o._isoCircle.r){ if(onSelect) onSelect(o.id); return; }
      } else if(o._isoTop && pointInPoly(px,py,o._isoTop)){
        if(onSelect) onSelect(o.id); return;
      }
    }
  });
  window.addEventListener('resize',()=>{
    const w=document.getElementById('isoWrap');
    if(w && !w.classList.contains('hidden')) render();
  });
  // 2.57: перерисовка после загрузки иконок
  requestIsoRender = ()=>{ render(); };
  return { render };
}