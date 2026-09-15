// src/core/planting.js — схема посадки, оценка урожая, возраст плодоношения (ревизия 2.85)
// 2.85: первый год плодоношения многолетников (first_fruit_year)
// 2.64: схемы посадки и оценка урожая

function norm(s){ return String(s||'').trim().toLowerCase(); }

export function plantingRef(planting, culture){
  if(!planting || !culture) return null;
  const n = norm(culture);
  if(planting[n]) return planting[n];
  const k = Object.keys(planting).find(k => norm(k) === n);
  return k ? planting[k] : null;
}

export function estimateCount(ref, entry){
  if(!ref || !entry) return null;
  const spacing = Number(ref.spacing_cm) || 0;
  const rowSpacing = Number(ref.row_spacing_cm) || spacing;
  if(entry.kind === 'perennial') return { count: 1, rows: null, perRow: null };
  if(!(spacing > 0)) return null;
  const edge = Number(ref.edge_margin_cm) || 10;
  if(entry.kind === 'bed'){
    const rows = Math.max(1, Math.floor(((entry.wM||0)*100 - 2*edge) / rowSpacing) + 1);
    const perRow = Math.max(1, Math.floor(((entry.lM||0)*100 - 2*edge) / spacing) + 1);
    return { count: rows*perRow, rows: rows, perRow: perRow };
  }
  if(entry.kind === 'greenhouseBed'){
    const area = Math.max(0.5, Number(entry.areaM2)||0);
    const cellM2 = (spacing * rowSpacing) / 10000;
    return { count: Math.max(1, Math.round(area / (cellM2||0.25))), rows: null, perRow: null };
  }
  return null;
}

export function estimateYieldKg(ref, count){
  if(!ref || count == null) return null;
  const perPlant = Number(ref.yield_per_plant_kg);
  if(!isFinite(perPlant)) return null;
  return Math.round(count * perPlant * 10) / 10;
}

/* 2.85: возраст первого плодоношения многолетника (по умолчанию — со 2-го года после посадки) */
export function firstFruitYear(ref){
  const n = Number(ref && ref.first_fruit_year);
  return (isFinite(n) && n >= 1) ? n : 2;
}

/* 2.85: плодоносит ли растение в году `year` (year — число, например 2026) */
export function perennialBearsIn(year, plantingDate, ref){
  if(!plantingDate) return true; // возраст неизвестен — считаем плодоносящим
  const py = parseInt(String(plantingDate).slice(0,4), 10);
  if(!isFinite(py)) return true;
  return (year - py + 1) >= firstFruitYear(ref);
}