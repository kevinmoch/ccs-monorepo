import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Language } from '../../lib/translations';

interface HeaderCardProps {
  title: string;
  description: string;
  breadcrumb: string[];
  activeProjectName?: string;
  lang?: Language;
}

export const HeaderCard: React.FC<HeaderCardProps> = ({ title, description, breadcrumb, activeProjectName }) => {
  return (
    <div className="h-full w-full bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center transition-all hover:shadow-md">
      {activeProjectName && (
        <div className="mb-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold ring-1 ring-inset ring-blue-700/10 dark:ring-blue-400/20 shadow-sm uppercase tracking-wide">
            {activeProjectName}
          </span>
        </div>
      )}
      <nav className="flex items-center text-slate-400 dark:text-slate-500 text-[10px] mb-2 font-bold uppercase tracking-widest">
        {breadcrumb.map((item, index) => (
          <React.Fragment key={item}>
            <span>{item}</span>
            {index < breadcrumb.length - 1 && <ChevronRight className="w-3 h-3 mx-1 opacity-50" />}
          </React.Fragment>
        ))}
      </nav>
      <h1 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">
        {title}
      </h1>
      <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 line-clamp-2 font-medium">
        {description}
      </p>
    </div>
  );
};
