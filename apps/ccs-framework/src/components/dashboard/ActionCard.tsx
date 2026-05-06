import React from 'react';
import { Plus, Filter } from 'lucide-react';

interface ActionCardProps {
  label: string;
  type: 'primary' | 'secondary';
}

export const ActionCard: React.FC<ActionCardProps> = ({ label, type }) => {
  const isPrimary = type === 'primary';
  
  return (
    <button 
      className={`h-full w-full rounded-2xl flex flex-col items-center justify-center gap-3 transition-all active:scale-95 shadow-sm hover:shadow-md
      ${isPrimary 
        ? 'bg-blue-600 text-white hover:bg-blue-700' 
        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}
      `}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPrimary ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
        {isPrimary ? <Plus className="w-5 h-5" /> : <Filter className="w-5 h-5" />}
      </div>
      <span className="text-sm font-bold tracking-wide">{label}</span>
    </button>
  );
};
