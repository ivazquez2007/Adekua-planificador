import React, { useState, useEffect, useRef } from 'react';
import { Clock, MapPin, LayoutGrid, ChevronLeft, ChevronRight, Users, X, AlertCircle, Split, ArrowRightCircle, Lock, Unlock, Save, Download, Upload, Trash2, Search } from 'lucide-react';

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
  fractionOfDay: number; // 0.1 a 1.0 (1.0 = 8 horas)
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

// --- 2. UTILIDADES DE FECHA ---

const getLocalISODate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const fractionToHours = (frac: number) => (frac * 8).toFixed(1);

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

  const [currentDate, setCurrentDate] = useState(new Date(2025, 11, 8)); // 8 Dic 2025
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [draggedWork, setDraggedWork] = useState<WorkOrder | null>(null);
  const [showOverloadModal, setShowOverloadModal] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{work: WorkOrder, date: string, team: string, availableHours: number} | null>(null);
  const [selectedPendingWorkId, setSelectedPendingWorkId] = useState<string>(''); // Para el filtro del sidebar

  const fileInputRef = useRef<HTMLInputElement>(null);
  const weekDates = getWeekDates(currentDate);

  useEffect(() => {
      localStorage.setItem('installPlan_works', JSON.stringify(works));
  }, [works]);

  useEffect(() => {
      localStorage.setItem('installPlan_teams', JSON.stringify(teams));
  }, [teams]);

  // Limpieza de obras huérfanas
  useEffect(() => {
    let hasChanges = false;
    const cleanedWorks = works.map(w => {
        if (w.status === 'scheduled' && w.scheduledDate) {
            const dailyTeams = teams[w.scheduledDate];
            const hasTeams = dailyTeams && dailyTeams.length > 0;
            if (!hasTeams) {
                hasChanges = true;
                return { ...w, status: 'pending', scheduledDate: undefined, assignedTeam: undefined } as WorkOrder;
            }
            if (w.assignedTeam && !dailyTeams.includes(w.assignedTeam)) {
                 hasChanges = true;
                 return { ...w, status: 'pending', scheduledDate: undefined, assignedTeam: undefined } as WorkOrder;
            }
        }
        return w;
    });

    if (hasChanges) {
        setWorks(cleanedWorks);
    }
  }, [teams, works.length]);

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
                  if(window.confirm('Se van a sobrescribir los datos. ¿Estás seguro?')) {
                      setTeams(data.teams);
                      setWorks(data.works);
                      alert('Datos cargados correctamente.');
                  }
              } else {
                  alert('Formato incorrecto.');
              }
          } catch(err) { alert('Error al leer el archivo JSON.'); }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleReset = () => {
      if(window.confirm('¿Borrar todo?')) {
          setWorks([]);
          setTeams({});
      }
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
        setPendingDrop({
            work: draggedWork,
            date: dateStr,
            team: teamName,
            availableHours: availableHours
        });
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
      // Limpiar filtro si se arrastró la seleccionada
      if (selectedPendingWorkId === work.id) setSelectedPendingWorkId('');
  };

  const confirmSplit = () => {
    if (!pendingDrop) return;
    const { work, date, team, availableHours } = pendingDrop;
    const totalHours = work.fractionOfDay * 8;
    const remainingHours = totalHours - availableHours;
    
    if (availableHours <= 0.5) {
        const nextDate = getNextDayString(date);
        const newWorks = works.map(w => {
            if (w.id === work.id) {
                return { ...w, status: 'scheduled' as WorkStatus, scheduledDate: nextDate, assignedTeam: team };
            }
            return w;
        });
        setWorks(newWorks);
    } else {
        const fractionToday = availableHours / 8;
        const fractionTomorrow = remainingHours / 8;
        const nextDate = getNextDayString(date);

        const newWorks = works.map(w => {
            if (w.id === work.id) {
                return {
                    ...w,
                    status: 'scheduled' as WorkStatus,
                    scheduledDate: date,
                    assignedTeam: team,
                    fractionOfDay: fractionToday,
                    isSplit: true
                };
            }
            return w;
        });

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
    setShowOverloadModal(false);
    setPendingDrop(null);
    if (selectedPendingWorkId === work.id) setSelectedPendingWorkId('');
  };

  const cancelDrop = () => {
      setShowOverloadModal(false);
      setPendingDrop(null);
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

  // Filtrado para el sidebar
  const pendingWorks = works.filter(w => w.status === 'pending');
  const visiblePendingWorks = selectedPendingWorkId 
      ? pendingWorks.filter(w => w.id === selectedPendingWorkId)
      : pendingWorks;

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      {/* Sidebar: Obras Pendientes */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-lg z-20 shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-2">
           <h2 className="font-bold text-slate-700 flex items-center gap-2 text-sm uppercase tracking-wide">
             <LayoutGrid size={16} className="text-blue-600"/>
             Pendientes ({pendingWorks.length})
           </h2>
           
           {/* DROPDOWN PARA ELEGIR OBRA */}
           <div className="relative">
             <select 
               value={selectedPendingWorkId} 
               onChange={(e) => setSelectedPendingWorkId(e.target.value)}
               className="w-full p-2 text-xs border border-slate-300 rounded bg-white text-slate-700 focus:outline-none focus:border-blue-500"
             >
               <option value="">🔍 Elegir obra para mover...</option>
               {pendingWorks.map(w => (
                 <option key={w.id} value={w.id}>
                   {w.code} - {w.client.substring(0, 20)}
                 </option>
               ))}
             </select>
             {selectedPendingWorkId && (
               <button 
                 onClick={() => setSelectedPendingWorkId('')}
                 className="absolute right-8 top-2 text-slate-400 hover:text-slate-600"
                 title="Limpiar filtro"
               >
                 <X size={12}/>
               </button>
             )}
           </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50">
          {visiblePendingWorks.map(work => (
            <div 
              key={work.id}
              draggable
              onDragStart={() => setDraggedWork(work)}
              className={`p-3 rounded border shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md bg-white group relative
                ${work.dateExpiration ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-slate-400'}
                ${selectedPendingWorkId === work.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''}
              `}
            >
              <div className="flex justify-between items-start mb-1">
                 <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${work.type.includes('M') ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {work.code}
                 </span>
                 <div className="flex items-center gap-2">
                    {work.dateExpiration && <span className="text-[10px] font-bold text-red-600">V: {work.dateExpiration.split('-').slice(1).join('/')}</span>}
                 </div>
              </div>
              <div className="font-semibold text-slate-800 text-xs line-clamp-2 leading-tight mb-2" title={work.client}>{work.client}</div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-100 p-1 rounded justify-between">
                  <div className="flex items-center gap-1"><Clock size={10}/> {fractionToHours(work.fractionOfDay)}h</div>
                  <div className="flex items-center gap-1"><MapPin size={10}/> {work.city}</div>
              </div>
            </div>
          ))}
          {pendingWorks.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">Todo asignado</div>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Datos y Backup</p>
            <div className="grid grid-cols-3 gap-1">
                <button onClick={handleExport} className="flex flex-col items-center justify-center p-2 bg-white border border-slate-200 rounded hover:bg-blue-50 hover:border-blue-200 transition-colors" title="Guardar Copia en PC">
                    <Download size={14} className="text-slate-600 mb-1"/>
                    <span className="text-[9px] text-slate-600">Guardar</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-2 bg-white border border-slate-200 rounded hover:bg-blue-50 hover:border-blue-200 transition-colors" title="Cargar Copia desde PC">
                    <Upload size={14} className="text-slate-600 mb-1"/>
                    <span className="text-[9px] text-slate-600">Cargar</span>
                    <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json"/>
                </button>
                <button onClick={handleReset} className="flex flex-col items-center justify-center p-2 bg-white border border-slate-200 rounded hover:bg-red-50 hover:border-red-200 transition-colors" title="Borrar Todo">
                    <Trash2 size={14} className="text-red-500 mb-1"/>
                    <span className="text-[9px] text-red-500">Reset</span>
                </button>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm z-10 shrink-0 h-14">
           <div className="flex items-center gap-4">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                  <button onClick={handlePrevWeek} className="p-1.5 hover:bg-white rounded shadow-sm transition-colors text-slate-600"><ChevronLeft size={18}/></button>
                  <span className="px-3 font-bold text-slate-700 text-sm min-w-[200px] text-center uppercase">
                    Semana {weekDates[0].getDate()} - {weekDates[6].getDate()} {weekDates[0].toLocaleString('es-ES', { month: 'short', year: 'numeric' })}
                  </span>
                  <button onClick={handleNextWeek} className="p-1.5 hover:bg-white rounded shadow-sm transition-colors text-slate-600"><ChevronRight size={18}/></button>
              </div>
              <button 
                onClick={() => setCurrentDate(currentDate.getFullYear() === 2025 ? new Date(2026, 0, 7) : new Date(2025, 11, 8))}
                className="text-xs text-blue-600 hover:underline ml-4 font-medium"
              >
                {currentDate.getFullYear() === 2025 ? "Ir a Enero 2026" : "Ir a Dic 2025"}
              </button>
           </div>

           <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 mr-4 text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">
                  <Save size={12} className="text-green-500"/>
                  <span>Auto-guardado ON</span>
              </div>
              <button 
                onClick={() => setShowTeamModal(true)}
                className="flex items-center gap-2 bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-slate-700 transition-colors shadow-sm"
              >
                <Users size={14}/>
                Cuadrillas
              </button>
           </div>
        </header>

        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-slate-200 p-2">
            <div className="h-full flex gap-2 min-w-max">
                {weekDates.map((date) => {
                    const dateStr = getLocalISODate(date);
                    const dailyTeams = teams[dateStr] || [];
                    const isToday = getLocalISODate(new Date()) === dateStr;
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                    return (
                        <div key={dateStr} className={`flex flex-col rounded-lg overflow-hidden border border-slate-300 shadow-sm ${isWeekend ? 'w-48 bg-slate-100' : 'w-80 lg:w-96 bg-white'}`}>
                            <div className={`p-2 border-b border-slate-200 flex justify-between items-center ${isToday ? 'bg-blue-50' : 'bg-slate-50'}`}>
                                <div className="flex flex-col">
                                    <span className={`text-xs font-bold uppercase ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                                        {date.toLocaleDateString('es-ES', { weekday: 'long' })}
                                    </span>
                                    <span className={`text-lg font-bold leading-none ${isToday ? 'text-blue-800' : 'text-slate-700'}`}>
                                        {date.getDate()}
                                    </span>
                                </div>
                                {dailyTeams.length === 0 && !isWeekend && (
                                    <span className="text-[10px] text-red-500 font-bold bg-red-50 px-2 py-1 rounded border border-red-100">Sin Parejas</span>
                                )}
                            </div>

                            <div className="flex-1 flex divide-x divide-slate-200 overflow-hidden">
                                {dailyTeams.length > 0 ? (
                                    dailyTeams.map((teamName) => {
                                        const load = getTeamLoad(dateStr, teamName);
                                        const isOverloaded = load > 8;
                                        const loadPercentage = Math.min((load/8)*100, 100);
                                        
                                        return (
                                            <div 
                                                key={`${dateStr}-${teamName}`} 
                                                className="flex-1 flex flex-col min-w-[140px] bg-white group"
                                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-blue-50'); }}
                                                onDragLeave={(e) => { e.currentTarget.classList.remove('bg-blue-50'); }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.currentTarget.classList.remove('bg-blue-50');
                                                    handleDropAttempt(dateStr, teamName);
                                                }}
                                            >
                                                <div className="px-2 py-1.5 border-b border-slate-100 bg-slate-50/50 flex flex-col">
                                                    <span className="text-[11px] font-bold text-slate-700 truncate" title={teamName}>{teamName}</span>
                                                    <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden relative">
                                                        <div 
                                                            className={`h-full transition-all duration-300 ${isOverloaded ? 'bg-red-500' : 'bg-green-500'}`} 
                                                            style={{ width: `${loadPercentage}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className={`text-[9px] text-right ${isOverloaded ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                                                        {load.toFixed(1)}/8h
                                                    </span>
                                                </div>

                                                <div className="flex-1 p-1 space-y-1 overflow-y-auto bg-slate-50/30">
                                                    {works.filter(w => w.scheduledDate === dateStr && w.assignedTeam === teamName).map(work => (
                                                        <div 
                                                            key={work.id}
                                                            draggable={!work.isFixed} 
                                                            onDragStart={() => setDraggedWork(work)}
                                                            className={`p-1.5 rounded border shadow-sm text-xs relative group/item transition-all
                                                                ${work.isFixed 
                                                                    ? 'bg-purple-50 border-purple-300 text-purple-900 border-l-4 cursor-not-allowed' 
                                                                    : work.type.includes('M') 
                                                                        ? 'bg-blue-100 border-blue-200 text-blue-900 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-blue-300 hover:z-10' 
                                                                        : 'bg-amber-100 border-amber-200 text-amber-900 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-amber-300 hover:z-10'
                                                                }
                                                            `}
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <span className="font-bold truncate">{work.code}</span>
                                                                <div className="flex items-center gap-1">
                                                                    {work.isSplit && <Split size={10} className="text-slate-500"/>}
                                                                    <button onClick={() => toggleTaskLock(work.id)} className="text-slate-400 hover:text-purple-600">
                                                                        {work.isFixed ? <Lock size={10}/> : <Unlock size={10} className="opacity-0 group-hover/item:opacity-50"/>}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="truncate text-[10px] opacity-80" title={work.client}>{work.client}</div>
                                                            <div className="mt-1 flex justify-between text-[9px] font-mono opacity-60">
                                                                <span>{fractionToHours(work.fractionOfDay)}h</span>
                                                                {work.totalDays > 1 && <span>Día {work.currentDay}/{work.totalDays}</span>}
                                                            </div>
                                                            
                                                            {!work.isFixed && (
                                                                <button 
                                                                    onClick={() => {
                                                                        const updated = works.map(w => w.id === work.id ? {...w, status: 'pending' as WorkStatus, scheduledDate: undefined, assignedTeam: undefined} : w);
                                                                        setWorks(updated);
                                                                    }}
                                                                    className="absolute top-0.5 right-0.5 opacity-0 group-hover/item:opacity-100 text-slate-500 hover:text-red-600 p-0.5"
                                                                >
                                                                    <X size={12}/>
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <div className="h-full min-h-[50px] opacity-0 hover:opacity-100 flex items-center justify-center text-[10px] text-slate-400">
                                                        + Soltar aquí
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-4">
                                        <AlertCircle size={24} className="mb-2 opacity-50"/>
                                        <span className="text-xs text-center">Sin parejas</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {showOverloadModal && pendingDrop && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <Split size={24} />
                    </div>
                    
                    <h3 className="text-lg font-bold text-center text-slate-800 mb-2">Jornada Completa</h3>
                    <p className="text-sm text-slate-600 text-center mb-6">
                        El turno de <strong>{pendingDrop.team}</strong> no tiene espacio para <strong>{(pendingDrop.work.fractionOfDay * 8).toFixed(1)}h</strong>.
                        <br/><br/>
                        Solo quedan <strong>{pendingDrop.availableHours.toFixed(1)}h</strong> libres.
                    </p>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">1</div>
                            <div className="text-xs">
                                <span className="block font-bold text-slate-700">Asignar {pendingDrop.availableHours.toFixed(1)}h Hoy</span>
                                <span className="text-slate-500">{pendingDrop.date}</span>
                            </div>
                        </div>
                        <div className="flex justify-center">
                            <ArrowRightCircle size={16} className="text-slate-300" />
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">2</div>
                            <div className="text-xs">
                                <span className="block font-bold text-slate-700">Mover {(pendingDrop.work.fractionOfDay * 8 - pendingDrop.availableHours).toFixed(1)}h a Mañana</span>
                                <span className="text-slate-500">{getNextDayString(pendingDrop.date)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={cancelDrop} className="py-2.5 px-4 rounded-lg border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-50">Cancelar</button>
                        <button onClick={confirmSplit} className="py-2.5 px-4 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-md">Dividir Tarea</button>
                    </div>
                </div>
            </div>
        )}

      </div>

      {showTeamModal && (
        <TeamManagerModal 
          onClose={() => setShowTeamModal(false)} 
          teams={teams} 
          setTeams={setTeams}
        />
      )}

    </div>
  );
}

// --- 5. COMPONENTE AUXILIAR (MODAL) ---

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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Definir Cuadrillas</h3>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <div className="p-4 overflow-y-auto space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">Desde</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded p-2"/></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">Hasta</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded p-2"/></div>
                    </div>
                    
                    <div className="border-t pt-4">
                        <label className="block text-xs font-bold text-slate-500 mb-2">Seleccionar Pareja ({selectedInstallers.length}/2)</label>
                        <div className="flex flex-wrap gap-2">
                            {INSTALLERS.map(name => (
                                <button key={name} onClick={() => toggleInstaller(name)} className={`px-2 py-1 rounded text-xs border ${selectedInstallers.includes(name) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>{name}</button>
                            ))}
                        </div>
                        <button onClick={handleAddPair} disabled={selectedInstallers.length !== 2} className="w-full mt-2 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded hover:bg-blue-100 disabled:opacity-50">Añadir Pareja</button>
                    </div>

                    <div className="border-t pt-4">
                        <label className="block text-xs font-bold text-slate-500 mb-2">Cuadrillas a Asignar</label>
                        <div className="space-y-1">
                            {tempPairs.map((p, i) => (
                                <div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded text-xs border">
                                    <span className="font-bold">{p}</span>
                                    <button onClick={() => setTempPairs(tempPairs.filter((_, idx) => idx !== i))} className="text-red-500"><X size={14}/></button>
                                </div>
                            ))}
                            {tempPairs.length === 0 && <p className="text-xs text-slate-400 italic">Ninguna seleccionada</p>}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t bg-slate-50">
                    <button onClick={handleApplyTeams} className="w-full py-2 bg-slate-800 text-white font-bold rounded text-sm hover:bg-slate-700">Guardar Cambios</button>
                </div>
            </div>
        </div>
    );
}