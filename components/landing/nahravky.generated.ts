// Vygeneroval scripts/nahravky/nahraj.mjs, neupravovat ručně.
// Rozměr a délka každé nahrávky: stránka z nich drží poměr stran dřív, než se
// video stáhne, takže se po načtení nic neposune.
export const NAHRAVKY_ROZMERY: Record<string, { w: number; h: number; sec: number; mp4: number; webm: number }> = {
  'kiosk': { w: 960, h: 720, sec: 12.5, mp4: 206727, webm: 210157 },
  'rozvrh': { w: 1280, h: 720, sec: 13.5, mp4: 383275, webm: 428067 },
  'sklad': { w: 1280, h: 720, sec: 13.4, mp4: 347535, webm: 394475 },
  'togo': { w: 360, h: 720, sec: 13.6, mp4: 316999, webm: 389263 },
  'ukol-uzaverka': { w: 360, h: 720, sec: 10.7, mp4: 291595, webm: 354481 },
};
