import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, MapPin, LayoutGrid, ChevronLeft, ChevronRight, Users, X, 
  AlertCircle, Split, Lock, Unlock, Save, 
  Download, Upload, Trash2, Search, Briefcase, Calendar 
} from 'lucide-react';

// --- 1. DEFINICIÓN DE TIPOS E INTERFACES ---

type WorkStatus = 'pending' | 'scheduled' | 'completed';
type WorkType = 'Montaje (M)' | 'Revisión (R)' | 'Otro';

interface WorkOrder {
  id: string;
  code: string;
  client: string;
  address: string;
  city: string;
  coordinates: { x: number; y: number };
  dateAccepted: string;
  dateExpiration?: string;
  totalDays: number;
  currentDay: number;
  fractionOfDay: number; 
  status: WorkStatus;
  scheduledDate?: string;
  assignedTeam?: string;
  type: WorkType;
  isSplit?: boolean;
  isFixed?: boolean;
}

interface TeamAvailability {
  [date: string]: string[];
}

interface TeamManagerModalProps {
  onClose: () => void;
  teams: TeamAvailability;
  setTeams: React.Dispatch<React.SetStateAction<TeamAvailability>>;
}

const INSTALLERS = ["Victor", "Mikel", "Natan", "Nacor", "Maite", "Jonan", "Fiti", "Tenka", "Eneko"];

// --- 2. UTILIDADES ---

const getLocalISODate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const fractionToHours = (frac: number) => (frac * 8).toFixed(1);

const getDistance = (w1: WorkOrder, w2: WorkOrder) => {
    return Math.hypot(w1.coordinates.x - w2.coordinates.x, w1.coordinates.y - w2.coordinates.y);
};

const getWeekDates = (baseDate: Date) => {
  const date = new Date(baseDate);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  
  const week = [];
  for (let i = 0; i < 7; i++) {
    const nextDate = new Date(monday);
    nextDate.setDate(monday.getDate() + i);
    week.push(nextDate);
  }
  return week;
};

const getNextDayString = (dateStr: string): string => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    if (date.getDay() === 6) date.setDate(date.getDate() + 2); 
    if (date.getDay() === 0) date.setDate(date.getDate() + 1); 
    return getLocalISODate(date);
};

// --- 3. DATOS INICIALES ---
const INITIAL_WORKS_REAL: WorkOrder[] = []; 
const INITIAL_TEAMS_REAL: TeamAvailability = {};

// --- 4. COMPONENTE PRINCIPAL ---

export default function InstallPlanApp() {
  const [works, setWorks] = useState<WorkOrder[]>(() => {
      try {
          const saved = localStorage.getItem('installPlan_works');
          return saved ? JSON.parse(saved) : INITIAL_WORKS_REAL;
      } catch(e) { return INITIAL_WORKS_REAL; }
  });

  const [teams, setTeams] = useState<TeamAvailability>(() => {
      try {
          const saved = localStorage.getItem('installPlan_teams');
          return saved ? JSON.parse(saved) : INITIAL_TEAMS_REAL;
      } catch(e) { return INITIAL_TEAMS_REAL; }
  });

  const [currentDate, setCurrentDate] = useState(new Date(2025, 11, 8)); 
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [draggedWork, setDraggedWork] = useState<WorkOrder | null>(null);
  const [showOverloadModal, setShowOverloadModal] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{work: WorkOrder, date: string, team: string, availableHours: number} | null>(null);
  const [selectedPendingWorkId, setSelectedPendingWorkId] = useState<string>(''); 

  const fileInputRef = useRef<HTMLInputElement>(null);
  const weekDates = getWeekDates(currentDate);

  useEffect(() => { localStorage.setItem('installPlan_works', JSON.stringify(works)); }, [works]);
  useEffect(() => { localStorage.setItem('installPlan_teams', JSON.stringify(teams)); }, [teams]);

  useEffect(() => {
    let hasChanges = false;
    const cleanedWorks = works.map(w => {
        if (w.status === 'scheduled' && w.scheduledDate) {
            const dailyTeams = teams[w.scheduledDate];
            const hasTeams = dailyTeams && dailyTeams.length > 0;
            if (!hasTeams || (w.assignedTeam && !dailyTeams.includes(w.assignedTeam))) {
                hasChanges = true;
                return { ...w, status: 'pending', scheduledDate: undefined, assignedTeam: undefined } as WorkOrder;
            }
        }
        return w;
    });
    if (hasChanges) setWorks(cleanedWorks);
  }, [teams, works.length]);

  // --- HANDLERS ---
  const handleExport = () => {
      const data = { works, teams, date: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `InstallPlan_Backup_${getLocalISODate(new Date())}.json`;
      a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = JSON.parse(event.target?.result as string);
              if (data.works && data.teams) {
                  if(window.confirm('¿Sobrescribir datos actuales?')) {
                      setTeams(data.teams);
                      setWorks(data.works);
                  }
              } else { alert('Formato incorrecto.'); }
          } catch(err) { alert('Error al leer JSON.'); }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleReset = () => {
      if(window.confirm('¿Borrar todo?')) { setWorks([]); setTeams({}); }
  };

  const getTeamLoad = (dateStr: string, teamName: string) => {
    const teamWorks = works.filter(w => w.scheduledDate === dateStr && w.assignedTeam === teamName);
    return teamWorks.reduce((acc, w) => acc + (w.fractionOfDay * 8), 0);
  };

  const toggleTaskLock = (workId: string) => {
      setWorks(works.map(w => w.id === workId ? { ...w, isFixed: !w.isFixed } : w));
  };

  const handleDropAttempt = (dateStr: string, teamName: string) => {
    if (!draggedWork) return;
    if (draggedWork.isFixed && draggedWork.status === 'scheduled') return;

    const currentLoad = getTeamLoad(dateStr, teamName);
    const workHours = draggedWork.fractionOfDay * 8;
    const totalLoad = currentLoad + workHours;

    if (totalLoad > 8.1) {
        const availableHours = Math.max(0, 8 - currentLoad);
        setPendingDrop({ work: draggedWork, date: dateStr, team: teamName, availableHours });
        setShowOverloadModal(true);
    } else {
        executeDrop(draggedWork, dateStr, teamName);
    }
    setDraggedWork(null); 
  };

  const executeDrop = (work: WorkOrder, dateStr: string, teamName: string) => {
      const updatedWorks = works.map(w => 
        w.id === work.id 
          ? { ...w, status: 'scheduled' as WorkStatus, scheduledDate: dateStr, assignedTeam: teamName } 
          : w
      );
      setWorks(updatedWorks);
      if (selectedPendingWorkId === work.id) setSelectedPendingWorkId('');
  };

  const handleUnscheduleDrop = () => {
      if (draggedWork && draggedWork.status === 'scheduled') {
          const updatedWorks = works.map(w => 
              w.id === draggedWork.id 
                  ? { ...w, status: 'pending' as WorkStatus, scheduledDate: undefined, assignedTeam: undefined }
                  : w
          );
          setWorks(updatedWorks);
          setDraggedWork(null);
      }
  };

  const confirmSplit = () => {
    if (!pendingDrop) return;
    const { work, date, team, availableHours } = pendingDrop;
    const remainingHours = (work.fractionOfDay * 8) - availableHours;
    
    if (availableHours <= 0.5) {
        const nextDate = getNextDayString(date);
        const newWorks = works.map(w => w.id === work.id ? { ...w, status: 'scheduled' as WorkStatus, scheduledDate: nextDate, assignedTeam: team } : w);
        setWorks(newWorks);
    } else {
        const fractionToday = availableHours / 8;
        const fractionTomorrow = remainingHours / 8;
        const nextDate = getNextDayString(date);
        const newWorks = works.map(w => w.id === work.id ? { ...w, status: 'scheduled' as WorkStatus, scheduledDate: date, assignedTeam: team, fractionOfDay: fractionToday, isSplit: true } : w);
        const splitWork: WorkOrder = {
            ...work,
            id: `${work.id}_split_${Date.now()}`,
            fractionOfDay: fractionTomorrow,
            scheduledDate: nextDate,
            assignedTeam: team, 
            status: 'scheduled',
            isSplit: true,
            code: `${work.code} (P2)`
        };
        setWorks([...newWorks, splitWork]);
    }
    setShowOverloadModal(false); setPendingDrop(null);
    if (selectedPendingWorkId === work.id) setSelectedPendingWorkId('');
  };

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const pendingWorks = works.filter(w => w.status === 'pending');
  const visiblePendingWorks = selectedPendingWorkId 
      ? pendingWorks.filter(w => w.id === selectedPendingWorkId)
      : pendingWorks;

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden text-slate-700">
      
      {/* SIDEBAR: PENDIENTE */}
      <div 
        className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-30 shrink-0 transition-colors"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-red-50'); }}
        onDragLeave={(e) => { e.currentTarget.classList.remove('bg-red-50'); }}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('bg-red-50'); handleUnscheduleDrop(); }}
      >
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
           <div className="flex justify-between items-center">
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-base tracking-tight">
                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><LayoutGrid size={18}/></div>
                    Pendientes
                </h2>
                <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs font-bold">{pendingWorks.length}</span>
           </div>
           
           <div className="relative group">
             <div className="absolute left-2.5 top-2.5 text-slate-400"><Search size={14}/></div>
             <select 
               value={selectedPendingWorkId} 
               onChange={(e) => setSelectedPendingWorkId(e.target.value)}
               className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none shadow-sm transition-all cursor-pointer hover:border-slate-300"
             >
               <option value="">Buscar obra para mover...</option>
               {pendingWorks.map(w => (
                 <option key={w.id} value={w.id}>
                   {w.client.substring(0, 25)}... ({fractionToHours(w.fractionOfDay)}h)
                 </option>
               ))}
             </select>
             {selectedPendingWorkId && (
               <button onClick={() => setSelectedPendingWorkId('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-red-500"><X size={14}/></button>
             )}
           </div>
           
           {/* Info Drop Zone */}
           <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 border-t border-slate-200/50 pt-2 mt-1 border-dashed">
             <Trash2 size={10}/> Arrastra aquí desde el calendario para quitar
           </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50 custom-scrollbar">
          {visiblePendingWorks.map(work => (
            <div 
              key={work.id}
              draggable
              onDragStart={() => setDraggedWork(work)}
              onDragEnd={() => setDraggedWork(null)}
              className={`p-3.5 rounded-xl border transition-all duration-200 cursor-grab active:cursor-grabbing group relative bg-white
                ${work.dateExpiration ? 'border-l-[3px] border-l-red-500 border-slate-200' : 'border-slate-200 hover:border-blue-300'}
                ${selectedPendingWorkId === work.id ? 'ring-2 ring-blue-500 shadow-md' : 'shadow-sm hover:shadow-md'}
              `}
            >
              <div className="flex justify-between items-start mb-2">
                 <div className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${work.type.includes('M') ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                    {work.code}
                 </div>
                 {work.dateExpiration && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 rounded">V: {work.dateExpiration.split('-').slice(1).join('/')}</span>}
              </div>
              <div className="font-semibold text-slate-800 text-sm line-clamp-2 leading-tight mb-3" title={work.client}>{work.client}</div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md font-medium text-slate-700">
                    <Clock size={12} className="text-slate-400"/> {fractionToHours(work.fractionOfDay)}h
                  </div>
                  <div className="flex items-center gap-1 overflow-hidden" title={work.city}>
                    <MapPin size={12} className="text-slate-400 shrink-0"/> <span className="truncate">{work.city}</span>
                  </div>
              </div>
            </div>
          ))}
          {pendingWorks.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 opacity-60">
                <Briefcase size={32}/>
                <span className="text-sm font-medium">Todo asignado</span>
            </div>
          )}
        </div>

        <div className="p-3 bg-white border-t border-slate-200">
            <div className="grid grid-cols-3 gap-2">
                <button onClick={handleExport} className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-slate-50 text-slate-500 transition-colors group" title="Guardar"><Download size={16} className="mb-1 group-hover:text-blue-600"/><span className="text-[10px] font-medium">Guardar</span></button>
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-slate-50 text-slate-500 transition-colors group" title="Cargar"><Upload size={16} className="mb-1 group-hover:text-blue-600"/><span className="text-[10px] font-medium">Cargar</span><input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json"/></button>
                <button onClick={handleReset} className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-red-50 text-slate-500 transition-colors group" title="Reset"><Trash2 size={16} className="mb-1 group-hover:text-red-500"/><span className="text-[10px] font-medium group-hover:text-red-600">Reset</span></button>
            </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-100">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-20 shrink-0">
           <div className="flex items-center gap-6">
              <div className="flex items-center bg-slate-50 rounded-xl p-1 border border-slate-200">
                  <button onClick={handlePrevWeek} className="p-1.5 hover:bg-white rounded-lg shadow-sm text-slate-500 hover:text-slate-800 transition-all"><ChevronLeft size={18}/></button>
                  <div className="px-4 flex flex-col items-center min-w-[180px]">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Semana {weekDates[0].getDate()} - {weekDates[6].getDate()}</span>
                    <span className="text-sm font-bold text-slate-800 uppercase">{weekDates[0].toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</span>
                  </div>
                  <button onClick={handleNextWeek} className="p-1.5 hover:bg-white rounded-lg shadow-sm text-slate-500 hover:text-slate-800 transition-all"><ChevronRight size={18}/></button>
              </div>
              <button 
                onClick={() => setCurrentDate(currentDate.getFullYear() === 2025 ? new Date(2026, 0, 7) : new Date(2025, 11, 8))}
                className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
              >
                <Calendar size={12}/>
                {currentDate.getFullYear() === 2025 ? "Ir a 2026" : "Ir a 2025"}
              </button>
           </div>
           
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                  <Save size={12}/><span>AUTOGUARDADO</span>
              </div>
              <button 
                onClick={() => setShowTeamModal(true)}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 shadow-md hover:shadow-lg transition-all active:scale-95"
              >
                <Users size={14}/>
                Gestionar Cuadrillas
              </button>
           </div>
        </header>

        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 custom-scrollbar">
            <div className="h-full flex gap-3 min-w-max">
                {weekDates.map((date) => {
                    const dateStr = getLocalISODate(date);
                    const dailyTeams = teams[dateStr] || [];
                    const isToday = getLocalISODate(new Date()) === dateStr;
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                    return (
                        <div key={dateStr} className={`flex flex-col rounded-xl overflow-hidden border shadow-sm transition-shadow hover:shadow-md ${isWeekend ? 'w-48 bg-slate-50/50 border-slate-200' : 'w-80 lg:w-96 bg-white border-slate-200'}`}>
                            {/* COLUMN HEADER */}
                            <div className={`p-3 border-b flex justify-between items-center ${isToday ? 'bg-blue-50/50 border-blue-100' : 'bg-white border-slate-100'}`}>
                                <div className="flex flex-col">
                                    <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>{date.toLocaleDateString('es-ES', { weekday: 'long' })}</span>
                                    <span className={`text-xl font-black leading-none mt-0.5 ${isToday ? 'text-blue-700' : 'text-slate-700'}`}>{date.getDate()}</span>
                                </div>
                                {dailyTeams.length === 0 && !isWeekend && (
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                                        <AlertCircle size={10}/> Sin Equipos
                                    </div>
                                )}
                            </div>

                            {/* COLUMN BODY */}
                            <div className="flex-1 flex divide-x divide-slate-100 overflow-hidden relative">
                                {dailyTeams.length > 0 ? (
                                    dailyTeams.map((teamName) => {
                                        const load = getTeamLoad(dateStr, teamName);
                                        const isOverloaded = load > 8;
                                        const loadPercentage = Math.min((load/8)*100, 100);
                                        
                                        return (
                                            <div 
                                                key={`${dateStr}-${teamName}`} 
                                                className="flex-1 flex flex-col min-w-[140px] bg-slate-50/30 group transition-colors"
                                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-blue-50/50'); }}
                                                onDragLeave={(e) => { e.currentTarget.classList.remove('bg-blue-50/50'); }}
                                                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('bg-blue-50/50'); handleDropAttempt(dateStr, teamName); }}
                                            >
                                                {/* TEAM HEADER */}
                                                <div className="px-3 py-2 border-b border-slate-100 bg-white sticky top-0 z-10">
                                                    <div className="flex justify-between items-end mb-1.5">
                                                        <span className="text-[11px] font-bold text-slate-700 truncate max-w-[100px]" title={teamName}>{teamName}</span>
                                                        <span className={`text-[10px] font-mono font-bold ${isOverloaded ? 'text-red-600' : 'text-slate-400'}`}>{load.toFixed(1)}/8h</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all duration-500 ${isOverloaded ? 'bg-red-500' : 'bg-emerald-400'}`} style={{ width: `${loadPercentage}%` }}></div>
                                                    </div>
                                                </div>

                                                {/* DROP ZONE */}
                                                <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar-thin pb-10">
                                                    {works.filter(w => w.scheduledDate === dateStr && w.assignedTeam === teamName).map(work => {
                                                        const isNearby = draggedWork && draggedWork.id !== work.id && getDistance(draggedWork, work) < 15; 
                                                        return (
                                                            <div 
                                                                key={work.id}
                                                                draggable={!work.isFixed} 
                                                                onDragStart={() => setDraggedWork(work)}
                                                                onDragEnd={() => setDraggedWork(null)}
                                                                className={`p-3 rounded-xl border shadow-sm text-xs relative group/item transition-all duration-200 bg-white
                                                                    ${work.isFixed 
                                                                        ? 'border-purple-200 bg-purple-50/30' 
                                                                        : 'border-slate-200 hover:border-blue-300 hover:shadow-md cursor-grab active:cursor-grabbing'
                                                                    }
                                                                    ${isNearby ? 'ring-2 ring-emerald-400 ring-offset-1 scale-[1.02] z-20' : ''}
                                                                `}
                                                            >
                                                                {isNearby && <div className="absolute -top-2 -right-1 bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold animate-bounce shadow-sm z-30">📍 Cerca</div>}
                                                                
                                                                <div className="flex justify-between items-start gap-2 mb-1.5">
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide truncate ${work.type.includes('M') ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                        {work.code}
                                                                    </span>
                                                                    <div className="flex items-center gap-1 shrink-0">
                                                                        {work.isSplit && <Split size={12} className="text-slate-400"/>}
                                                                        <button onClick={() => toggleTaskLock(work.id)} className="text-slate-300 hover:text-purple-600 transition-colors">
                                                                            {work.isFixed ? <Lock size={12} className="text-purple-500"/> : <Unlock size={12} className="opacity-0 group-hover/item:opacity-100"/>}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                
                                                                <div className="font-semibold text-slate-700 mb-2 leading-snug" title={work.client}>{work.client}</div>
                                                                
                                                                <div className="flex justify-between items-end">
                                                                    <div className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-extrabold text-xs">
                                                                        {fractionToHours(work.fractionOfDay)}h
                                                                    </div>
                                                                    {work.totalDays > 1 && <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 rounded">Día {work.currentDay}/{work.totalDays}</span>}
                                                                </div>
                                                                
                                                                {!work.isFixed && (
                                                                    <button 
                                                                        onClick={() => {
                                                                            const updated = works.map(w => w.id === work.id ? {...w, status: 'pending' as WorkStatus, scheduledDate: undefined, assignedTeam: undefined} : w);
                                                                            setWorks(updated);
                                                                        }}
                                                                        className="absolute -top-1 -right-1 bg-white border border-slate-200 rounded-full p-0.5 opacity-0 group-hover/item:opacity-100 text-slate-400 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                                                                    >
                                                                        <X size={12}/>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="h-20 border-2 border-dashed border-slate-100 rounded-xl flex items-center justify-center text-slate-300 text-[10px] font-medium opacity-0 hover:opacity-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all">
                                                        + Soltar Trabajo
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    // EMPTY STATE FOR DAY
                                    <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes-light.png')] opacity-50">
                                        {/* Pattern background simulates "blocked" */}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* MODAL DE SOBRECARGA (ESTILO MEJORADO) */}
        {showOverloadModal && pendingDrop && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 border border-slate-100">
                    <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-4 mx-auto ring-8 ring-amber-50/50"><Split size={28} /></div>
                    <h3 className="text-xl font-bold text-center text-slate-800 mb-2">Jornada Completa</h3>
                    <p className="text-sm text-slate-500 text-center mb-8 px-4 leading-relaxed">
                        El turno de <strong className="text-slate-800">{pendingDrop.team}</strong> está lleno. 
                        Intentas añadir <strong>{(pendingDrop.work.fractionOfDay * 8).toFixed(1)}h</strong> pero solo quedan <strong className="text-emerald-600">{pendingDrop.availableHours.toFixed(1)}h</strong> disponibles.
                    </p>
                    
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">1</div>
                            <div className="text-sm">
                                <span className="block font-bold text-slate-700">Llenar el día de hoy</span>
                                <span className="text-slate-400 text-xs">Asignar {pendingDrop.availableHours.toFixed(1)}h a {pendingDrop.date}</span>
                            </div>
                        </div>
                        <div className="pl-5"><div className="h-6 w-0.5 bg-slate-200"></div></div>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm shrink-0">2</div>
                            <div className="text-sm">
                                <span className="block font-bold text-slate-700">Pasar el resto a mañana</span>
                                <span className="text-slate-400 text-xs">Mover {(pendingDrop.work.fractionOfDay * 8 - pendingDrop.availableHours).toFixed(1)}h al siguiente día</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => { setShowOverloadModal(false); setPendingDrop(null); }} className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all">Cancelar</button>
                        <button onClick={confirmSplit} className="py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all">Dividir Tarea</button>
                    </div>
                </div>
            </div>
        )}
      </div>

      {showTeamModal && <TeamManagerModal onClose={() => setShowTeamModal(false)} teams={teams} setTeams={setTeams} />}
    </div>
  );
}

// --- 5. MODAL DE EQUIPOS (ESTILO MEJORADO) ---
function TeamManagerModal({ onClose, teams, setTeams }: TeamManagerModalProps) {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedInstallers, setSelectedInstallers] = useState<string[]>([]);
    const [tempPairs, setTempPairs] = useState<string[]>([]);

    const handleAddPair = () => {
        if (selectedInstallers.length !== 2) return alert("Selecciona 2 montadores");
        setTempPairs([...tempPairs, `${selectedInstallers[0]} + ${selectedInstallers[1]}`]);
        setSelectedInstallers([]);
    };

    const handleApplyTeams = () => {
        if (!startDate || !endDate) return alert("Faltan fechas");
        if (tempPairs.length === 0) return alert("Añade parejas");
        const start = new Date(startDate);
        const end = new Date(endDate);
        const newAvailability = { ...teams };
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            newAvailability[getLocalISODate(d)] = tempPairs;
        }
        setTeams(newAvailability);
        onClose();
    };

    const toggleInstaller = (name: string) => {
        if (selectedInstallers.includes(name)) setSelectedInstallers(selectedInstallers.filter(n => n !== name));
        else if (selectedInstallers.length < 2) setSelectedInstallers([...selectedInstallers, name]);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">Gestión de Cuadrillas</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Asigna parejas de montadores por rango de fechas</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X size={20}/></button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
                    {/* FECHAS */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Rango de fechas</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-slate-600 mb-1.5">Desde</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"/></div>
                            <div><label className="block text-xs font-bold text-slate-600 mb-1.5">Hasta</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"/></div>
                        </div>
                    </div>
                    
                    {/* SELECTOR */}
                    <div>
                        <div className="flex justify-between items-end mb-3">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Formar Pareja</label>
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{selectedInstallers.length}/2 Seleccionados</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {INSTALLERS.map(name => (
                                <button 
                                    key={name} 
                                    onClick={() => toggleInstaller(name)} 
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all
                                        ${selectedInstallers.includes(name) 
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-200 transform scale-105' 
                                            : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                                        }
                                    `}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={handleAddPair} 
                            disabled={selectedInstallers.length !== 2} 
                            className="w-full mt-4 py-3 bg-blue-50 text-blue-600 text-sm font-bold rounded-xl hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            <Users size={16}/> Añadir Pareja a la Lista
                        </button>
                    </div>

                    {/* LISTA */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Cuadrillas Preparadas</label>
                        <div className="space-y-2">
                            {tempPairs.map((p, i) => (
                                <div key={i} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">{i+1}</div>
                                        <span className="font-bold text-slate-700">{p}</span>
                                    </div>
                                    <button onClick={() => setTempPairs(tempPairs.filter((_, idx) => idx !== i))} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                </div>
                            ))}
                            {tempPairs.length === 0 && (
                                <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
                                    <p className="text-xs text-slate-400">No has creado ninguna pareja todavía.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="p-5 border-t border-slate-100 bg-slate-50/50">
                    <button onClick={handleApplyTeams} className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl text-sm hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all transform active:scale-[0.98]">
                        Aplicar Cambios al Calendario
                    </button>
                </div>
            </div>
        </div>
    );
}