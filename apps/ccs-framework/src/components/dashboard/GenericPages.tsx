import React from 'react';
import { translations, Language } from '../../lib/translations';
import { HeaderCard } from './HeaderCard';

interface PageProps {
  lang: Language;
}

export const MyWorkspacePage: React.FC<PageProps> = ({ lang }) => {
  const t = translations[lang];
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard title={t.myWorkspace} description={t.myWorkspace} breadcrumb={[t.myWorkspace]} lang={lang} />
      </div>
      <div className="col-span-12">
         <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 min-h-[400px] flex items-center justify-center text-slate-400">
           {t.myWorkspace} Content
         </div>
      </div>
    </div>
  );
};

export const MyProjectsPage: React.FC<PageProps> = ({ lang }) => {
  const t = translations[lang];
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard title={t.myProjects} description={t.myProjects} breadcrumb={[t.myProjects]} lang={lang} />
      </div>
      <div className="col-span-12">
         <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 min-h-[400px] flex items-center justify-center text-slate-400">
           {t.myProjects} Content
         </div>
      </div>
    </div>
  );
};

export const MyTodosPage: React.FC<PageProps> = ({ lang }) => {
  const t = translations[lang];
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard title={t.myTodos} description={t.myTodos} breadcrumb={[t.myTodos]} lang={lang} />
      </div>
      <div className="col-span-12">
         <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 min-h-[400px] flex items-center justify-center text-slate-400">
           {t.myTodos} Content
         </div>
      </div>
    </div>
  );
};

export const SeverelyOverduePage: React.FC<PageProps> = ({ lang }) => {
  const t = translations[lang];
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard title={t.severelyOverdue} description={t.severelyOverdue} breadcrumb={[t.severelyOverdue]} lang={lang} />
      </div>
      <div className="col-span-12">
         <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 min-h-[400px] flex items-center justify-center text-slate-400">
           {t.severelyOverdue} Content
         </div>
      </div>
    </div>
  );
};

export const OverduePage: React.FC<PageProps> = ({ lang }) => {
  const t = translations[lang];
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard title={t.overdue} description={t.overdue} breadcrumb={[t.overdue]} lang={lang} />
      </div>
      <div className="col-span-12">
         <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 min-h-[400px] flex items-center justify-center text-slate-400">
           {t.overdue} Content
         </div>
      </div>
    </div>
  );
};
