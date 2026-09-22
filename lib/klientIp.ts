// IP adresa, ze které požadavek přišel — pro omezení pokusů.
//
// Na Vercelu sedí před funkcí proxy, takže `req.ip` je prázdné a skutečná
// adresa je v `x-forwarded-for` (první položka; další jsou proxy po cestě)
// nebo v `x-real-ip`. Hlavičku si klient umí podvrhnout, ale Vercel ji
// přepisuje vlastní hodnotou, takže na produkci je věrohodná. Mimo Vercel
// (lokální vývoj) padne vše do jednoho kbelíku „neznama" — to je v pořádku,
// limit tam jen nikomu nevadí.

type Hlavicky = Headers | Record<string, string | string[] | undefined> | undefined | null;

export function klientIp(h: Hlavicky): string {
  const cti = (k: string): string | undefined => {
    if (!h) return undefined;
    if (typeof (h as Headers).get === 'function') return (h as Headers).get(k) ?? undefined;
    const v = (h as Record<string, string | string[] | undefined>)[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const xff = cti('x-forwarded-for');
  const prvni = xff?.split(',')[0]?.trim();
  return (prvni || cti('x-real-ip')?.trim() || 'neznama').slice(0, 64);
}
