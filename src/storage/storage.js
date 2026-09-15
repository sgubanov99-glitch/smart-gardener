// src/storage/storage.js — сохранение и загрузка файла плана (ревизия 2.110)
// 2.110/2.98: блок geo сохраняется целиком (lat, lon, placeName, confirmed);
//        weather (mode, updatedAt) тоже сохраняется;
//        старые файлы без этих полей читаются как раньше
// 2.66: имя участка в файле плана
export class StorageService {

  /* ---------- сохранение ---------- */
  save(scheme){
    const data = {
      app: 'umny-sadovod',
      format: 2,
      savedAt: new Date().toISOString(),
      plotName: scheme.plotName || '',
      widthM: scheme.widthM,
      lengthM: scheme.lengthM,
      gridStepM: scheme.gridStepM,
      sunDir: scheme.sunDir || 'S',
      objects: scheme.objects || [],
      completedTasks: scheme.completedTasks || {},
      // 2.98/2.110: населённый пункт, координаты и флаг подтверждения
      geo: (scheme.geo && isFinite(scheme.geo.lat) && isFinite(scheme.geo.lon))
        ? { lat: scheme.geo.lat, lon: scheme.geo.lon, placeName: scheme.geo.placeName || null, confirmed: !!scheme.geo.confirmed }
        : null,
      // 2.98: режим погоды
      weather: (scheme.weather && scheme.weather.mode)
        ? { mode: scheme.weather.mode, updatedAt: scheme.weather.updatedAt || null }
        : null
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = ((scheme.plotName || '').trim() || 'умный-садовод')
      .replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'-');
    a.href = url;
    a.download = name + '-план.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  /* ---------- загрузка ---------- */
  load(scheme, cb){
    const input = document.getElementById('planFile');
    if (!input) return;
    input.value = '';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (data.plotName !== undefined) scheme.plotName = data.plotName || '';
          if (data.widthM !== undefined) scheme.widthM = data.widthM;
          if (data.lengthM !== undefined) scheme.lengthM = data.lengthM;
          if (data.gridStepM !== undefined) scheme.gridStepM = data.gridStepM;
          if (data.sunDir !== undefined) scheme.sunDir = data.sunDir;
          if (Array.isArray(data.objects)) scheme.objects = data.objects;
          if (data.completedTasks && typeof data.completedTasks === 'object') scheme.completedTasks = data.completedTasks;
          // 2.98/2.110: гео-блок с флагом confirmed
          if (data.geo && typeof data.geo === 'object') {
            const lat = Number(data.geo.lat);
            const lon = Number(data.geo.lon);
            scheme.geo = {
              lat: isFinite(lat) ? lat : 55.75,
              lon: isFinite(lon) ? lon : 37.62,
              placeName: data.geo.placeName || null,
              confirmed: !!data.geo.confirmed
            };
          }
          // 2.98: режим погоды
          if (data.weather && typeof data.weather === 'object' && data.weather.mode) {
            scheme.weather = { mode: data.weather.mode, updatedAt: data.weather.updatedAt || null };
          }
          if (cb) cb();
        } catch (e) {
          console.error('Не удалось загрузить план:', e);
          alert('Не удалось загрузить план: файл повреждён или это не файл плана.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
}