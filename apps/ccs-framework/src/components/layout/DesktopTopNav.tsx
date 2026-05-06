import React, { useState } from 'react';
import { Menu, ChevronDown, Eye, Search, Bell, X, Moon, Sun, Monitor, CheckSquare, AlertOctagon, AlertTriangle } from 'lucide-react';
import { getGlobalLinks } from '../../lib/menu_data';
import { Language, translations } from '../../lib/translations';
import { ProjectInfo, UserInfo } from '../../constants';

interface DesktopTopNavProps {
  language: Language;
  currentPath: string;
  projectInfo: ProjectInfo | null;
  userInfo: UserInfo | null;
  selectedHeaderProject: ProjectInfo | null;
  onSelectProjectClick: () => void;
  onViewProject: (project: ProjectInfo) => void;
  onNavigate: (path: string, item?: any) => void;
  onSearch: (query: string) => void;
  renderLanguageDropdown: () => React.ReactNode;
  isQuickLinksMenuOpen: boolean;
  setIsQuickLinksMenuOpen: (open: boolean) => void;
}

export const DesktopTopNav: React.FC<DesktopTopNavProps> = ({
  language,
  currentPath,
  projectInfo,
  userInfo,
  selectedHeaderProject,
  onSelectProjectClick,
  onViewProject,
  onNavigate,
  onSearch,
  renderLanguageDropdown,
  isQuickLinksMenuOpen,
  setIsQuickLinksMenuOpen
}) => {
  const t = translations[language];
  const globalLinks = getGlobalLinks(language);
  const [isDesktopSearchExpanded, setIsDesktopSearchExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const quickLinks = [
    globalLinks.myWorkspace,
    globalLinks.myTodos,
    globalLinks.severelyOverdue,
    globalLinks.overdue,
  ];

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      onSearch(searchInput.trim());
      setSearchInput('');
      setIsDesktopSearchExpanded(false);
    }
  };

  const executeSearch = () => {
    if (isDesktopSearchExpanded) {
      if (searchInput.trim()) {
        onSearch(searchInput.trim());
        setSearchInput('');
        setIsDesktopSearchExpanded(false);
      }
    } else {
      setIsDesktopSearchExpanded(true);
    }
  };

  return (
    <header className="hidden md:flex justify-between items-center px-4 md:px-8 h-16 w-full bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 shadow-sm transition-colors duration-200 gap-2">
      <div className="flex items-center text-sm font-medium pr-4 mr-2 dark:border-slate-700 shrink-0 h-full gap-2">
        <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">{t.myProjects}</span>
        <div 
          onClick={onSelectProjectClick}
          className="flex items-center justify-between w-48 lg:w-80 xl:w-[480px] px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg cursor-pointer hover:border-slate-300 dark:hover:border-slate-500 transition-colors"
        >
          <span className={`truncate text-xs ${selectedHeaderProject ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
            {selectedHeaderProject ? selectedHeaderProject.name : t.selectProject}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </div>
        <button
          disabled={!selectedHeaderProject}
          onClick={() => selectedHeaderProject && onViewProject(selectedHeaderProject)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex items-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" />
          {t.viewProject}
        </button>
      </div>

      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 ml-4 shrink-0 relative">
        <div className="relative flex items-center h-9 w-9">
          <div 
            className={`absolute right-0 flex items-center h-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-full text-sm transition-all duration-300 shadow-md overflow-hidden z-20 ${isDesktopSearchExpanded ? 'w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}
          >
            <input 
              type="text" 
              placeholder={t.searchPlaceholder} 
              className="w-full h-full pl-4 pr-9 bg-transparent focus:outline-none dark:text-white" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <button 
              onClick={() => setIsDesktopSearchExpanded(false)} 
              className="absolute right-2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 focus:outline-none transition-colors rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <button 
            onClick={executeSearch} 
            className={`absolute right-0 w-9 h-9 flex items-center justify-center rounded-full hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none transition-colors ${isDesktopSearchExpanded ? 'bg-transparent absolute right-2 z-10 w-8 h-8 opacity-0 pointer-events-none' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center dark:border-slate-700 relative quick-links-container">
          <button 
            onClick={() => setIsQuickLinksMenuOpen(!isQuickLinksMenuOpen)}
            className={`flex items-center justify-center p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${isQuickLinksMenuOpen ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            title={t.quickMenu || 'Menu'}
          >
            <Menu className="w-5 h-5" />
          </button>
          
          {isQuickLinksMenuOpen && (
            <div className="absolute right-0 top-full mt-3 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded z-50 overflow-visible animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute -top-2 right-2 w-4 h-4 bg-white dark:bg-slate-800 border-t border-l border-slate-200 dark:border-slate-700 rotate-45"></div>
              <div className="relative bg-white dark:bg-slate-800 rounded flex flex-col py-1">
                {quickLinks.map(link => (
                  <button key={link.id} onClick={() => { setIsQuickLinksMenuOpen(false); onNavigate(link.url, link); }} className="w-full text-left px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 cursor-pointer transition-colors group">
                    <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 transition-colors">
                      <link.icon className="w-4 h-4"/>
                    </div>
                    <span className="text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">{link.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="w-9 h-9 flex items-center justify-center">
          {renderLanguageDropdown()}
        </div>
        <button 
          onClick={() => onNavigate(globalLinks.notifications.url, globalLinks.notifications)}
          className={`w-9 h-9 flex items-center justify-center rounded-lg hover:text-blue-600 dark:hover:text-[#60a5fa] transition-colors relative cursor-pointer ${currentPath === globalLinks.notifications.url ? 'text-blue-600 dark:text-[#60a5fa] bg-blue-600/10' : ''}`}
        >
          <globalLinks.notifications.icon className="w-5 h-5" />
          {userInfo?.notifications.some(n => !n.isRead) && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border border-white dark:border-slate-800 rounded-full"></span>
          )}
        </button>
        <button 
          onClick={() => onNavigate(globalLinks.settings.url, globalLinks.settings)}
          className={`w-9 h-9 flex items-center justify-center rounded-lg hover:text-blue-600 dark:hover:text-[#60a5fa] transition-colors cursor-pointer ${currentPath === globalLinks.settings.url ? 'text-blue-600 dark:text-[#60a5fa] bg-blue-600/10' : ''}`}
        >
          <globalLinks.settings.icon className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
