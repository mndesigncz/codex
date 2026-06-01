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
  // Fill leading empty days (Mon=0)
  let startDay = (first.getDay() + 6) % 7;
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

export default function MyShifts({ user, onNavigate }) {
  const [view, setView] = useState('upcoming'); // upcoming | calendar
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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-tea-800">📅 Moje směny</h1>
        <p className="text-tea-500 text-sm mt-0.5">Přehled vašich pracovních směn</p>
      </div>

      {/* Today's shift highlight */}
      {todayShift ? (
        <div className="bg-gradient-to-r from-matcha-600 to-matcha-500 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matcha-100 text-sm font-medium">Dnešní směna</p>
              <p className="text-2xl font-bold mt-1">
                {todayShift.type === 'morning' ? '🌅 Ranní směna' : '🌆 Odpolední směna'}
              </p>
              <p className="text-matcha-100 text-sm mt-1">{todayShift.start} – {todayShift.end}</p>
            </div>
            <div className="text-center">
              <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-bold ${
                todayShift.status === 'ongoing' ? 'bg-white/30 text-white' : 'bg-white/20 text-matcha-100'
              }`}>
                {todayShift.status === 'ongoing' ? '▶ Probíhá' : '⏳ Nadcházející'}
              </span>
              <p className="text-matcha-200 text-xs mt-1">8 hodin</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-tea-100 rounded-2xl p-5 border-2 border-tea-200">
          <p className="text-tea-500 text-center">🌿 Dnes nemáte žádnou směnu – odpočívejte!</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-matcha-700">{upcomingShifts.length}</p>
          <p className="text-xs text-tea-400 mt-1">Nadcházející směny</p>
        </div>
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-tea-800">{hoursThisMonth + (upcomingShifts.length * 8)}</p>
          <p className="text-xs text-tea-400 mt-1">Hodin tento měsíc</p>
        </div>
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-tea-800">{pastShifts.length}</p>
          <p className="text-xs text-tea-400 mt-1">Odpracované směny</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        {[['upcoming', '⏳ Nadcházející'], ['calendar', '📆 Kalendář'], ['preferences', '⭐ Preference']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === id ? 'bg-white shadow text-matcha-700' : 'text-tea-500 hover:text-tea-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Upcoming shifts */}
      {view === 'upcoming' && (
        <div className="space-y-3">
          <h3 className="font-bold text-tea-700">Nadcházející směny</h3>
          {upcomingShifts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-tea-100 p-8 text-center">
              <p className="text-tea-400">Žádné nadcházející směny</p>
            </div>
          ) : (
            upcomingShifts.map(shift => {
              const isToday = shift.date === todayStr;
              const date = new Date(shift.date);
              return (
                <div key={shift.id} className={`bg-white rounded-2xl border-2 p-4 flex items-center gap-4 ${
                  isToday ? 'border-matcha-400 bg-matcha-50' : 'border-tea-100'
                }`}>
                  {/* Date block */}
                  <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                    isToday ? 'bg-matcha-600 text-white' : 'bg-tea-100 text-tea-700'
                  }`}>
                    <p className="text-xs font-semibold uppercase">
                      {date.toLocaleDateString('cs-CZ', { month: 'short' })}
                    </p>
                    <p className="text-xl font-bold leading-none">{date.getDate()}</p>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-tea-800">
                        {shift.type === 'morning' ? '🌅 Ranní směna' : '🌆 Odpolední směna'}
                      </p>
                      {isToday && <span className="text-xs bg-matcha-500 text-white px-2 py-0.5 rounded-full">Dnes</span>}
                    </div>
                    <p className="text-sm text-tea-500">
                      {date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-sm font-medium text-tea-600">{shift.start} – {shift.end} (8 hod)</p>
                    {shift.note && <p className="text-xs text-tea-400 mt-1">💬 {shift.note}</p>}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      shift.status === 'ongoing' ? 'bg-matcha-500 text-white' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {shift.status === 'ongoing' ? '▶ Probíhá' : '⏳ Nadcházející'}
                    </span>
                    <p className="text-xs text-tea-400 mt-1.5">
                      za {Math.max(0, Math.ceil((new Date(shift.date) - today) / 86400000))} dní
                    </p>
                  </div>
                </div>
              );
            })
          )}

          <h3 className="font-bold text-tea-700 mt-6 pt-2">Minulé směny</h3>
          {pastShifts.slice(0, 5).map(shift => {
            const date = new Date(shift.date);
            return (
              <div key={shift.id} className="bg-white rounded-2xl border border-tea-100 p-4 flex items-center gap-4 opacity-70">
                <div className="w-14 h-14 rounded-xl bg-tea-100 flex flex-col items-center justify-center flex-shrink-0">
                  <p className="text-xs text-tea-400 uppercase">
                    {date.toLocaleDateString('cs-CZ', { month: 'short' })}
                  </p>
                  <p className="text-xl font-bold text-tea-500 leading-none">{date.getDate()}</p>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-tea-600">
                    {shift.type === 'morning' ? '🌅 Ranní směna' : '🌆 Odpolední směna'}
                  </p>
                  <p className="text-sm text-tea-400">
                    {date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
                <span className="text-xs bg-tea-100 text-tea-500 px-2 py-1 rounded-full">✓ Dokončeno</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar */}
      {view === 'calendar' && (
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          {/* Nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-tea-100">
            <button onClick={prevMonth} className="p-2 hover:bg-tea-100 rounded-lg">◀</button>
            <span className="font-bold text-tea-800">{monthNames[calMonth]} {calYear}</span>
            <button onClick={nextMonth} className="p-2 hover:bg-tea-100 rounded-lg">▶</button>
          </div>
          <div className="p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {dayAbbr.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-tea-400 py-1">{d}</div>
              ))}
            </div>
            {/* Days grid */}
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
                      isToday ? 'bg-matcha-100 border-2 border-matcha-400' :
                      dayShift ? 'bg-blue-50 border border-blue-200' : ''
                    }`}
                  >
                    <p className={`text-sm font-semibold text-center ${
                      isToday ? 'text-matcha-700' :
                      dayShift ? 'text-blue-700' : 'text-tea-600'
                    }`}>
                      {day.getDate()}
                    </p>
                    {dayShift && (
                      <div className={`text-xs text-center mt-0.5 px-0.5 py-0.5 rounded ${
                        dayShift.type === 'morning' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {dayShift.type === 'morning' ? '🌅R' : '🌆O'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex gap-4 mt-4 pt-3 border-t border-tea-100">
              <span className="flex items-center gap-1 text-xs text-tea-500">
                <span className="w-3 h-3 rounded bg-amber-200 inline-block"></span> Ranní
              </span>
              <span className="flex items-center gap-1 text-xs text-tea-500">
                <span className="w-3 h-3 rounded bg-purple-200 inline-block"></span> Odpolední
              </span>
              <span className="flex items-center gap-1 text-xs text-tea-500">
                <span className="w-3 h-3 rounded border-2 border-matcha-400 inline-block"></span> Dnes
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Preferences */}
      {view === 'preferences' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-tea-100 p-6 shadow-sm">
            <h3 className="font-bold text-tea-800 mb-4 flex items-center gap-2">⭐ Oblíbené pracovní hodiny</h3>
            <p className="text-sm text-tea-500 mb-4">
              Sdělte vedení vaše preference pro přidělování směn. Nezaručujeme splnění, ale budeme to zohledňovat.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-2">Preferovaný typ směny</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['morning', '🌅 Ranní', '6:00 – 14:00'],
                    ['afternoon', '🌆 Odpolední', '14:00 – 22:00'],
                    ['any', '🔄 Flexibilní', 'Cokoliv'],
                  ].map(([val, label, time]) => (
                    <label key={val} className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      preference === val ? 'border-matcha-500 bg-matcha-50' : 'border-tea-200 hover:border-tea-300'
                    }`}>
                      <input
                        type="radio"
                        name="preference"
                        value={val}
                        checked={preference === val}
                        onChange={() => setPreference(val)}
                        className="accent-matcha-600 sr-only"
                      />
                      <span className="text-2xl">{label.split(' ')[0]}</span>
                      <span className="text-sm font-semibold text-tea-700">{label.split(' ').slice(1).join(' ')}</span>
                      <span className="text-xs text-tea-400">{time}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Poznámka k preferenci</label>
                <textarea
                  value={prefNote}
                  onChange={e => setPrefNote(e.target.value)}
                  placeholder="Např. Mám tréninky v pondělí odpoledne, preferuji ranní směny..."
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 resize-none text-sm"
                />
              </div>
              <button
                onClick={handleSavePref}
                className="px-6 py-2.5 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold rounded-xl transition-all shadow-md"
              >
                {prefSaved ? '✅ Uloženo!' : '💾 Uložit preference'}
              </button>
            </div>
          </div>

          <div className="bg-tea-50 rounded-2xl p-4 border border-tea-200">
            <p className="text-sm text-tea-600">
              💡 <strong>Tip:</strong> Pokud potřebujete konkrétní směnu nebo výměnu, použijte sekci{' '}
              <button onClick={() => onNavigate('shift-requests')} className="text-matcha-600 font-semibold hover:underline">
                Žádosti
              </button>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
