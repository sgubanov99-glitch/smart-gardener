// core/phaseMachine.js — машина фаз (только вперёд)
export const PHASE_ORDER = ['seed','seedling','planting','vegetative','flowering','fruiting','senescence'];
export const PHASE_META = {
  seed:       { label:'Посев семян',       icon:'🌰', color:'#A0522D' },
  seedling:   { label:'Рассада',           icon:'🌱', color:'#9CCC65' },
  planting:   { label:'Высадка в грунт',   icon:'🪴', color:'#66BB6A' },
  vegetative: { label:'Активный рост',     icon:'🌿', color:'#43A047' },
  flowering:  { label:'Цветение',          icon:'🌸', color:'#F06292' },
  fruiting:   { label:'Плодоношение',      icon:'🍅', color:'#E53935' },
  senescence: { label:'Завершение сезона', icon:'🍂', color:'#DAA520' }
};

export function advancePhase(bed, newPhase, cropPhases) {
  if (!cropPhases || !cropPhases[newPhase]) return false;
  const order = PHASE_ORDER.filter(ph => cropPhases[ph]);
  const curIdx = order.indexOf(bed.phase);
  const newIdx = order.indexOf(newPhase);
  if (newIdx <= curIdx) return false; // только вперёд
  const today = toDateStr(new Date());
  (bed.phase_history = bed.phase_history || []).forEach(h => { if (!h.ended) h.ended = today; });
  bed.phase = newPhase;
  bed.phase_started = today;
  bed.phase_history.push({ phase: newPhase, started: today, ended: null });
  return true;
}

function toDateStr(d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }