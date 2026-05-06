import React from 'react';

interface StatsCardProps {
  label: string;
  value: string;
  color: 'blue' | 'red' | 'green';
}

export const StatsCard: React.FC<StatsCardProps> = ({ label, value, color }) => {
  const colorMap = {
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    red: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
    green: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
  };

  return (
    <div className="h-full w-full bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] active:scale-95 group">
      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">
        {label}
      </span>
      <div className={`text-4xl font-black tabular-nums transition-colors ${colorMap[color].split(' ')[0]}`}>
        {value}
      </div>
      <div className={`w-8 h-1 rounded-full mt-3 opacity-0 group-hover:opacity-100 transition-opacity ${colorMap[color].split(' ')[0].replace('text-', 'bg-')}`}></div>
    </div>
  );
};
