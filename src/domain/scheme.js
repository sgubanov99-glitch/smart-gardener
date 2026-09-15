// src/domain/scheme.js — модель данных участка (ревизия 2.66)
// 2.66: добавлено поле plotName — уникальное имя участка (сохраняется в файл плана)

export function norm(s){ return String(s||'').trim().toLowerCase(); }

export function clampNum(v, min, max){
  const n = Number(v);
  if(!isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// объект валиден, если в границах участка и не пересекается с другими объектами
export function objValid(scheme, obj){
  if(obj.x < -0.001 || obj.y < -0.001) return false;
  if(obj.x + obj.w > scheme.widthM + 0.001) return false;
  if(obj.y + obj.l > scheme.lengthM + 0.001) return false;
  for(const o of scheme.objects){
    if(o.id === obj.id) continue;
    const overlapX = obj.x < o.x + o.w && o.x < obj.x + obj.w;
    const overlapY = obj.y < o.y + o.l && o.y < obj.y + obj.l;
    if(overlapX && overlapY) return false;
  }
  return true;
}

export function createScheme(){
  return {
    plotName: '',            // 2.66: уникальное имя участка
    widthM: 12,
    lengthM: 8,
    gridStepM: 0.5,
    sunDir: 'S',
    nextId: 1,
    objects: [],
    completedTasks: {}
  };
}

// уникальное имя вида «Грядка 1», «Грядка 2», …
export function nextUniqueName(scheme, base){
  const names = new Set((scheme.objects||[]).map(o => norm(o.name)));
  let n = 1;
  let candidate = base + ' ' + n;
  while(names.has(norm(candidate))){ n++; candidate = base + ' ' + n; }
  return candidate;
}