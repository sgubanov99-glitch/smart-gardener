// src/bot/bot.js — чат-бот садовода (ревизия 2.67; служит bot.js последней ревизии 2.68)
// 2.67: sowNow() читает sowing_timing — «Помоги посадить», ⭐ и выбор по номеру снова работают
// 2.51: сценарии «Что посадить на…?» и «Помоги посадить» (многошаговые, с расстановкой на схеме)
import { PHASE_ORDER, PHASE_META } from '../core/phaseMachine.js';
import { fitsLight, compatOk, rotationOk, neighborsCultures, planPlacements } from '../core/planner.js';

const MONTHS_LOW = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const LABELS = { bed:'Грядка', greenhouse:'Теплица', tree:'Дерево', bush:'Кустарник' };

function norm(s){ return String(s||'').trim().toLowerCase(); }
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function yesNo(t){
  const s=norm(t);
  if(/^(да|подтвер|ок|okay|ok|хорошо|согласен|добав)/.test(s)) return true;
  if(/^(нет|отмен|не надо|stop|стоп)/.test(s)) return false;
  return null;
}

export function createBot({ scheme, plants, phases, compat, generateTasks, onAdvancePhase, onStateChanged }){
  let s = null; // сессия диалога

  function phaseDataFor(culture){
    if(!phases||!culture) return null;
    if(phases[culture]) return phases[culture];
    const n=norm(culture);
    const k=Object.keys(phases).find(k=>norm(k)===n);
    return k?phases[k]:null;
  }
  function plantByName(name){ return plants.find(p=>norm(p.name)===norm(name)); }

  // 2.67: поле сроков в plants.json — sowing_timing (sowing оставлено как запасное)
  function sowNow(){
    const m=MONTHS_LOW[new Date().getMonth()];
    return plants.filter(p=>((p.sowing_timing||p.sowing)||'').toLowerCase().includes(m));
  }

  function typeFor(plant){ const t=norm(plant&&plant.type); if(t.includes('дерево'))return 'tree'; if(t.includes('кустарник'))return 'bush'; return 'bed'; }
  function canGreenhouse(plant){ return typeFor(plant)==='bed'; }

  function findObject(text){
    const n=norm(text);
    let m=n.match(/грядк[ауеы]?\s*(\d+)/);
    if(m){ const beds=scheme.objects.filter(o=>o.type==='bed'); if(beds[+m[1]-1]) return beds[+m[1]-1]; }
    m=n.match(/теплиц[ауеы]?\s*(\d+)/);
    if(m){ const ghs=scheme.objects.filter(o=>o.type==='greenhouse'); if(ghs[+m[1]-1]) return ghs[+m[1]-1]; }
    return scheme.objects.find(o=> norm(o.name).length>2 && n.includes(norm(o.name)));
  }

  function setCultureOn(obj, culture){
    obj.culture=culture;
    if(!obj.plantingDate) obj.plantingDate=todayStr();
    if(obj.type==='bed'){
      const year=new Date().getFullYear();
      obj.history=(obj.history||[]).filter(h=>h.year!==year);
      obj.history.push({year, culture});
    }
    const cp=phaseDataFor(culture);
    if(cp && !obj.phase){
      const order=PHASE_ORDER.filter(ph=>cp[ph]);
      let first=order[0]||null;
      if((obj.type==='tree'||obj.type==='bush') && obj.plantingDate){
        const py=parseInt(String(obj.plantingDate).slice(0,4),10);
        if(py<new Date().getFullYear()){
          const sk=order.find(ph=>!['seed','seedling','planting'].includes(ph));
          if(sk) first=sk;
        }
      }
      if(first){ obj.phase=first; obj.phase_started=obj.plantingDate||todayStr(); obj.phase_history=[{phase:first,started:obj.phase_started,ended:null}]; }
    }
  }

  function candidatesFor(obj){
    const isTree=obj.type==='tree', isBush=obj.type==='bush';
    const pool=plants.filter(p=>{ const t=typeFor(p); if(isTree)return t==='tree'; if(isBush)return t==='bush'; return t==='bed'; });
    const now=sowNow().map(p=>norm(p.name));
    const probe={id:obj.id,x:obj.x,y:obj.y,w:obj.w,l:obj.l,type:obj.type};
    return pool.filter(p=> fitsLight(scheme,probe,p) && compatOk(compat,p.name,neighborsCultures(scheme,probe)) && rotationOk(scheme,obj,p.name,compat))
      .sort((a,b)=> (now.includes(norm(b.name))?1:0)-(now.includes(norm(a.name))?1:0));
  }

  /* ---------- сценарий A: «Что посадить на…?» ---------- */
  function flowAStart(text){
    const obj=findObject(text);
    if(obj) return proposeCultures(obj);
    s={flow:'A', step:'object'};
    const list=scheme.objects.map(o=>o.name).join(', ')||'(пока нет объектов)';
    return 'На каком объекте посадить? Укажите название или номер, например «грядка 1».\nОбъекты: '+list+'.';
  }
  function proposeCultures(obj){
    const cands=candidatesFor(obj).slice(0,6);
    if(!cands.length){ s=null; return 'Для «'+obj.name+'» сейчас нет подходящих культур (свет/совместимость/севооборот). Попробуйте другой объект.'; }
    const now=sowNow().map(p=>norm(p.name));
    s={flow:'A', step:'culture', objId:obj.id, candidates:cands.map(p=>p.name)};
    return 'Объект «'+obj.name+'». Подходящие культуры (свет, совместимость, севооборот; ⭐ — сеют в этом месяце):\n'+
      cands.map((p,i)=>(i+1)+'. '+p.name+(now.includes(norm(p.name))?' ⭐':'')).join('\n')+
      '\nНапишите номер или название культуры.';
  }

  /* ---------- сценарий B: «Помоги посадить» ---------- */
  function flowBStart(){
    s={flow:'B', step:'list'};
    const now=sowNow();
    return 'Какие культуры посадить? Перечислите до 6 через запятую.\nСеют в этом месяце:\n'+(now.slice(0,8).map((p,i)=>(i+1)+'. '+p.name).join('\n')||'—')+'\nМожно номера или названия.';
  }
  function parseCultureList(text){
    const tokens=norm(text).split(/[,;\n]|\s+и\s+/).map(t=>t.trim()).filter(Boolean);
    const now=sowNow();
    const out=[];
    tokens.forEach(tok=>{
      const num=parseInt(tok,10);
      let name=null;
      if(!isNaN(num) && num>=1 && num<=now.length) name=now[num-1].name;
      else { const p=plantByName(tok); if(p) name=p.name; }
      if(name && !out.includes(name)) out.push(name);
    });
    return out.slice(0,6);
  }
  function parsePlaceMap(text){
    const map={};
    norm(text).split(/[,;\n]/).forEach(tok=>{
      const m=tok.match(/^(.*?)[\s:.-]*(грядк[ауеы]?|теплиц[ауеы]?)$/);
      if(!m) return;
      const culture=plantByName(m[1].trim());
      if(!culture) return;
      map[norm(culture.name)] = /теплиц/.test(m[2]) ? 'greenhouse' : 'bed';
    });
    return map;
  }
  function describePlan(pl){
    if(pl.kind==='gh_assign'){
      const gh=scheme.objects.find(o=>o.id===pl.objId);
      return 'теплица «'+(gh?gh.name:'')+'», грядка '+(pl.bedIndex+1);
    }
    return (LABELS[pl.type]||pl.type)+' ('+pl.x+', '+pl.y+') '+(pl.flipped?'горизонтально':'вертикально');
  }
  function buildPlan(names, map){
    const requests=names.map(n=>{
      const p=plantByName(n);
      let place=map[norm(n)];
      if(!place && p){ const t=typeFor(p); place = t==='tree'?'tree': t==='bush'?'bush':'bed'; }
      return {culture:n, place: place||'bed'};
    });
    const res=planPlacements(scheme, compat, plants, requests);
    if(!res.plan.length && res.failed.length){
      s=null;
      return '⚠ Не хватает места на схеме для: '+res.failed.map(f=>f.culture).join(', ')+'. Освободите место (передвиньте/удалите объекты) и повторите «помоги посадить».';
    }
    s={flow:'B', step:'confirm', plan:res.plan, failed:res.failed};
    let msg='План размещения:\n'+res.plan.map((pl,i)=>(i+1)+'. '+pl.culture+' → '+describePlan(pl)).join('\n');
    if(res.failed.length) msg+='\n⚠ Не поместилось (нужно место): '+res.failed.map(f=>f.culture).join(', ')+'. Освободите место и повторите запрос.';
    msg+='\nПодтвердить добавление на схему? «да» / «нет».';
    return msg;
  }
  function applyPlan(plan){
    plan.forEach(pl=>{
      if(pl.kind==='gh_assign'){
        const gh=scheme.objects.find(o=>o.id===pl.objId);
        if(!gh) return;
        gh.greenhouseBedCultures[pl.bedIndex]=pl.culture;
        (gh.greenhouseBedPlantingDates=gh.greenhouseBedPlantingDates||[])[pl.bedIndex]=todayStr();
        const cp=phaseDataFor(pl.culture);
        if(cp){ const f=PHASE_ORDER.find(ph=>cp[ph]); if(f){ (gh.greenhouseBedPhases=gh.greenhouseBedPhases||[])[pl.bedIndex]={phase:f,phase_started:todayStr(),phase_history:[{phase:f,started:todayStr(),ended:null}]}; } }
        return;
      }
      const count=scheme.objects.filter(o=>o.type===pl.type).length;
      const obj={ id:scheme.nextId++, type:pl.type, name:(LABELS[pl.type]||'Объект')+' '+(count+1), culture:null, plantingDate:null, x:pl.x, y:pl.y, w:pl.w, l:pl.l };
      if(pl.type==='tree') obj.height_m=3;
      if(pl.type==='bush') obj.height_m=1.5;
      if(pl.type==='greenhouse'){ obj.height_m=2.5; obj.greenhouseBedCount=1; obj.greenhouseBedCultures=[null]; obj.greenhouseBedPlantingDates=[null]; obj.greenhouseBedPhases=[null]; }
      scheme.objects.push(obj);
      if(pl.type==='greenhouse'){
        obj.greenhouseBedCultures[0]=pl.culture; obj.greenhouseBedPlantingDates[0]=todayStr();
        const cp=phaseDataFor(pl.culture);
        if(cp){ const f=PHASE_ORDER.find(ph=>cp[ph]); if(f) obj.greenhouseBedPhases[0]={phase:f,phase_started:todayStr(),phase_history:[{phase:f,started:todayStr(),ended:null}]}; }
      } else setCultureOn(obj, pl.culture);
    });
  }

  /* ---------- простые поведения ---------- */
  function status(text){
    const obj=findObject(text);
    if(!obj) return 'Не нашёл объект. Укажите, например, «грядка 1».';
    const cults = obj.type==='greenhouse' ? (obj.greenhouseBedCultures||[]).filter(Boolean) : (obj.culture?[obj.culture]:[]);
    if(!cults.length) return '«'+obj.name+'»: культура не задана.';
    return '«'+obj.name+'»: '+cults.join(', ')+'.';
  }
  function matchPhase(t){
    const map=[[/зацвел|цветени/,'flowering'], [/плодонос|созрел|урожай/,'fruiting'], [/взош|пророс|рассад/,'seedling'], [/посажен|посеян|посадк/,'planting']];
    for(const [re,ph] of map){ if(re.test(t)) return ph; }
    return null;
  }
  function applyPhase(text, ph){
    const p=plants.find(pp=> norm(text).includes(norm(pp.name)));
    if(!p) return 'Укажите культуру, например «томаты зацвели».';
    const obj=scheme.objects.find(o=> o.culture && norm(o.culture)===norm(p.name));
    if(!obj) return 'Не нашёл объект с культурой «'+p.name+'».';
    if(onAdvancePhase) onAdvancePhase(obj.id, null, ph);
    return 'Принял: «'+obj.name+'» → фаза '+(PHASE_META[ph]?PHASE_META[ph].label:ph)+'. Календарь обновлён.';
  }

  /* ---------- маршрутизация сессии ---------- */
  function sessionRoute(text){
    if(/отмен|стоп|stop/.test(norm(text))){ s=null; return 'Диалог отменён.'; }
    if(s.flow==='A'){
      if(s.step==='object'){
        const obj=findObject(text);
        if(!obj) return 'Не нашёл объект. Укажите, например, «грядка 1» или название.';
        return proposeCultures(obj);
      }
      if(s.step==='culture'){
        const obj=scheme.objects.find(o=>o.id===s.objId);
        const num=parseInt(norm(text),10);
        let pick=null;
        if(!isNaN(num) && num>=1 && num<=s.candidates.length) pick=s.candidates[num-1];
        else { const p=plantByName(text); if(p && s.candidates.includes(p.name)) pick=p.name; }
        if(!pick) return 'Выберите культуру из списка номером или названием.';
        s.pendingCulture=pick;
        if(obj.culture){
          s.step='confirm_replace';
          return '⚠ ВНИМАНИЕ: объект «'+obj.name+'» уже занят культурой «'+obj.culture+'». Замена приведёт к пересчёту Календаря и сбросу фаз. Подтвердите осознанно: «да» — заменить, «нет» — отмена.';
        }
        s.step='confirm_add';
        return 'Посадить «'+pick+'» на «'+obj.name+'»? Ответьте «да» или «нет».';
      }
      if(s.step==='confirm_add' || s.step==='confirm_replace'){
        const yn=yesNo(text);
        if(yn===null) return 'Ответьте «да» или «нет».';
        const obj=scheme.objects.find(o=>o.id===s.objId);
        const culture=s.pendingCulture;
        s=null;
        if(!yn) return 'Отменено.';
        setCultureOn(obj, culture);
        if(onStateChanged) onStateChanged();
        return 'Готово: «'+obj.name+'» → «'+obj.culture+'». Календарь пересчитан.';
      }
    }
    if(s.flow==='B'){
      if(s.step==='list'){
        const names=parseCultureList(text);
        if(!names.length) return 'Не распознал культуры. Перечислите названия или номера через запятую (до 6).';
        s.list=names;
        const ambiguous=names.filter(n=>{ const p=plantByName(n); return p && canGreenhouse(p); });
        if(ambiguous.length){
          s.step='place';
          return 'Уточните место для культур, которые можно и в грядке и в теплице: напишите через запятую «название:грядка» или «название:теплица».\nНужно уточнить: '+ambiguous.join(', ')+'.';
        }
        return buildPlan(names, {});
      }
      if(s.step==='place'){
        const map=parsePlaceMap(text);
        return buildPlan(s.list, map);
      }
      if(s.step==='confirm'){
        const yn=yesNo(text);
        if(yn===null) return 'Ответьте «да» или «нет».';
        const plan=s.plan;
        s=null;
        if(!yn) return 'Отменено.';
        applyPlan(plan);
        if(onStateChanged) onStateChanged();
        return 'Добавлено на схему: '+plan.map(p=>p.culture).join(', ')+'. Календарь пересчитан.';
      }
    }
    s=null;
    return respond(text);
  }

  function respond(text){
    const t=norm(text);
    if(s) return sessionRoute(text);
    if(/что посадить/.test(t)) return flowAStart(text);
    if(/помоги\s+посадить|помоги.*посадить/.test(t)) return flowBStart();
    if(/что с|состояние|как дела/.test(t)) return status(text);
    const ph=matchPhase(t);
    if(ph) return applyPhase(text, ph);
    return 'Могу: «Что посадить на …?», «Помоги посадить», «Что с грядкой 1?» или сообщите о смене фазы («томаты зацвели»).';
  }

  return { respond };
}