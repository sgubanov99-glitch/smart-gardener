// src/ui/ux.js — подсказки, пустые состояния, форматы и иконки культур (ревизия 2.57)
// 2.57: экспорт getCropIconId (нужен 3D); Земляника садовая -> crop-wild-strawberry

export function screenHintHTML(text){
  return `<div class="screen-hint">💡 ${text}</div>`;
}

export function emptyStateHTML({ icon='🌱', title='Пока пусто', text='', actionLabel='', actionId='' }){
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-title">${title}</div>
    ${text ? `<div class="empty-state-text">${text}</div>` : ''}
    ${actionLabel && actionId ? `<button type="button" class="btn btn-olive empty-state-action" data-ux-action="${actionId}">${actionLabel}</button>` : ''}
  </div>`;
}

export function fmtDateRu(iso, withYear=true){
  if(!iso) return '—';
  const p = String(iso).split('-');
  if(p.length < 3) return String(iso);
  return withYear ? `${p[2]}.${p[1]}.${p[0]}` : `${p[2]}.${p[1]}`;
}

export function fmtNum(v){
  const n = Number(v);
  if(!isFinite(n)) return String(v);
  return String(Math.round(n*100)/100);
}

/* ---------- иконки культур из спрайта assets/icons.svg ---------- */
const CROP_ICON = {
  'яблоня':'crop-apple', 'груша':'crop-pear', 'слива':'crop-plum', 'вишня':'crop-cherry',
  'черешня':'crop-sweet-cherry', 'смородина':'crop-currant', 'крыжовник':'crop-gooseberry',
  'жимолость':'crop-honeysuckle', 'малина':'crop-raspberry', 'ежевика':'crop-blackberry',
  'виноград':'crop-grape', 'ирга':'crop-serviceberry', 'голубика':'crop-blueberry',
  'облепиха':'crop-seabuckthorn', 'арония':'crop-chokeberry', 'черноплодная':'crop-chokeberry',
  'барбарис':'crop-barberry', 'картофель':'crop-potato', 'лук':'crop-onion', 'чеснок':'crop-garlic',
  'укроп':'crop-dill', 'редис':'crop-radish', 'петрушка':'crop-parsley', 'салат':'crop-lettuce',
  'шпинат':'crop-spinach', 'кинза':'crop-cilantro', 'кориандр':'crop-cilantro',
  'огурец':'crop-cucumber', 'томат':'crop-tomato', 'помидор':'crop-tomato', 'перец':'crop-pepper',
  'кабачок':'crop-zucchini', 'тыква':'crop-pumpkin', 'патиссон':'crop-pattypan',
  'морковь':'crop-carrot',
  'клубника':'crop-strawberry',
  'земляника садовая':'crop-wild-strawberry',   // 2.57: отдельная иконка
  'земляника':'crop-wild-strawberry',
  'репа':'crop-turnip', 'баклажан':'crop-eggplant',
  'горох':'crop-pea', 'фасоль':'crop-bean', 'капуста':'crop-cabbage', 'свёкла':'crop-beet',
  'дыня':'crop-melon', 'арбуз':'crop-watermelon', 'рукола':'crop-arugula', 'руккола':'crop-arugula',
  'щавель':'crop-sorrel'
};

// 2.57: публичный резолвер id иконки (точное совпадение, затем подстрока)
export function getCropIconId(name){
  const n = String(name||'').trim().toLowerCase();
  if(!n) return null;
  if(CROP_ICON[n]) return CROP_ICON[n];
  const key = Object.keys(CROP_ICON).find(k => n.includes(k) || k.includes(n));
  return key ? CROP_ICON[key] : null;
}

export function cropIconHTML(name, sizePx, cls=''){
  const id = getCropIconId(name);
  if(!id) return '';
  const style = sizePx ? ` style="width:${sizePx}px;height:${sizePx}px"` : '';
  return `<svg class="icon ${cls}"${style} aria-hidden="true"><use href="#${id}"></use></svg>`;
}