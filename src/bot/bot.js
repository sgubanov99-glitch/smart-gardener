// src/bot/bot.js — чат-бот садовода (ревизия 2.163)
// 2.163: ГЛАВНОЕ ИСПРАВЛЕНИЕ: в JS \w НЕ включает кириллицу ([A-Za-z0-9_]), поэтому /грядк\w*/
//        не матчил «грядка/грядке/грядкой/грядку»; заменено на [а-яё]* — работают ВСЕ падежи:
//        «грядка 1», «грядке 1», «грядкой 1», «грядку 1», «грядки 1», «теплица/теплице/теплицей 1»…
// 2.162: статус = культура + фаза + приписка «(или напишите „отменить“)»; сценарий P (уточнение фазы
//        списком → предупреждение о пересчёте → перевод только после «да»); явный выход «отменить»
// 2.67: sowNow() читает sowing_timing — «Помоги посадить», ⭐ и выбор по номеру работают
// 2.51: сценарии «Что посадить на…?» и «Помоги посадить» (многошаговые, с расстановкой на схеме)
import { PHASE_ORDER, PHASE_META } from '../core/phaseMachine.js';
import { fitsLight, compatOk, rotationOk, neighborsCultures, planPlacements } from '../core/planner.js';

const MONTHS_LOW = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const LABELS = { bed:'Грядка', greenhouse:'Теплица', tree:'Дерево', bush:'Кустарник' };
const CANCEL_HINT = ' (или напишите «отменить»)';

function norm(s){ return String(s||'').trim().toLowerCase(); }
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function yesNo(t){
  const s=norm(t);
  if(/^(да|подтвер|ок|okay|ok|хорошо|согласен|добав)/.test(s)) return true;
  if(/^(нет|не надо|stop|стоп)/.test(s)) return false;
  return null;
}
function isCancel(t){
  return /отмен|отменить|стоп|stop|другой вопрос|начать заново|сброс диалог/.test(norm(t));
}
// номер в конце имени объекта: «Грядка 1» → 1, «Теплица 2» → 2
function nameNum(o){
  const m = /(\d+)\s*$/.exec(String((o && o.name) || ''));
  return m ? +m[1] : null;
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
  function sowNow(){
    const m=MONTHS_LOW[new Date().getMonth()];
    return plants.filter(p=>((p.sowing_timing||p.sowing)||'').toLowerCase().includes(m));
  }
  function typeFor(plant){ const t=norm(plant&&plant.type); if(t.includes('дерево'))return 'tree'; if(t.includes('кустарник'))return 'bush'; return 'bed'; }
  function canGreenhouse(plant){ return typeFor(plant)==='bed'; }

  // 2.163: [а-яё]* вместо \w* — кириллические падежи матчатся; номер берётся ИЗ ИМЕНИ объекта,
  // фолбэк по порядку создания и по вхождению полного имени
  function findObject(text){
    const n = norm(text);
    let m = n.match(/грядк[а-яё]*[\s.-]*(\d+)/);
    if (m) {
      const num = +m[1];
      let o = scheme.objects.find(x => x.type==='bed' && nameNum(x)===num);
      if (!o) { const beds = scheme.objects.filter(x=>x.type==='bed'); o = beds[num-1]; }
      if (o) return o;
    }
    m = n.match(/теплиц[а-яё]*[\s.-]*(\d+)/);
    if (m) {
      const num = +m[1];
      let o = scheme.objects.find(x => x.type==='greenhouse' && nameNum(x)===num);
      if (!o) { const ghs = scheme.objects.filter(x=>x.type==='greenhouse'); o = ghs[num-1]; }
      if (o) return o;
    }
    m = n.match(/(дерев[а-яё]*|кустарн[а-яё]*|куст[а-яё]*)[\s.-]*(\d+)/);
    if (m) {
      const num = +m[2];
      const type = /дерев/.test(m[1]) ? 'tree' : 'bush';
      let o = scheme.objects.find(x => x.type===type && nameNum(x)===num);
      if (!o) { const arr = scheme.objects.filter(x=>x.type===type); o = arr[num-1]; }
      if (o) return o;
    }
    return scheme.objects.find(o => norm(o.name).length>2 && n.includes(norm(o.name)));
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
    return 'На каком объекте посадить? Укажите название или номер, например «грядка 1».\nОбъекты: '+list+'.'+CANCEL_HINT;
  }
  function proposeCultures(obj){
    const cands=candidatesFor(obj).slice(0,6);
    if(!cands.length){ s=null; return 'Для «'+obj.name+'» сейчас нет подходящих культур (свет/совместимость/севооборот). Попробуйте другой объект.'; }
    const now=sowNow().map(p=>norm(p.name));
    s={flow:'A', step:'culture', objId:obj.id, candidates:cands.map(p=>p.name)};
    return 'Объект «'+obj.name+'». Подходящие культуры (свет, совместимость, севооборот; ⭐ — сеют в этом месяце):\n'+
      cands.map((p,i)=>(i+1)+'. '+p.name+(now.includes(norm(p.name))?' ⭐':'')).join('\n')+
      '\nНапишите номер или название культуры.'+CANCEL_HINT;
  }

  /* ---------- сценарий B: «Помоги посадить» ---------- */
  function flowBStart(){
    s={flow:'B', step:'list'};
    const now=sowNow();
    return 'Какие культуры посадить? Перечислите до 6 через запятую.\nСеют в этом месяце:\n'+(now.slice(0,8).map((p,i)=>(i+1)+'. '+p.name).join('\n')||'—')+'\nМожно номера или названия.'+CANCEL_HINT;
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
  // 2.163: [а-яё]* вместо \w* — «томат:грядкой»/«томат:теплице» разбираются корректно
  function parsePlaceMap(text){
    const map={};
    norm(text).split(/[,;\n]/).forEach(tok=>{
      const m=tok.match(/^(.+?)[\s:.-]*(грядк[а-яё]*|теплиц[а-яё]*)$/);
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
    msg+='\nПодтвердить добавление на схему? «да» / «нет».'+CANCEL_HINT;
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

  /* ---------- статус объекта = культура + фаза + приписка про «отменить» ---------- */
  function status(text){
    const obj=findObject(text);
    if(!obj) return 'Не нашёл объект. Укажите, например, «грядка 1» или «грядкой 1».'+CANCEL_HINT;
    if(obj.type==='greenhouse'){
      const lines=[];
      (obj.greenhouseBedCultures||[]).forEach((c,i)=>{
        if(!c) return;
        const bp=(obj.greenhouseBedPhases||[])[i];
        const lab=(bp && bp.phase && PHASE_META[bp.phase]) ? PHASE_META[bp.phase].label : 'фаза не задана';
        lines.push('грядка '+(i+1)+': '+c+' — '+lab);
      });
      if(!lines.length) return '«'+obj.name+'»: культура не задана.'+CANCEL_HINT;
      return '«'+obj.name+'»:\n'+lines.join('\n')+'.'+CANCEL_HINT;
    }
    if(!obj.culture) return '«'+obj.name+'»: культура не задана.'+CANCEL_HINT;
    const lab=(obj.phase && PHASE_META[obj.phase]) ? PHASE_META[obj.phase].label : 'фаза не задана';
    return '«'+obj.name+'»: '+obj.culture+' — '+lab+(obj.phase_started? ' (с '+obj.phase_started+')':'')+'.'+CANCEL_HINT;
  }

  /* ---------- сценарий P: уточнение фазы с подтверждением ---------- */
  function matchPhase(t){
    const map=[[/зацвел|цветени/,'flowering'], [/плодонос|созрел|урожай/,'fruiting'], [/взош|пророс|рассад/,'seedling'], [/посажен|посеян|посадк/,'planting']];
    for(const [re,ph] of map){ if(re.test(t)) return ph; }
    return null;
  }
  function cropOnScheme(text){
    const n=norm(text);
    return plants.find(p=> n.includes(norm(p.name)) && scheme.objects.some(o=>
      (o.culture && norm(o.culture)===norm(p.name)) ||
      (o.greenhouseBedCultures||[]).some(c=>norm(c)===norm(p.name)) ));
  }
  function objectForCulture(culture){
    return scheme.objects.find(o=>
      (o.culture && norm(o.culture)===norm(culture)) ||
      (o.greenhouseBedCultures||[]).some(c=>norm(c)===norm(culture)));
  }
  function phaseListFor(culture){
    const cp=phaseDataFor(culture);
    if(!cp) return [];
    return PHASE_ORDER.filter(ph=>cp[ph]);
  }
  function confirmPhaseMsg(obj,culture,ph){
    return '⚠ ВНИМАНИЕ: перевод «'+obj.name+'» ('+culture+') в фазу «'+PHASE_META[ph].label+'» пересчитает Календарь, Обзор и Аналитику; значок на схеме и в настройках изменится. Подтвердите: «да» — перевести, «нет» — отмена.'+CANCEL_HINT;
  }
  function flowPStart(text){
    const p=cropOnScheme(text);
    if(!p) return null;
    const obj=objectForCulture(p.name);
    if(!obj) return null;
    const list=phaseListFor(p.name);
    if(!list.length) return null;
    const ph=matchPhase(text);
    if(ph && list.includes(ph)){
      s={flow:'P', step:'confirm', objId:obj.id, culture:p.name, phase:ph};
      return confirmPhaseMsg(obj,p.name,ph);
    }
    s={flow:'P', step:'phase', objId:obj.id, culture:p.name, candidates:list};
    return 'Не распознал фразу как фазу. В какой фазе сейчас «'+p.name+'»? Напишите номер или название:\n'+
      list.map((ph,i)=>(i+1)+'. '+PHASE_META[ph].label).join('\n')+'.'+CANCEL_HINT;
  }

  /* ---------- маршрутизация сессии ---------- */
  function sessionRoute(text){
    if(isCancel(text)){ s=null; return 'Диалог отменён. Можете задать новый вопрос.'; }
    if(s.flow==='A'){
      if(s.step==='object'){
        const obj=findObject(text);
        if(!obj) return 'Не нашёл объект. Укажите, например, «грядка 1» или название.'+CANCEL_HINT;
        return proposeCultures(obj);
      }
      if(s.step==='culture'){
        const obj=scheme.objects.find(o=>o.id===s.objId);
        const num=parseInt(norm(text),10);
        let pick=null;
        if(!isNaN(num) && num>=1 && num<=s.candidates.length) pick=s.candidates[num-1];
        else { const p=plantByName(text); if(p && s.candidates.includes(p.name)) pick=p.name; }
        if(!pick) return 'Выберите культуру из списка номером или названием.'+CANCEL_HINT;
        s.pendingCulture=pick;
        if(obj.culture){
          s.step='confirm_replace';
          return '⚠ ВНИМАНИЕ: объект «'+obj.name+'» уже занят культурой «'+obj.culture+'». Замена приведёт к пересчёту Календаря и сбросу фаз. Подтвердите осознанно: «да» — заменить, «нет» — отмена.'+CANCEL_HINT;
        }
        s.step='confirm_add';
        return 'Посадить «'+pick+'» на «'+obj.name+'»? Ответьте «да» или «нет».'+CANCEL_HINT;
      }
      if(s.step==='confirm_add' || s.step==='confirm_replace'){
        const yn=yesNo(text);
        if(yn===null) return 'Ответьте «да» или «нет».'+CANCEL_HINT;
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
        if(!names.length) return 'Не распознал культуры. Перечислите названия или номера через запятую (до 6).'+CANCEL_HINT;
        s.list=names;
        const ambiguous=names.filter(n=>{ const p=plantByName(n); return p && canGreenhouse(p); });
        if(ambiguous.length){
          s.step='place';
          return 'Уточните место для культур, которые можно и в грядке и в теплице: напишите через запятую «название:грядка» или «название:теплица».\nНужно уточнить: '+ambiguous.join(', ')+'.'+CANCEL_HINT;
        }
        return buildPlan(names, {});
      }
      if(s.step==='place'){
        const map=parsePlaceMap(text);
        return buildPlan(s.list, map);
      }
      if(s.step==='confirm'){
        const yn=yesNo(text);
        if(yn===null) return 'Ответьте «да» или «нет».'+CANCEL_HINT;
        const plan=s.plan;
        s=null;
        if(!yn) return 'Отменено.';
        applyPlan(plan);
        if(onStateChanged) onStateChanged();
        return 'Добавлено на схему: '+plan.map(p=>p.culture).join(', ')+'. Календарь пересчитан.';
      }
    }
    if(s.flow==='P'){
      if(s.step==='phase'){
        const list=s.candidates;
        const nn=norm(text);
        const num=parseInt(nn,10);
        let ph=null;
        if(!isNaN(num) && num>=1 && num<=list.length) ph=list[num-1];
        else ph=list.find(q=> nn===q || nn===norm(PHASE_META[q].label) || nn.includes(norm(PHASE_META[q].label)));
        if(!ph) return 'Выберите фазу из списка номером или названием.'+CANCEL_HINT;
        s.step='confirm'; s.phase=ph;
        const obj=scheme.objects.find(o=>o.id===s.objId);
        return confirmPhaseMsg(obj, s.culture, ph);
      }
      if(s.step==='confirm'){
        const yn=yesNo(text);
        if(yn===null) return 'Ответьте «да» или «нет».'+CANCEL_HINT;
        const obj=scheme.objects.find(o=>o.id===s.objId);
        const ph=s.phase; const culture=s.culture;
        s=null;
        if(!yn) return 'Отменено.';
        if(obj.type==='greenhouse'){
          const idx=(obj.greenhouseBedCultures||[]).findIndex(c=>norm(c)===norm(culture));
          if(onAdvancePhase) onAdvancePhase(obj.id, (idx>=0?idx:null), ph);
        } else {
          if(onAdvancePhase) onAdvancePhase(obj.id, null, ph);
        }
        if(onStateChanged) onStateChanged();
        return 'Готово: «'+obj.name+'» ('+culture+') → фаза '+PHASE_META[ph].label+'. Календарь, Обзор и Аналитика пересчитаны.';
      }
    }
    s=null;
    return respond(text);
  }

  function respond(text){
    const t=norm(text);
    if(s) return sessionRoute(text);
    if(isCancel(t)) return 'Активного диалога нет. Задайте вопрос, например «Что с грядкой 1?».';
    if(/что посадить/.test(t)) return flowAStart(text);
    if(/помоги\s+посадить|помоги.*посадить/.test(t)) return flowBStart();
    if(/что с|состояние|как дела/.test(t)) return status(text);
    const pf=flowPStart(text);
    if(pf) return pf;
    return 'Могу: «Что посадить на …?», «Помоги посадить», «Что с грядкой 1?» или сообщите о смене фазы («томаты зацвели»).';
  }

  return { respond };
}