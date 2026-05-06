import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { translations, Language } from '../../lib/translations';
import { HeaderCard } from './HeaderCard';

interface SettingsPageProps {
  lang: Language;
  isDark?: boolean;
  toggleTheme?: () => void;
  setLanguage?: (lang: Language) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ lang, isDark, toggleTheme, setLanguage }) => {
  const t = translations[lang];

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard 
          title={t.settings} 
          description={t.projectSettings} 
          breadcrumb={[t.settings, t.appearance]} 
          lang={lang}
        />
      </div>
      <div className="col-span-12 md:col-span-6 h-48">
        <div className="h-full w-full bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">{t.appearance}</h3>
            <p className="text-xs text-slate-500 mt-1">{t.appearance} settings</p>
          </div>
          <button onClick={toggleTheme} className="w-full py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors rounded-lg text-sm font-medium flex items-center justify-center gap-2 cursor-pointer">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? 'Light' : 'Dark'} Mode
          </button>
        </div>
      </div>
      <div className="col-span-12 md:col-span-6 h-48">
        <div className="h-full w-full bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">{t.language}</h3>
            <p className="text-xs text-slate-500 mt-1">{t.language} settings</p>
          </div>
          <div className="flex gap-2">
            {[{id: 'zh', label: '中文'}, {id: 'en', label: 'English'}].map(l => (
              <button 
                key={l.id}
                onClick={() => setLanguage && setLanguage(l.id as Language)} 
                className={`flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${lang === l.id ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
