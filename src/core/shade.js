// core/shade.js — расчёт и отрисовка тени (чистая логика + отрисовка на canvas)
export const SUN = { altitudeDeg: 55 };
const TAN_ALT = Math.tan(SUN.altitudeDeg * Math.PI / 180);

export const SUN_MARKER_POS = {
  N:{left:'50%',top:'0%',transform:'translate(-50%,-130%)'},
  S:{left:'50%',top:'100%',transform:'translate(-50%,15%)'},
  E:{left:'100%',top:'50%',transform:'translate(15%,-50%)'},
  W:{left:'0%',top:'50%',transform:'translate(-115%,-50%)'},
  NE:{left:'100%',top:'0%',transform:'translate(15%,-115%)'},
  NW:{left:'0%',top:'0%',transform:'translate(-115%,-115%)'},
  SE:{left:'100%',top:'100%',transform:'translate(15%,15%)'},
  SW:{left:'0%',top:'100%',transform:'translate(-115%,15%)'}
};

export function shadowVector(dir) {
  switch (dir) {
    case 'N': return [0, 1];   case 'NE': return [-1, 1];
    case 'E': return [-1, 0];  case 'SE': return [-1, -1];
    case 'S': return [0, -1];  case 'SW': return [1, -1];
    case 'W': return [1, 0];   case 'NW': return [1, 1];
    default: return [0, -1];
  }
}

export function computeShade(scheme) {
  const cell = 0.5;
  const cols = Math.max(1, Math.round(scheme.widthM / cell));
  const rows = Math.max(1, Math.round(scheme.lengthM / cell));
  const levels = new Uint8Array(cols * rows);
  const casters = scheme.objects.filter(o => (o.height_m || 0) > 0);
  const [ux, uy] = shadowVector(scheme.sunDir || 'S');
  const shadows = casters.map(o => {
    const L = (o.height_m || 0) / TAN_ALT;
    return {
      foot: { x0:o.x, x1:o.x + o.w, y0:o.y, y1:o.y + o.l },
      shade: {
        x0: o.x + (ux < 0 ? -L : 0),
        x1: o.x + o.w + (ux > 0 ? L : 0),
        y0: o.y + (uy < 0 ? -L : 0),
        y1: o.y + o.l + (uy > 0 ? L : 0)
      }
    };
  });
  const inRect = (mx, my, r) => mx >= r.x0 && mx <= r.x1 && my >= r.y0 && my <= r.y1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mx = (c + 0.5) * cell, my = (r + 0.5) * cell;
      let cnt = 0;
      for (const s of shadows) {
        if (inRect(mx, my, s.shade) && !inRect(mx, my, s.foot)) cnt += 1;
      }
      levels[r * cols + c] = cnt >= 2 ? 2 : cnt === 1 ? 1 : 0;
    }
  }
  return { cell, cols, rows, levels };
}

export function drawShade(canvas, scheme, shadeGrid, ppm, gridStepM) {
  if (!canvas || !shadeGrid) return;
  canvas.width = Math.round(scheme.widthM * ppm);
  canvas.height = Math.round(scheme.lengthM * ppm);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const px = shadeGrid.cell * ppm;
  // сетка
  ctx.strokeStyle = 'rgba(70,110,80,0.18)'; ctx.lineWidth = 1;
  const sp = gridStepM * ppm;
  for (let x = sp; x < canvas.width; x += sp) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, canvas.height); ctx.stroke(); }
  for (let y = sp; y < canvas.height; y += sp) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(canvas.width, y + 0.5); ctx.stroke(); }
  // тень
  const colors = ['rgba(120,170,90,0.10)', 'rgba(245,200,60,0.42)', 'rgba(55,55,55,0.55)'];
  for (let r = 0; r < shadeGrid.rows; r++) {
    for (let c = 0; c < shadeGrid.cols; c++) {
      const l = shadeGrid.levels[r * shadeGrid.cols + c];
      if (l === 0) continue;
      ctx.fillStyle = colors[l];
      ctx.fillRect(c * px, r * px, px, px);
    }
  }
}