"use client";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CalendarCheck2,
  ChartPie,
  ChevronRight,
  HeartHandshake,
  LogOut,
  MessageSquare,
  Search,
  Send,
  Settings,
  ShieldAlert,
  User,
  EyeOff,
} from "lucide-react";

// ————————————————————————————————————————————————————————————
// EduSafe – Liquid Glass (Apple-like) • White canvas, breathable spacing
// White background, deep grays for text, orange accent for actions.
// Consistent paddings, rounded radii, soft shadows, blur on panels.
// Chat: master-detail (list -> fullscreen detail with back arrow).
// Termíny: Nejbližší sloty + kalendář + denní přehled + detail schůzky.
// ————————————————————————————————————————————————————————————

// Accent color (Apple orange)
const ACCENT = "#FF9500"; // hover idea: #e58600

// Liquid glass tokens
const glass =
  "rounded-3xl border border-zinc-200/70 bg-white/70 backdrop-blur-xl shadow-[0_1px_0_rgba(0,0,0,0.04),_0_36px_120px_-40px_rgba(0,0,0,0.16)]";
const glassSub = "rounded-2xl border border-zinc-200/60 bg-white/65 backdrop-blur-lg";

// Typography helpers
const titleCls = "text-lg font-semibold tracking-tight text-zinc-900";
const subtleCls = "text-sm text-zinc-600";

const currentUser = { name: "Mgr. Jana Nováková", role: "Školní psycholog", initials: "JN" };

// ——— Types ———
type SectionKey = "chats" | "parents" | "slots" | "feedback" | "resources" | "settings";
type ChatView = "list" | "detail";

type Slot = { id: string; when: string; taken?: boolean };
type Feedback = { id: string; from: string; text: string; score: number };
type Appt = { id: string; title: string; with: string; start: string; end: string; threadId?: string };

// ——— Mock data ———
const MOCK_THREADS = [
  { id: "t1", name: "Žák 7.B — Anonymní", last: "Můžu se na něco zeptat?", unread: 2, kind: "student" },
  { id: "t2", name: "Žák 9.A — Anonymní", last: "Je mi poslední dobou smutno.", unread: 0, kind: "student" },
  { id: "t3", name: "Rodič — anonymní dotaz", last: "Jak fungují konzultace?", unread: 1, kind: "parent" },
  { id: "t4", name: "Rodič 5.C — konzultace", last: "Potřebujeme termín příští týden.", unread: 0, kind: "parent" },
];

const MOCK_MESSAGES: Record<string, { id: string; from: "me" | "them"; text: string; at: string }[]> = {
  t1: [
    { id: "m1", from: "them", text: "Můžu se na něco zeptat?", at: "09:24" },
    { id: "m2", from: "me", text: "Jasně. Jsem tady pro tebe.", at: "09:25" },
  ],
  t2: [{ id: "m1", from: "them", text: "Je mi poslední dobou smutno.", at: "08:02" }],
  t3: [
    { id: "m1", from: "them", text: "Jak fungují konzultace?", at: "včera" },
    { id: "m2", from: "me", text: "Můžeme se domluvit na anonymní schůzce.", at: "včera" },
  ],
  t4: [
    { id: "m1", from: "them", text: "Potřebujeme termín příští týden.", at: "předevčírem" },
  ],
};

const SEVERITY = [
  { level: 1, label: "Nízká", caution: true },
  { level: 2, label: "Mírná", caution: true },
  { level: 3, label: "Střední", caution: true },
  { level: 4, label: "Vysoká", caution: false },
  { level: 5, label: "Kritická", caution: false },
];

export function assessSeverityLatent(msgs: string[]): { level: number; rationale: string; suggestions: string[] } {
  const text = msgs.join(" \n").toLowerCase();
  const flags4 = ["ubliž", "sekera", "útěk", "nenávidím se", "nechci žít"];
  const flags3 = ["smutno", "úzkost", "strach", "sám", "sebepoškoz"];
  let level = 1;
  if (flags4.some((w) => text.includes(w))) level = 5;
  else if (flags3.some((w) => text.includes(w))) level = 3;
  return {
    level,
    rationale:
      level >= 4
        ? "Výpověď obsahuje indikátory akutního ohrožení."
        : level >= 3
        ? "Výpověď signalizuje zhoršený stav, vhodné dřívější setkání."
        : "Neobsahuje jasné krizové indikátory, sledujte vývoj.",
    suggestions:
      level >= 4
        ? ["Ověřte bezpečí.", "Krizová linka (116 111 / 116 123)", "Spusťte krizový plán školy."]
        : level >= 3
        ? ["Naplánujte dřívější konzultaci.", "Psychoedukace + zdroje."]
        : ["Kontrolní zpráva.", "Bezpečné coping zdroje."],
  };
}

function nowHHMM() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

// Helpers for dates (avoid timezone drift)
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ——— Header & nav ———
function AppHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-zinc-200/80">
      <div className="mx-auto max-w-[1280px] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl grid place-items-center font-semibold text-white" style={{ background: ACCENT }}>E</div>
          <div className="font-semibold tracking-tight text-zinc-900">EduSafe</div>
          <Badge variant="secondary" className="ml-1">Dashboard</Badge>
        </div>
        <div className="hidden md:flex items-center gap-2 max-w-lg w-full">
          <div className={`flex items-center px-3 py-1.5 w-full ${glassSub}`}>
            <Search className="size-4 mr-2 opacity-60" />
            <Input placeholder="Hledat…" className="border-none focus-visible:ring-0 p-0 h-7 bg-transparent" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <Bell className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upozornění</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="rounded-xl gap-2">
                <Avatar className="size-6"><AvatarFallback>JN</AvatarFallback></Avatar>
                <span className="hidden sm:inline text-sm text-zinc-900">{currentUser.name}</span>
                <ChevronRight className="size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{currentUser.role}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem><Settings className="mr-2 size-4" />Nastavení</DropdownMenuItem>
              <DropdownMenuItem><ChartPie className="mr-2 size-4" />Reporty</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem><LogOut className="mr-2 size-4" />Odhlásit</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function SideNav({ active, setActive }: { active: SectionKey; setActive: (v: SectionKey) => void }) {
  const items: { key: SectionKey; label: string; icon: any }[] = [
    { key: "chats", label: "Chat", icon: MessageSquare },
    { key: "parents", label: "Rodiče", icon: HeartHandshake },
    { key: "slots", label: "Termíny", icon: CalendarCheck2 },
    { key: "feedback", label: "Zpětná vazba", icon: HeartHandshake },
    { key: "resources", label: "Metodika", icon: BookOpen },
    { key: "settings", label: "Nastavení", icon: Settings },
  ];
  return (
    <aside className="hidden md:block">
      <nav className={`${glass} p-2 sticky top-[76px]`}>
        {items.map((i) => (
          <Button
            key={i.key}
            variant={active === i.key ? "secondary" : "ghost"}
            className="w-full justify-start rounded-2xl h-11 px-3 text-zinc-900"
            onClick={() => setActive(i.key)}
          >
            <i.icon className="size-4 mr-3" /> {i.label}
          </Button>
        ))}
      </nav>
    </aside>
  );
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className={`${glass} p-4`}>
      <div className={titleCls}>{title}</div>
      {desc && <div className={`${subtleCls} mt-1`}>{desc}</div>}
    </div>
  );
}

// ——— Chat ———
function ThreadList({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className={`${glass}`}>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-900">Konverzace</div>
        <Badge variant="outline" className="rounded-xl"><EyeOff className="size-3 mr-1" /> Anonymní</Badge>
      </div>
      <Separator className="opacity-70" />
      <ScrollArea className="h-[56svh] p-2">
        <div className="space-y-1">
          {MOCK_THREADS.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpen(t.id)}
              className={`w-full text-left px-3 py-3 rounded-2xl transition hover:bg-black/5`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium tracking-tight text-zinc-900">{t.name}</div>
                {t.unread > 0 && (
                  <Badge style={{ background: ACCENT }} className="rounded-full h-5 min-w-5 px-1 border-0">
                    {t.unread}
                  </Badge>
                )}
              </div>
              <div className={`text-sm text-zinc-600 line-clamp-1`}>{t.last}</div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ChatTopBar({
  title,
  onBack,
  onCrisis,
  onReveal,
  revealEnabled,
  canCrisis = true,
}: {
  title: string;
  onBack: () => void;
  onCrisis: () => void;
  onReveal: () => void;
  revealEnabled: boolean;
  canCrisis?: boolean;
}) {
  return (
    <div className={`${glass} px-3 md:px-4 py-2 flex items-center justify-between`}>
      <div className="flex items-center gap-2">
        <Button onClick={onBack} variant="ghost" className="rounded-xl">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <div className="font-medium tracking-tight text-zinc-900">{title}</div>
          <div className="text-xs text-zinc-600">Chat je anonymní. Identita je skrytá, dokud není důvod ji odkrýt.</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={onReveal}
          disabled={!revealEnabled}
          className="rounded-xl border-0"
          style={{ background: revealEnabled ? ACCENT : "#E5E7EB", color: revealEnabled ? "white" : "#6B7280" }}
        >
          <User className="mr-2 size-4" /> Informace dítěte
        </Button>
        {canCrisis && (
          <Button onClick={onCrisis} className="rounded-xl border-0" style={{ background: "#ef4444", color: "white" }}>
            <ShieldAlert className="mr-2 size-4" /> Krizový mód
          </Button>
        )}
      </div>
    </div>
  );
}

function ChatDetail({ threadId, onBack, canCrisis = true }: { threadId: string; onBack: () => void; canCrisis?: boolean }) {
  const [messages, setMessages] = useState(MOCK_MESSAGES[threadId] || []);
  const [draft, setDraft] = useState("");
  const [openCrisis, setOpenCrisis] = useState(false);
  const [revealReady, setRevealReady] = useState(false);
  const lastSeverityRef = useRef<{ level: number; rationale: string; suggestions: string[] } | null>(null);

  useEffect(() => {
    setMessages(MOCK_MESSAGES[threadId] || []);
    setRevealReady(false);
  }, [threadId]);

  const send = () => {
    const txt = draft.trim();
    if (!txt) return;
    const next = [
      ...messages,
      { id: crypto.randomUUID(), from: "me" as const, text: txt, at: nowHHMM() },
    ];
    setMessages(next);
    setDraft("");
  };

  const runAssessment = () => {
    const assessment = assessSeverityLatent(messages.map((m) => m.text));
    lastSeverityRef.current = assessment;
    setOpenCrisis(true);
  };

  return (
    <div className="grid gap-4">
      <ChatTopBar
        title={MOCK_THREADS.find((t) => t.id === threadId)?.name || "Konverzace"}
        onBack={onBack}
        onCrisis={runAssessment}
        onReveal={() => setRevealReady(true)}
        revealEnabled={revealReady}
        canCrisis={canCrisis}
      />

      <div className={`${glass} p-0 overflow-hidden`}>
        <div className="grid grid-rows-[1fr_auto] h-[64svh]">
          <ScrollArea className="p-4">
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm border border-zinc-200/80 ${
                      m.from === "me" ? "bg-zinc-900 text-white" : "bg-white/75"
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed text-zinc-900 dark:text-zinc-50">{m.text}</div>
                    <div className={`text-[10px] mt-1 ${m.from === "me" ? "text-zinc-300" : "text-zinc-600"}`}>{m.at}</div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="border-t border-zinc-200/80 p-3 bg-white/80 backdrop-blur-xl">
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Odpověď…"
                className="rounded-2xl resize-none min-h-[52px] bg-white"
              />
              <Button onClick={send} className="rounded-2xl h-[52px] px-4 border-0" style={{ background: ACCENT, color: "white" }}>
                <Send className="size-4 mr-2" />Odeslat
              </Button>
            </div>
          </div>
        </div>
      </div>

      <CrisisDialog
        open={openCrisis}
        onOpenChange={setOpenCrisis}
        assessment={lastSeverityRef.current}
        onRevealGate={(ok) => setRevealReady(ok)}
        onRevealApproved={() => setRevealReady(true)}
      />
    </div>
  );
}

function CrisisDialog({
  open,
  onOpenChange,
  assessment,
  onRevealGate,
  onRevealApproved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assessment: { level: number; rationale: string; suggestions: string[] } | null;
  onRevealGate: (ok: boolean) => void;
  onRevealApproved: () => void;
}) {
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [reason, setReason] = useState("");
  const lvl = assessment?.level ?? 1;
  const warnPrivacy = lvl <= 3;

  useEffect(() => {
    onRevealGate(false);
    setConfirmReveal(false);
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lvl]);

  const scaleItems = [1, 2, 3, 4, 5];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-3xl border border-zinc-200/70 bg-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-zinc-900">Krizový mód</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {/* Severity scale – horizontal, clean */}
          <div className={`${glassSub} p-4`}>
            <div className="text-sm font-medium text-zinc-900 mb-2">Vyhodnocená závažnost</div>
            <div className="flex items-center gap-2">
              {scaleItems.map((n) => (
                <div key={n} className={`flex-1 h-2 rounded-full ${n <= lvl ? "bg-red-500" : "bg-zinc-200"}`} />
              ))}
            </div>
            <div className="mt-2 text-sm text-zinc-700">Úroveň {lvl}/5 — {SEVERITY.find((s) => s.level === lvl)?.label}</div>
          </div>

          {/* Guidance */}
          <div className={`${glassSub} p-4`}>
            <div className="text-sm text-zinc-700">{assessment?.rationale || "Probíhá rychlé vyhodnocení…"}</div>
            <ul className="list-disc pl-5 text-sm text-zinc-700 mt-2 space-y-1">
              {(assessment?.suggestions || []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          {warnPrivacy && (
            <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900">
              <div className="font-medium">Pozor: možné narušení práv dítěte</div>
              <div className="text-sm">U úrovní 1–3 zvažte, zda je odtajnění nezbytné. Pokud přesto chcete pokračovat, uveďte jasný a konkrétní důvod do auditu.</div>
            </div>
          )}

          {/* Reveal gate */}
          <div className={`${glassSub} p-4`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-zinc-900">Zobrazit informace dítěte</div>
              <Switch
                checked={confirmReveal}
                onCheckedChange={(v) => {
                  setConfirmReveal(v);
                  onRevealGate(v && reason.trim().length >= 8);
                }}
              />
            </div>
            <p className="text-xs text-zinc-600 mt-1">Vyžaduje zdůvodnění do záznamu (min. 8 znaků).</p>
            <div className="mt-2 grid gap-2">
              <Label htmlFor="reason" className="text-xs text-zinc-600">
                Důvod odtajnění (audit)
              </Label>
              <Input
                id="reason"
                placeholder="Stručně, konkrétně…"
                value={reason}
                onChange={(e) => {
                  const v = e.target.value;
                  setReason(v);
                  onRevealGate(confirmReveal && v.trim().length >= 8);
                }}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="justify-between sm:justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="rounded-xl">
            Zavřít
          </Button>
          <Button
            className="rounded-xl border-0"
            style={{ background: ACCENT, color: "white" }}
            onClick={() => {
              if (confirmReveal && reason.trim().length >= 8) {
                onOpenChange(false);
                onRevealApproved();
              }
            }}
            disabled={!(confirmReveal && reason.trim().length >= 8)}
          >
            {lvl >= 4 ? "Spustit krizový plán & zobrazit info" : "Zobrazit info (s odůvodněním)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ——— Termíny (kalendář) ———
const MOCK_SLOTS: Slot[] = [
  { id: "s1", when: "Po 14:00–14:30" },
  { id: "s2", when: "Po 14:30–15:00" },
  { id: "s3", when: "Út 08:00–08:30" },
  { id: "s4", when: "St 10:00–10:30", taken: true },
  { id: "s5", when: "Čt 12:30–13:00" },
];

const MOCK_FEEDBACK: Feedback[] = [
  { id: "f1", from: "Rodič (anon)", text: "Díky za rychlou reakci.", score: 5 },
  { id: "f2", from: "Žák (anon)", text: "Bylo fajn si napsat bez jména.", score: 4 },
];

const MOCK_APPTS: Appt[] = [
  { id: "a1", title: "Individuální konzultace", with: "Žák 7.B", start: "2025-10-06T14:00:00", end: "2025-10-06T14:30:00", threadId: "t1" },
  { id: "a2", title: "Setkání s rodičem", with: "Rodič 5.C", start: "2025-10-07T08:30:00", end: "2025-10-07T09:00:00", threadId: "t4" },
  { id: "a3", title: "Krátká konzultace", with: "Žák 9.A", start: "2025-10-09T10:00:00", end: "2025-10-09T10:30:00", threadId: "t2" },
];

function UpcomingSlots() {
  const [slots, setSlots] = useState(MOCK_SLOTS);
  const toggle = (id: string) => setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, taken: !s.taken } : s)));
  return (
    <div className={`${glass} p-4`}>
      <div className={titleCls}>Nejbližší volné termíny</div>
      <div className="grid sm:grid-cols-2 gap-3 mt-2">
        {slots.map((s) => (
          <div key={s.id} className={`flex items-center justify-between px-3 py-2 ${glassSub}`}>
            <div className="text-sm text-zinc-900">{s.when}</div>
            <Button
              size="sm"
              className="rounded-xl border-0"
              style={{ background: s.taken ? "#E5E7EB" : ACCENT, color: s.taken ? "#374151" : "white" }}
              onClick={() => toggle(s.id)}
            >
              {s.taken ? "Uvolnit" : "Rezervovat"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarGrid({ year, month, onPick }: { year: number; month: number; onPick: (d: Date) => void }) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // week starts Mon
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(startOfDayLocal(d));
  }
  const isSame = (a: Date, b: Date) => ymdLocal(a) === ymdLocal(b);
  const today = startOfDayLocal(new Date());
  return (
    <div className={`${glass} p-4`}>
      <div className="grid grid-cols-7 gap-1 text-xs text-zinc-600 mb-2">
        {"Po Út St Čt Pá So Ne".split(" ").map((w) => (
          <div key={w} className="px-2 py-1 text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, idx) => {
          const inMonth = d.getMonth() === month;
          const count = MOCK_APPTS.filter((a) => ymdLocal(new Date(a.start)) === ymdLocal(d)).length;
          return (
            <button
              key={idx}
              onClick={() => onPick(d)}
              className={`${glassSub} px-2 py-2 text-left hover:bg-white/80 ${inMonth ? "" : "opacity-50"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-900">{d.getDate()}</span>
                {isSame(d, today) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: ACCENT, color: "white" }}>
                    dnes
                  </span>
                )}
              </div>
              {count > 0 && <div className="mt-1 text-[10px] text-zinc-600">{count} schůz{count === 1 ? "ka" : "ky"}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ date, onSelect }: { date: Date; onSelect: (a: Appt) => void }) {
  const dayKey = ymdLocal(date);
  const items = MOCK_APPTS.filter((a) => ymdLocal(new Date(a.start)) === dayKey).sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
  return (
    <div className={`${glass} p-4`}>
      <div className="flex items-center justify-between">
        <div className={titleCls}>Den {date.toLocaleDateString()}</div>
        <div className={subtleCls}>{items.length} schůz{items.length === 1 ? "ka" : "ky"}</div>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length === 0 && (
          <div className={`${glassSub} p-3 text-sm text-zinc-600`}>
            Žádné schůzky. Klikni kdekoliv v kalendáři pro vytvoření.
          </div>
        )}
        {items.map((a) => (
          <button key={a.id} onClick={() => onSelect(a)} className={`${glassSub} p-3 text-left hover:bg-white/80 rounded-2xl`}>
            <div className="flex items-center justify-between">
              <div className="font-medium text-zinc-900">{a.title}</div>
              <div className="text-sm text-zinc-700">
                {new Date(a.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–
                {new Date(a.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div className="text-sm text-zinc-700">S kým: {a.with}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ApptDetail({ appt, onOpenChat }: { appt: Appt; onOpenChat: (threadId?: string) => void }) {
  return (
    <div className={`${glass} p-4`}>
      <div className={titleCls}>Detail schůzky</div>
      <div className="mt-2 grid gap-2 text-sm">
        <div className={`${glassSub} p-3`}>Téma: {appt.title}</div>
        <div className={`${glassSub} p-3`}>S kým: {appt.with}</div>
        <div className={`${glassSub} p-3`}>
          Čas: {new Date(appt.start).toLocaleString()} – {new Date(appt.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className={`${glassSub} p-3`}>Místo: Konzultační místnost A</div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button className="rounded-xl border-0" style={{ background: ACCENT, color: "white" }} onClick={() => onOpenChat(appt.threadId)}>
          Otevřít chat
        </Button>
        <Button variant="secondary" className="rounded-xl">
          Přesunout
        </Button>
        <Button variant="secondary" className="rounded-xl">
          Zrušit
        </Button>
      </div>
    </div>
  );
}

function SchedulePanel({ onJumpToChat }: { onJumpToChat: (threadId?: string) => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() });
  const [picked, setPicked] = useState<Date>(today);
  const [selected, setSelected] = useState<Appt | null>(null);

  return (
    <div className="grid gap-6">
      <UpcomingSlots />
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="grid gap-3">
          <div className={`${glass} p-3 flex items-center justify-between`}>
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={() => setCursor((p) => ({ y: p.m === 0 ? p.y - 1 : p.y, m: p.m === 0 ? 11 : p.m - 1 }))}
            >
              Předchozí
            </Button>
            <div className="font-medium text-zinc-900">{new Date(cursor.y, cursor.m).toLocaleString(undefined, { month: "long", year: "numeric" })}</div>
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={() => setCursor((p) => ({ y: p.m === 11 ? p.y + 1 : p.y, m: p.m === 11 ? 0 : p.m + 1 }))}
            >
              Další
            </Button>
          </div>
          <CalendarGrid
            year={cursor.y}
            month={cursor.m}
            onPick={(d) => {
              setPicked(d);
              setSelected(null);
            }}
          />
        </div>
        <div className="grid gap-6">
          <DayView date={picked} onSelect={(a) => setSelected(a)} />
          {selected && <ApptDetail appt={selected} onOpenChat={onJumpToChat} />}
        </div>
      </div>
    </div>
  );
}

// ——— Ostatní sekce ———
function FeedbackPanel() {
  return (
    <div className={`${glass} p-4`}>
      <div className={titleCls}>Zpětná vazba</div>
      <div className="space-y-2 mt-2">
        {MOCK_FEEDBACK.map((f) => (
          <div key={f.id} className={`${glassSub} p-3`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-zinc-900">{f.from}</div>
              <div className="text-xs text-zinc-600">{"★".repeat(f.score)}</div>
            </div>
            <div className="text-sm text-zinc-700 mt-1">{f.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourcesPanel() {
  return (
    <div className={`${glass} p-4`}>
      <div className={titleCls}>Metodika a krizové postupy</div>
      <Separator className="my-3 opacity-70" />
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div className={`${glassSub} p-3`}>Kdy odtajnit identitu • Etické zásady</div>
        <div className={`${glassSub} p-3`}>Krizový plán školy • Kontakty</div>
        <div className={`${glassSub} p-3`}>Anonymní chat — doporučené reakce</div>
      </div>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className={`${glass} p-4`}>
      <div className={titleCls}>Nastavení</div>
      <Separator className="my-3 opacity-70" />
      <div className="grid gap-4">
        <div>
          <Label>Vizuál</Label>
          <div className={subtleCls}>Bílé pozadí, liquid‑glass panely, oranžový accent na akcích.</div>
        </div>
        <div>
          <Label>Supabase (auth/realtime/db)</Label>
          <div className={subtleCls}>
            Připraveno k napojení (tabulky: <code>profiles</code>, <code>threads</code>, <code>messages</code>, <code>slots</code>, <code>feedback</code>).
          </div>
          <div className="text-xs text-zinc-500">// TODO: sign‑in/out, realtime subscription na nové zprávy.</div>
        </div>
      </div>
    </div>
  );
}

// ——— Sekce Rodiče ———
function ParentsSection() {
  const parentThreads = MOCK_THREADS.filter((t) => t.kind === "parent");
  const [view, setView] = useState<ChatView>("list");
  const [activeThread, setActiveThread] = useState<string | null>(null);

  // Broadcast form state
  const [groups, setGroups] = useState<{ [k: string]: boolean }>({ "1. stupeň": false, "2. stupeň": false, "9. ročníky": false, Všichni: true });
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  const toggleGroup = (k: string) => setGroups((g) => ({ ...g, [k]: !g[k] }));

  return (
    <div className="grid gap-6">
      {view === "list" && (
        <>
          <div className={`${glass} p-4`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={titleCls}>Rodiče — konverzace</div>
                <div className={subtleCls}>Soukromý prostor pro rodiče. Hromadné sdělení níže.</div>
              </div>
            </div>
          </div>

          {/* Broadcast panel */}
          <div className={`${glass} p-4`}>
            <div className={titleCls}>Hromadné sdělení rodičům</div>
            <div className="mt-3 grid lg:grid-cols-3 gap-3 text-sm">
              <div className={`${glassSub} p-3`}>
                <div className="font-medium text-zinc-900 mb-2">Skupiny</div>
                {Object.keys(groups).map((k) => (
                  <label key={k} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={groups[k]} onChange={() => toggleGroup(k)} />
                    <span>{k}</span>
                  </label>
                ))}
              </div>
              <div className={`${glassSub} p-3`}>
                <div className="font-medium text-zinc-900 mb-2">Text sdělení</div>
                <Textarea placeholder="Krátká zpráva…" value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)} />
              </div>
              <div className={`${glassSub} p-3`}>
                <div className="font-medium text-zinc-900 mb-2">Materiály</div>
                <Input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
                <div className="text-xs text-zinc-600 mt-2">Připojit PDF, DOCX, obrázky…</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="rounded-xl border-0" style={{ background: ACCENT, color: "white" }}>
                Odeslat sdělení
              </Button>
              <Button variant="secondary" className="rounded-xl">
                Uložit návrh
              </Button>
            </div>
          </div>

          {/* Parent threads list */}
          <div className={`${glass} p-2`}>
            <ScrollArea className="h-[56svh] p-2">
              <div className="space-y-1">
                {parentThreads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveThread(t.id);
                      setView("detail");
                    }}
                    className={`${glassSub} w-full text-left px-3 py-3 rounded-2xl hover:bg-white/80`}
                  >
                    <div className="font-medium text-zinc-900">{t.name}</div>
                    <div className="text-sm text-zinc-600 line-clamp-1">{t.last}</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </>
      )}
      {view === "detail" && activeThread && (
        <ChatDetail threadId={activeThread} onBack={() => setView("list")} canCrisis={false} />
      )}
    </div>
  );
}

// ——— Chat index ———
function ChatSection() {
  const [view, setView] = useState<ChatView>("list");
  const [activeThread, setActiveThread] = useState<string | null>(null);

  return (
    <div className="grid gap-6">
      {view === "list" && (
        <>
          <SectionHeader title="Chat" desc="Vyber konverzaci pro zobrazení" />
          <ThreadList
            onOpen={(id) => {
              setActiveThread(id);
              setView("detail");
            }}
          />
        </>
      )}
      {view === "detail" && activeThread && <ChatDetail threadId={activeThread} onBack={() => setView("list")} />}
    </div>
  );
}

// ——— Root ———
export default function EduSafeApp() {
  const [active, setActive] = useState<SectionKey>("chats");

  const jumpToChat = (threadId?: string) => {
    if (!threadId) return;
    setActive("chats");
    // Pozn.: ve skutečné appce bychom směrovali i do konkrétního vlákna (router/store)
  };

  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      <AppHeader />
      <div className="mx-auto max-w-[1280px] grid grid-cols-1 md:grid-cols-[16rem_1fr] gap-6 px-6 py-6">
        <SideNav active={active} setActive={setActive} />
        <main className="grid gap-6">
          {active === "chats" && <ChatSection />}
          {active === "parents" && (
            <>
              <SectionHeader title="Rodiče" desc="Chat jen s rodiči + užitečné nástroje" />
              <ParentsSection />
            </>
          )}
          {active === "slots" && (
            <>
              <SectionHeader title="Termíny" desc="Nejbližší nabídka + kalendář" />
              <SchedulePanel onJumpToChat={jumpToChat} />
            </>
          )}
          {active === "feedback" && (
            <>
              <SectionHeader title="Zpětná vazba" desc="Co funguje a co zlepšit" />
              <FeedbackPanel />
            </>
          )}
          {active === "resources" && (
            <>
              <SectionHeader title="Metodika" desc="Postupy a doporučení pro práci ve škole" />
              <ResourcesPanel />
            </>
          )}
          {active === "settings" && (
            <>
              <SectionHeader title="Nastavení" desc="Základní konfigurace" />
              <SettingsPanel />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ——— Inline sanity tests (run only if explicitly enabled) ———
(function runUnitTests() {
  const shouldRun =
    (typeof window !== "undefined" && (window as any).__EDUSAFE_RUN_TESTS__) ||
    (typeof process !== "undefined" && (process as any).env?.NODE_ENV === "test");
  if (!shouldRun) return;

  function expectEqual(a: any, b: any, msg: string) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.error(msg, a, b);
      throw new Error(msg);
    }
  }

  // Existing tests
  expectEqual(assessSeverityLatent(["nechci žít"]).level, 5, "acute -> 5");
  expectEqual(assessSeverityLatent(["smutno"]).level, 3, "mid -> 3");
  expectEqual(assessSeverityLatent(["Ahoj"]).level, 1, "neutral -> 1");

  // Added tests
  expectEqual(assessSeverityLatent(["úzkost"]).level, 3, "anxiety -> 3");
  expectEqual(assessSeverityLatent(["nenávidím se"]).level, 5, "self-hate -> 5");
  expectEqual(assessSeverityLatent(["ubliž si"]).level, 5, "harm verb stem -> 5 (substring match)");
  const hhmm = nowHHMM();
  // The error was thrown on this line
  expectEqual(hhmm.length, 5, "HH:MM length");
  // ymdLocal zero-padding sanity
  const d = new Date(2025, 0, 9); // Jan 9, 2025
  expectEqual(ymdLocal(d), "2025-01-09", "ymdLocal zero padding");
})();
