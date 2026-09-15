// src/domain/plant.js — загрузка базы культур (ревизия 2.29)
// 2.29: возвращаем region / sowing_timing / harvest_timing, чтобы карточка показывала данные

function deepTrim(v){
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(deepTrim);
  if (v && typeof v === 'object') { const r={}; for (const [k,val] of Object.entries(v)) r[k.trim()]=deepTrim(val); return r; }
  return v;
}

export async function loadPlants() {
  try {
    const res = await fetch('data/plants.json');
    if (!res.ok) throw new Error('HTTP');
    const raw = deepTrim(await res.json());
    const list = Array.isArray(raw) ? raw : (raw.plants || []);
    return list.filter(p => p && p.name).map((p, i) => ({
      id: 'p' + i,
      name: p.name,
      type: p.type || '',
      region: p.region || '',
      sowing: p.sowing_timing || '',
      harvest: p.harvest_timing || '',
      sowing_timing: p.sowing_timing || '',   // 2.29: для карточки
      harvest_timing: p.harvest_timing || '', // 2.29: для карточки
      care: p.care || {},
      diseases: p.diseases || [],
      light_requirements: Array.isArray(p.light_requirements) ? p.light_requirements : ['full_sun','partial_shade']
    }));
  } catch (e) {
    console.warn('plants.json не загрузился', e);
    return [];
  }
}