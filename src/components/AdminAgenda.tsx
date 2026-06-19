import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
  Clock, User, Video, MapPin, AlignLeft, X, Trash2, Edit2
} from 'lucide-react';
import { 
  format, addDays, startOfWeek, endOfWeek, subWeeks, addWeeks, 
  isSameDay, parseISO, isToday, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { storage } from '../lib/storage';
import { AgendaEvent, UserProfile } from '../types';

interface AdminAgendaProps {
  onBack: () => void;
}

const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => i + 6); // 6h to 20h

export const AdminAgenda: React.FC<AdminAgendaProps> = ({ onBack }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);
  
  // Form State
  const [formData, setFormData] = useState<Partial<AgendaEvent>>({
    type: 'presential',
    startTime: '08:00',
    endTime: '09:00',
  });

  useEffect(() => {
    setEvents(storage.getAgendaEvents());
    setUsers(storage.getUsersList().filter(u => u.role === 'student'));
  }, []);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const handlePrev = () => {
    if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNext = () => {
    if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const openNewModal = (dateStr?: string, timeStr?: string) => {
    setSelectedEvent(null);
    setFormData({
      type: 'presential',
      date: dateStr || format(new Date(), 'yyyy-MM-dd'),
      startTime: timeStr || '08:00',
      endTime: timeStr ? `${parseInt(timeStr.split(':')[0]) + 1}:00`.padStart(5, '0') : '09:00',
      title: '',
      studentId: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (ev: AgendaEvent) => {
    setSelectedEvent(ev);
    setFormData(ev);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.date || !formData.startTime || !formData.endTime) return;

    let studentName = formData.studentName;
    if (formData.studentId) {
      const u = users.find(u => u.uid === formData.studentId);
      if (u) studentName = u.name;
    }

    const newEvent: AgendaEvent = {
      id: selectedEvent?.id || crypto.randomUUID(),
      studentId: formData.studentId || '',
      studentName,
      title: formData.title,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      type: formData.type as 'presential' | 'online' | 'other',
      notes: formData.notes || '',
      createdAt: selectedEvent?.createdAt || new Date().toISOString()
    };

    storage.saveAgendaEvent(newEvent);
    setEvents(storage.getAgendaEvents());
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este evento?')) {
      storage.deleteAgendaEvent(id);
      setEvents(storage.getAgendaEvents());
      setIsModalOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f7fa]">
      {/* Header */}
      <div className="bg-[#0c1622] p-4 flex justify-between items-center shrink-0 border-b border-white/10">
        <button onClick={onBack} className="text-white text-[10px] font-bold flex items-center gap-1 opacity-80 cursor-pointer">
          <ChevronLeft className="w-3.5 h-3.5" /> Voltar
        </button>
        <div className="flex gap-2">
          <div className="flex bg-white/10 rounded-lg p-1">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition ${view === 'month' ? 'bg-[#dc2626] text-white' : 'text-slate-300 hover:text-white'}`}
            >
              Mês
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition ${view === 'week' ? 'bg-[#dc2626] text-white' : 'text-slate-300 hover:text-white'}`}
            >
              Semana
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 shadow-sm z-10 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-black italic uppercase text-slate-800 tracking-tighter">
            {view === 'week' ? (
              `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(weekEnd, "dd MMM", { locale: ptBR })}`
            ) : (
              format(currentDate, "MMMM yyyy", { locale: ptBR })
            )}
          </h2>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button onClick={handlePrev} className="p-1 hover:bg-white rounded-md transition shadow-sm text-slate-600"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={handleToday} className="px-3 py-1 text-[10px] font-black uppercase hover:bg-white rounded-md transition text-slate-600">Hoje</button>
            <button onClick={handleNext} className="p-1 hover:bg-white rounded-md transition shadow-sm text-slate-600"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        
        <button
          onClick={() => openNewModal()}
          className="w-full md:w-auto bg-[#dc2626] text-white px-5 py-2.5 rounded-xl font-black italic uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-red-200 hover:bg-[#ef4444] transition active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Novo Agendamento
        </button>
      </div>

      {/* Calendar Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#f4f7fa]">
        {view === 'week' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            {/* Week Header */}
            <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50">
              <div className="p-3 flex items-center justify-center border-r border-slate-200">
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              {weekDays.map((day, i) => (
                <div key={i} className={`p-3 text-center border-r border-slate-200 last:border-0 ${isToday(day) ? 'bg-red-50/50' : ''}`}>
                  <span className={`block text-[10px] font-bold uppercase ${isToday(day) ? 'text-[#dc2626]' : 'text-slate-500'}`}>
                    {format(day, 'E', { locale: ptBR })}
                  </span>
                  <span className={`block text-lg font-black mt-0.5 ${isToday(day) ? 'text-[#dc2626]' : 'text-slate-800'}`}>
                    {format(day, 'd')}
                  </span>
                </div>
              ))}
            </div>

            {/* Time Grid */}
            <div className="relative" style={{ height: `${TIME_SLOTS.length * 60}px` }}>
              {TIME_SLOTS.map((hour, i) => (
                <div key={hour} className="absolute w-full grid grid-cols-8 border-b border-slate-100" style={{ top: `${i * 60}px`, height: '60px' }}>
                  <div className="flex items-start justify-center p-2 border-r border-slate-200 bg-slate-50">
                    <span className="text-[10px] font-bold text-slate-400">{hour}:00</span>
                  </div>
                  {weekDays.map((day, j) => (
                    <div 
                      key={j} 
                      className="border-r border-slate-100 last:border-0 hover:bg-slate-50 transition cursor-pointer relative"
                      onClick={() => openNewModal(format(day, 'yyyy-MM-dd'), `${hour.toString().padStart(2, '0')}:00`)}
                    />
                  ))}
                </div>
              ))}

              {/* Events overlay */}
              {events.filter(ev => {
                const evDate = parseISO(ev.date);
                return evDate >= weekStart && evDate <= weekEnd;
              }).map(ev => {
                const evDate = parseISO(ev.date);
                const dayIndex = getDay(evDate);
                const startHour = parseInt(ev.startTime.split(':')[0]);
                const startMin = parseInt(ev.startTime.split(':')[1]);
                const endHour = parseInt(ev.endTime.split(':')[0]);
                const endMin = parseInt(ev.endTime.split(':')[1]);
                
                // Only show if within our time slots (6h - 20h)
                if (startHour < 6 || startHour > 20) return null;

                const top = (startHour - 6) * 60 + startMin;
                const height = ((endHour - startHour) * 60) + (endMin - startMin);

                return (
                  <div 
                    key={ev.id}
                    onClick={() => openEditModal(ev)}
                    className="absolute rounded-lg p-1.5 shadow-sm border overflow-hidden cursor-pointer hover:shadow-md transition group"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc((100% / 8) * ${dayIndex + 1} + 4px)`,
                      width: `calc((100% / 8) - 8px)`,
                      backgroundColor: ev.type === 'presential' ? '#fee2e2' : ev.type === 'online' ? '#e0f2fe' : '#f3f4f6',
                      borderColor: ev.type === 'presential' ? '#fca5a5' : ev.type === 'online' ? '#bae6fd' : '#e5e7eb',
                    }}
                  >
                    <div className={`w-1 h-full absolute left-0 top-0 ${ev.type === 'presential' ? 'bg-red-500' : ev.type === 'online' ? 'bg-sky-500' : 'bg-slate-400'}`} />
                    <div className="pl-1.5">
                      <p className={`text-[9px] font-black uppercase truncate ${ev.type === 'presential' ? 'text-red-900' : ev.type === 'online' ? 'text-sky-900' : 'text-slate-700'}`}>
                        {ev.title}
                      </p>
                      <p className={`text-[8px] font-bold mt-0.5 ${ev.type === 'presential' ? 'text-red-700' : ev.type === 'online' ? 'text-sky-700' : 'text-slate-500'}`}>
                        {ev.startTime} - {ev.endTime}
                      </p>
                      {ev.studentName && (
                        <p className={`text-[8px] mt-0.5 truncate ${ev.type === 'presential' ? 'text-red-600' : ev.type === 'online' ? 'text-sky-600' : 'text-slate-400'}`}>
                          {ev.studentName}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'month' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                <div key={d} className="p-3 text-center text-[10px] font-black uppercase text-slate-500 border-r border-slate-200 last:border-0">{d}</div>
              ))}
            </div>
            
            {(() => {
              const monthStart = startOfMonth(currentDate);
              const monthEnd = endOfMonth(currentDate);
              const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
              const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
              const days = eachDayOfInterval({ start: calStart, end: calEnd });

              return (
                <div className="grid grid-cols-7 auto-rows-fr">
                  {days.map((day, i) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayEvents = events.filter(e => e.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
                    
                    return (
                      <div 
                        key={i} 
                        onClick={() => openNewModal(dateStr)}
                        className={`min-h-[100px] p-2 border-r border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition ${!isSameMonth(day, currentDate) ? 'bg-slate-50 opacity-50' : ''}`}
                      >
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${isToday(day) ? 'bg-[#dc2626] text-white' : 'text-slate-700'}`}>
                          {format(day, 'd')}
                        </span>
                        
                        <div className="space-y-1">
                          {dayEvents.map(ev => (
                            <div 
                              key={ev.id}
                              onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold truncate ${
                                ev.type === 'presential' ? 'bg-red-50 text-red-700 border border-red-100' :
                                ev.type === 'online' ? 'bg-sky-50 text-sky-700 border border-sky-100' :
                                'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {ev.startTime} - {ev.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Modal de Agendamento */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800">
                {selectedEvent ? 'Editar Agendamento' : 'Novo Agendamento'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500">Título / Assunto</label>
                <input 
                  required
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="Ex: Treino Costas, Avaliação Física..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-[#dc2626] transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                  <User className="w-3 h-3" /> Aluno Vinculado (Opcional)
                </label>
                <select 
                  value={formData.studentId || ''}
                  onChange={e => setFormData({...formData, studentId: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-[#dc2626] transition"
                >
                  <option value="">-- Nenhum Aluno Específico --</option>
                  {users.map(u => (
                    <option key={u.uid} value={u.uid}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5 col-span-3">
                  <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3" /> Data
                  </label>
                  <input 
                    type="date"
                    required
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-[#dc2626] transition"
                  />
                </div>
                
                <div className="space-y-1.5 col-span-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Início</label>
                  <input 
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={e => setFormData({...formData, startTime: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-[#dc2626] transition"
                  />
                </div>
                
                <div className="space-y-1.5 col-span-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Fim</label>
                  <input 
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={e => setFormData({...formData, endTime: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-[#dc2626] transition"
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block">Tipo de Agendamento</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, type: 'presential'})}
                    className={`flex-1 flex flex-col items-center p-3 rounded-xl border-2 transition ${formData.type === 'presential' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
                  >
                    <MapPin className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-black uppercase">Presencial</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, type: 'online'})}
                    className={`flex-1 flex flex-col items-center p-3 rounded-xl border-2 transition ${formData.type === 'online' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
                  >
                    <Video className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-black uppercase">Online</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                  <AlignLeft className="w-3 h-3" /> Notas / Observações
                </label>
                <textarea 
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  placeholder="Instruções adicionais..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-[#dc2626] transition h-20 resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                {selectedEvent && (
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedEvent.id)}
                    className="p-3 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 bg-[#dc2626] text-white py-3 rounded-xl font-black italic uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-red-200 hover:bg-[#ef4444] transition active:scale-95"
                >
                  <Edit2 className="w-4 h-4" /> {selectedEvent ? 'Salvar Edição' : 'Agendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
