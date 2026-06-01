import { useState } from 'react';
import { shifts, favoriteShifts, employees } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const todayStr = fmt(today);
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function getMonthDays(year, month) {
  const days = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let startDay = (first.getDay() + 6) % 7;
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

export default function MyShifts({ user, onNavigate }) {
  const [view, setView] = useState('upcoming');
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [preference, setPreference] = useState(
    favoriteShifts.find(f => f.employeeId === user.id)?.preference || 'any'
  );
  const [prefNote, setPrefNote] = useState(
    favoriteShifts.find(f => f.employeeId === user.id)?.note || ''
  );
  const [prefSaved, setPrefSaved] = useState(false);

  const myShifts = shifts.filter(s => s.employeeId === user.id);
  const upcomingShifts = myShifts.filter(s => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
  const pastShifts = myShifts.filter(s => s.date < todayStr).sort((a, b) => b.date.localeCompare(a.date));
  const todayShift = myShifts.find(s => s.date === todayStr);
  const hoursThisMonth = myShifts.filter(s => s.status === 'completed').length * 8;

  const monthDays = getMonthDays(calYear, calMonth);
  const monthNames = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  const dayAbbr = ['Po','Út','St','Čt','Pá','So','Ne'];

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const handleSavePref = () => {
    setPrefSaved(true);
    setTimeout(() => setPrefSaved(false), 2000);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Moje směny</h1>
        <p className="text-text-secondary text-sm mt-0.5">Přehled vašich pracovních směn</p>
      </div>

      {/* Today's shift highlight */}
      {todayShift ? (
        <div className="bg-accent/10 border border-accent/30 rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-secondary text-sm font-medium">Dnešní směna</p>
              <p className="text-xl md:text-2xl font-bold mt-1 text-white">
                {todayShift.type === 'morning' ? '🌅 Ranní směna' : '🌆 Odpolední směna'}
              </p>
              <p className="text-text-secondary text-sm mt-1">{todayShift.start} – {todayShift.end}</p>
            </div>
            <div className="text-center">
              <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-bold border ${
                todayShift.status === 'ongoing'
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'bg-elevated text-text-secondary border-border'
              }`}>
                {todayShift.status === 'ongoing' ? 'Probíhá' : 'Nadcházející'}
              </span>
              <p className="text-text-secondary/60 text-xs mt-1">8 hodin</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-elevated rounded-2xl p-4 md:p-5 border border-border">
          <p className="text-text-secondary text-center">🌿 Dnes nemáte žádnou směnu – odpočívejte!</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { label: 'Nadcházející', value: upcomingShifts.length, color: 'text-accent-blue' },
          { label: 'Hodin tento měsíc', value: hoursThisMonth + (upcomingShifts.length * 8), color: 'text-white' },
          { label: 'Odpracované', value: pastShifts.length, color: 'text-accent' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-2xl border border-border p-3 md:p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-text-secondary mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-elevated p-1 rounded-xl w-fit">
        {[['upcoming', '⏳ Nadcházející'], ['calendar', '📆 Kalendář'], ['preferences', '⭐ Preference']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              view === id ? 'bg-card text-white shadow' : 'text-text-secondary hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Upcoming shifts */}
      {view === 'upcoming' && (
        <div className="space-y-3">
          <h3 className="font-bold text-white text-sm">Nadcházející směny</h3>
          {upcomingShifts.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-8 text-center">
              <p className="text-text-secondary">Žádné nadcházející směny</p>
            </div>
          ) : (
            upcomingShifts.map(shift => {
              const isToday = shift.date === todayStr;
              const date = new Date(shift.date);
              return (
                <div key={shift.id} className={`bg-card rounded-2xl border-2 p-4 flex items-center gap-3 md:gap-4 ${
                  isToday ? 'border-accent/50' : 'border-border'
                }`}>
                  <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                    isToday ? 'bg-accent text-black' : 'bg-elevated text-text-secondary border border-border'
                  }`}>
                    <p className="text-xs font-semibold uppercase leading-none">
                      {date.toLocaleDateString('cs-CZ', { month: 'short' })}
                    </p>
                    <p className="text-xl font-bold leading-none mt-0.5">{date.getDate()}</p>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white text-sm">
                        {shift.type === 'morning' ? '🌅 Ranní směna' : '🌆 Odpolední směna'}
                      </p>
                      {isToday && <span className="text-xs bg-accent text-black px-2 py-0.5 rounded-full font-bold">Dnes</span>}
                    </div>
                    <p className="text-sm text-text-secondary">
                      {date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-sm font-medium text-text-secondary">{shift.start} – {shift.end} (8 hod)</p>
                    {shift.note && <p className="text-xs text-text-secondary/60 mt-1">{shift.note}</p>}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium border ${
                      shift.status === 'ongoing'
                        ? 'bg-accent/20 text-accent border-accent/40'
                        : 'bg-accent-blue/20 text-accent-blue border-accent-blue/40'
                    }`}>
                      {shift.status === 'ongoing' ? 'Probíhá' : 'Nadcházející'}
                    </span>
                    <p className="text-xs text-text-secondary/50 mt-1.5">
                      za {Math.max(0, Math.ceil((new Date(shift.date) - today) / 86400000))} dní
                    </p>
                  </div>
                </div>
              );
            })
          )}

          {pastShifts.length > 0 && (
            <>
              <h3 className="font-bold text-white text-sm mt-6 pt-2">Minulé směny</h3>
              {pastShifts.slice(0, 5).map(shift => {
                const date = new Date(shift.date);
                return (
                  <div key={shift.id} className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3 md:gap-4 opacity-60">
                    <div className="w-12 h-12 rounded-xl bg-elevated flex flex-col items-center justify-center flex-shrink-0 border border-border">
                      <p className="text-xs text-text-secondary uppercase leading-none">
                        {date.toLocaleDateString('cs-CZ', { month: 'short' })}
                      </p>
                      <p className="text-xl font-bold text-text-secondary leading-none mt-0.5">{date.getDate()}</p>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-text-secondary text-sm">
                        {shift.type === 'morning' ? '🌅 Ranní směna' : '🌆 Odpolední směna'}
                      </p>
                      <p className="text-sm text-text-secondary/60">
                        {date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <span className="text-xs bg-elevated text-text-secondary px-2 py-1 rounded-full border border-border">Dokončeno</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Calendar */}
      {view === 'calendar' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center hover:bg-elevated rounded-lg transition-colors text-text-secondary hover:text-white">◀</button>
            <span className="font-bold text-white">{monthNames[calMonth]} {calYear}</span>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center hover:bg-elevated rounded-lg transition-colors text-text-secondary hover:text-white">▶</button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-7 mb-2">
              {dayAbbr.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-text-secondary py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} />;
                const dayStr = fmt(day);
                const isToday = dayStr === todayStr;
                const dayShift = myShifts.find(s => s.date === dayStr);
                return (
                  <div
                    key={dayStr}
                    className={`rounded-xl p-1 min-h-12 ${
                      isToday ? 'bg-accent/20 border border-accent/50' :
                      dayShift ? 'bg-accent-blue/10 border border-accent-blue/30' : ''
                    }`}
                  >
                    <p className={`text-sm font-semibold text-center ${
                      isToday ? 'text-accent' :
                      dayShift ? 'text-accent-blue' : 'text-text-secondary'
                    }`}>
                      {day.getDate()}
                    </p>
                    {dayShift && (
                      <div className={`text-xs text-center mt-0.5 px-0.5 py-0.5 rounded ${
                        dayShift.type === 'morning' ? 'bg-warning/20 text-warning' : 'bg-elevated text-text-secondary border border-border'
                      }`}>
                        {dayShift.type === 'morning' ? 'R' : 'O'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-4 pt-3 border-t border-border">
              {[
                ['bg-warning/30', 'Ranní'],
                ['bg-elevated border border-border', 'Odpolední'],
                ['bg-accent/20 border border-accent/50', 'Dnes'],
              ].map(([cls, label]) => (
                <span key={label} className="flex items-center gap-1 text-xs text-text-secondary">
                  <span className={`w-3 h-3 rounded ${cls} inline-block`}></span> {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preferences */}
      {view === 'preferences' && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl border border-border p-4 md:p-6">
            <h3 className="font-bold text-white mb-1 text-sm md:text-base">Oblíbené pracovní hodiny</h3>
            <p className="text-sm text-text-secondary mb-4">
              Sdělte vedení vaše preference pro přidělování směn.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Preferovaný typ směny</label>
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {[
                    ['morning', '🌅', 'Ranní', '6:00 – 14:00'],
                    ['afternoon', '🌆', 'Odpolední', '14:00 – 22:00'],
                    ['any', '🔄', 'Flexibilní', 'Cokoliv'],
                  ].map(([val, icon, label, time]) => (
                    <label key={val} className={`flex flex-col items-center gap-1 p-3 rounded-2xl border cursor-pointer transition-all ${
                      preference === val
                        ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                        : 'border-border bg-elevated text-text-secondary hover:border-border/60'
                    }`}>
                      <input
                        type="radio"
                        name="preference"
                        value={val}
                        checked={preference === val}
                        onChange={() => setPreference(val)}
                        className="sr-only"
                      />
                      <span className="text-2xl">{icon}</span>
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-xs opacity-70">{time}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Poznámka k preferenci</label>
                <textarea
                  value={prefNote}
                  onChange={e => setPrefNote(e.target.value)}
                  placeholder="Např. Mám tréninky v pondělí odpoledne, preferuji ranní směny..."
                  rows={3}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent-blue text-white placeholder:text-text-secondary/50 resize-none text-sm"
                />
              </div>
              <button
                onClick={handleSavePref}
                className="px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/90 text-white font-semibold rounded-2xl transition-all shadow-lg"
              >
                {prefSaved ? '✅ Uloženo!' : 'Uložit preference'}
              </button>
            </div>
          </div>

          <div className="bg-elevated rounded-2xl p-4 border border-border">
            <p className="text-sm text-text-secondary">
              Pokud potřebujete konkrétní směnu nebo výměnu, použijte sekci{' '}
              <button onClick={() => onNavigate('shift-requests')} className="text-accent-blue font-semibold hover:underline">
                Žádosti
              </button>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
