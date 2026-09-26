// „K výrobě" — tvar dat z /api/production (co si směna má uvařit, upéct
// nebo namíchat, s recepturou a stavem surovin).
//
// Kolo 69 (balík B3): karta ProductionBoard, která se kreslila natvrdo na
// Domů zaměstnance, v TO GO a ve Skladu vedení (modrá tónovaná karta,
// „v úkolech →", limetkový odkaz na návod, ruční okno Vyrobeno), je pryč —
// nahradil ji widget vyroba.k_vyrobe (components/widgety/oblasti/sklad.tsx),
// který si člověk dá na kteroukoli plochu. Zůstal jen typ, ze kterého widget
// čte; soubor drží jméno, ať se typ hledá tam, kde se hledal vždycky.

export interface ToMake {
  taskId: number; title: string; priority: string; status: string;
  item: { id: number; name: string; unit: string; status: string; quantity: number; available: number; recipeUnit: string };
  batches: number; yieldTotal: number; batchYield: number | null; steps: string | null;
  /** Návod připnutý k položce — postup pak nečte z `steps`, ale z něj. */
  guideId?: number | null; guideTitle?: string | null;
  lines: { ingredientId: number; name: string; amount: number; unit: string; available: number; need: number; missing: number }[];
  missing: number[]; ready: boolean;
}
