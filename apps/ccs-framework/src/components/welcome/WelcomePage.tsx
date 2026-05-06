import React from 'react';
import { translations, Language } from '../../lib/translations';
import { Map, HardHat, FileText, Monitor, Folders } from 'lucide-react';
import { HeaderLogo } from '../ui/HeaderLogo';
import { getGlobalLinks } from '../../lib/menu_data';

interface WelcomePageProps {
  language: Language;
  onNavigateL1: (l1Id: string) => void;
  onNavigateL2: (l1Id: string, l2Id: string) => void;
  onNavigate: (path: string, state?: any) => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ language, onNavigateL1, onNavigateL2, onNavigate }) => {
  const t = translations[language];
  const globalLinks = getGlobalLinks(language);

  const activeCardClass = "relative z-10 bg-white dark:bg-slate-800 flex items-center justify-center p-4 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 transition-colors cursor-pointer rounded shadow-sm text-slate-700 dark:text-slate-200 text-sm md:text-base font-medium";
  const disabledCardClass = "bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center p-4 text-slate-400 dark:text-slate-500 cursor-not-allowed rounded shadow-sm border border-slate-100 dark:border-slate-800 text-sm md:text-base";

  const bgBar = <div className="hidden xl:block absolute left-[calc(100%-17px)] top-0 bottom-0 w-[2000px] ml-4 bg-slate-200/60 dark:bg-slate-800/40 -z-10 pointer-events-none" />;

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 animate-in fade-in duration-500 pb-20 md:pb-0 overflow-hidden relative">
      
      <div className="flex justify-center py-6">
        <HeaderLogo className="h-20 w-auto text-slate-900 dark:text-white" />
      </div>

      {/* Top Banner Section (New) */}
      <div className="bg-white dark:bg-slate-800 rounded shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-slate-200 dark:divide-slate-700 mb-4">
        {/* Left Links */}
        <div className="flex flex-col justify-center gap-3 p-4 xl:w-48 shrink-0">
          <button 
            onClick={() => onNavigate(globalLinks.myWorkspace.url, globalLinks.myWorkspace)} 
            className="flex items-center gap-3 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer text-sm font-medium"
          >
             <globalLinks.myWorkspace.icon className="w-4 h-4" /> {globalLinks.myWorkspace.title}
          </button>
          <button 
            onClick={() => onNavigate(globalLinks.myProjects.url, globalLinks.myProjects)} 
            className="flex items-center gap-3 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer text-sm font-medium"
          >
             <globalLinks.myProjects.icon className="w-4 h-4" /> {globalLinks.myProjects.title}
          </button>
        </div>
        
        {/* Middle Stats */}
        <div className="flex-1 flex justify-around items-center p-4">
           <div className="flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onNavigate(globalLinks.myTodos.url, globalLinks.myTodos)}>
             <span className="text-2xl text-red-500 mb-1">0</span>
             <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{globalLinks.myTodos.title}</span>
           </div>
           <div className="flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onNavigate(globalLinks.severelyOverdue.url, globalLinks.severelyOverdue)}>
             <span className="text-2xl text-red-500 mb-1">0</span>
             <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{globalLinks.severelyOverdue.title}</span>
           </div>
           <div className="flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onNavigate(globalLinks.overdue.url, globalLinks.overdue)}>
             <span className="text-2xl text-yellow-500 mb-1">0</span>
             <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{globalLinks.overdue.title}</span>
           </div>
        </div>

        {/* Right Announcements */}
        <div className="flex-1 p-4 flex flex-col xl:w-96 shrink-0">
           <div className="flex justify-between items-center mb-2">
             <h3 className="font-bold text-sm text-slate-800 dark:text-white">{t.announcements}</h3>
             <button onClick={() => onNavigate(globalLinks.notifications.url, globalLinks.notifications)} className="text-xs text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline">{t.more}</button>
           </div>
           <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-400">
              <li className="truncate hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors" onClick={() => onNavigate(globalLinks.notifications.url, globalLinks.notifications)}>04-07 【产品线管理】基建产品线管理总结</li>
              <li className="truncate hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors" onClick={() => onNavigate(globalLinks.notifications.url, globalLinks.notifications)}>04-07 优质优价，质造精品，构筑稳健的供应商生态体系</li>
              <li className="truncate hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors" onClick={() => onNavigate(globalLinks.notifications.url, globalLinks.notifications)}>04-07 基建项目管理运作总结</li>
           </ul>
        </div>
      </div>

      {/* Top Section */}
      <div className="flex flex-col xl:flex-row gap-4">
        {/* Left column (L1 items) */}
        <div className="flex flex-col gap-4 w-full xl:w-64 shrink-0">
          <div className={activeCardClass + " !justify-start gap-4"} onClick={() => onNavigateL1('L1-1')}>
            <div className="w-8 h-8 rounded shrink-0 bg-blue-100/80 text-blue-500 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <span>{t.welcomeInvestment}</span>
            {bgBar}
          </div>
          <div className={activeCardClass + " !justify-start gap-4"} onClick={() => onNavigateL1('L1-2')}>
            <div className="w-8 h-8 rounded shrink-0 bg-blue-100/80 text-blue-500 flex items-center justify-center">
              <Map className="w-5 h-5" />
            </div>
            <span>{t.welcomePlanning}</span>
            {bgBar}
          </div>
          <div className={activeCardClass + " !justify-start gap-4 h-full"} onClick={() => onNavigateL1('L1-3')}>
            <div className="w-8 h-8 rounded shrink-0 bg-blue-100/80 text-blue-500 flex items-center justify-center">
              <HardHat className="w-5 h-5" />
            </div>
            <span>{t.welcomeEngineering}</span>
            {bgBar}
          </div>
        </div>

        {/* Right column (L2 items inside L1-2) */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 xl:grid-cols-10 gap-4">
          {[
            { id: 'L2-6', label: t.welcomeArchitecture },
            { id: 'L2-7', label: t.welcomeCivil },
            { id: 'L2-8', label: t.welcomeCurtainWall },
            { id: 'L2-9', label: t.welcomeHVAC },
            { id: 'L2-10', label: t.welcomePower },
            { id: 'L2-11', label: t.welcomeWeakCurrent },
            { id: 'L2-12', label: t.welcomeFitOut },
            { id: 'L2-13', label: t.welcomeSoftFurnishing },
            { id: 'L2-14', label: t.welcomeLandscape },
            { id: 'L2-15', label: t.welcomeProcess },
          ].map(l2 => (
            <div 
              key={l2.id}
              className={`${activeCardClass} xl:min-h-[220px] tracking-widest`}
              onClick={() => onNavigateL2('L1-2', l2.id)}
            >
              <span className={language === 'zh' ? 'vertical-text-desktop' : 'xl:-rotate-90 xl:whitespace-nowrap'}>
                {l2.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Section - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-1">
        <div className={activeCardClass} onClick={() => onNavigateL1('L1-4')}>{t.welcomeProcurement}</div>
        <div className={activeCardClass} onClick={() => onNavigateL1('L1-5')}>{t.welcomeAcceptance}</div>
        <div className={activeCardClass} onClick={() => onNavigateL1('L1-6')}>{t.welcomeEHS}</div>
        <div className={activeCardClass} onClick={() => onNavigateL1('L1-7')}>{t.welcomeCost}</div>
        <div className={disabledCardClass}>{t.welcomePolicy}</div>
      </div>

      {/* Bottom Section - Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-1">
        <div className={disabledCardClass}>{t.welcomeHR}</div>
        <div className={disabledCardClass}>{t.welcomeAsset}</div>
        <div className={disabledCardClass}>{t.welcomeMeeting}</div>
        <div className={disabledCardClass}>{t.welcomeOperation}</div>
        <div className={disabledCardClass}>{t.welcomeOthers}</div>
      </div>

    </div>
  );
};
