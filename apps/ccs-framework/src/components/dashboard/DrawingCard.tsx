import React from 'react';
import { Clock, User, PencilRuler, Zap, AlertTriangle } from 'lucide-react';

interface DrawingCardProps {
  drawingId: string;
  title: string;
  discipline: string;
  submitter: string;
  dueDate: string;
  isUrgent: boolean;
  lang?: 'en' | 'zh';
}

export const DrawingCard: React.FC<DrawingCardProps> = ({ 
  drawingId, title, discipline, submitter, dueDate, isUrgent, lang = 'zh'
}) => {
  const isZh = lang === 'zh';
  return (
    <div className={`h-full w-full bg-white dark:bg-slate-800 p-5 rounded-2xl border ${isUrgent ? 'border-red-200 dark:border-red-900/50 bg-red-50/10' : 'border-slate-200 dark:border-slate-700'} shadow-sm flex flex-col justify-between transition-all hover:shadow-md group cursor-pointer overflow-hidden relative`}>
      {isUrgent && (
        <div className="absolute top-0 right-0 px-3 py-1 bg-red-500 text-white text-[9px] font-black uppercase tracking-widest rounded-bl-xl shadow-lg">
          {isZh ? '紧急' : 'Urgent'}
        </div>
      )}
      
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isUrgent ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
            {isUrgent ? <AlertTriangle className="w-4 h-4" /> : <PencilRuler className="w-4 h-4" />}
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{drawingId}</span>
        </div>
        
        <h3 className="font-bold text-slate-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {title}
        </h3>
        <span className="inline-block mt-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded text-[10px] font-bold uppercase tracking-wider">
          {discipline}
        </span>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[8px] font-black text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shrink-0">
            {submitter.split(' ').map(n => n[0]).join('')}
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium truncate">{submitter}</span>
        </div>
        <div className={`flex items-center gap-1 text-[12px] font-bold ${isUrgent ? 'text-red-500' : 'text-slate-500'}`}>
          <Clock className="w-3.5 h-3.5" />
          {dueDate}
        </div>
      </div>
    </div>
  );
};
