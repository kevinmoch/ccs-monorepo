import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, Bell, X } from 'lucide-react';
import { getGlobalLinks } from '../../lib/menu_data';
import { translations, Language } from '../../lib/translations';

interface MobileBottomNavProps {
  language: Language;
  currentPath: string;
  userInfo: any;
  onNavigate: (path: string, item?: any) => void;
  onSearch: (query: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ language, currentPath, userInfo, onNavigate, onSearch, isExpanded, onToggleExpand }) => {
  const t = translations[language];
  const globalLinks = getGlobalLinks(language);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  
  const bottomNavRef = useRef<HTMLElement>(null);
  const [showBottomLeft, setShowBottomLeft] = useState(false);
  const [showBottomRight, setShowBottomRight] = useState(false);
  const checkBottomScroll = () => {
    if (bottomNavRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = bottomNavRef.current;
      setShowBottomLeft(scrollLeft > 0);
      setShowBottomRight(Math.ceil(scrollLeft) < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    checkBottomScroll();
    const nodeBottom = bottomNavRef.current;
    
    // Create an observer to check scroll when the content size changes
    const observer = new ResizeObserver(() => {
      checkBottomScroll();
    });
    
    if (nodeBottom) {
      observer.observe(nodeBottom);
    }
    
    window.addEventListener('resize', checkBottomScroll);
    
    // Check scroll after animation might be done
    if (isExpanded) {
      const timer = setTimeout(checkBottomScroll, 400);
      return () => {
        clearTimeout(timer);
        observer.disconnect();
        window.removeEventListener('resize', checkBottomScroll);
      };
    }

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkBottomScroll);
    };
  }, [isExpanded]);

  const scrollBottom = (direction: 'left' | 'right') => {
    if (bottomNavRef.current) {
      const scrollAmount = 250;
      bottomNavRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      // Check again after smooth scroll
      setTimeout(checkBottomScroll, 350);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      onSearch(searchInput.trim());
      setSearchInput('');
      setIsSearchOpen(false);
    }
  };

  const links = [
    globalLinks.myWorkspace,
    globalLinks.myTodos,
    globalLinks.severelyOverdue,
    globalLinks.overdue,
  ];

  return (
    <div className="md:hidden fixed bottom-0 w-full shadow-[0_-4px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_10px_rgba(0,0,0,0.2)] border-t border-slate-200 dark:border-slate-700 z-40 bg-white dark:bg-slate-800">
      {/* Search Box */}
      <div className={`absolute bottom-full left-0 right-0 p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-700 transition-all duration-300 z-[60] shadow-[0_-5px_15px_rgba(0,0,0,0.05)] ${isSearchOpen && isExpanded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-full px-4 h-10 border border-slate-200 dark:border-slate-700 shrink-0">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            className="flex-1 bg-transparent border-none focus:outline-none dark:text-white text-sm h-full"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus={isSearchOpen}
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} className="p-1 text-slate-400 hover:text-slate-600 shrink-0">
               <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setIsSearchOpen(false)} className="text-blue-600 font-medium text-xs ml-1 shrink-0 whitespace-nowrap">
             {language === 'zh' ? '取消' : 'Cancel'}
          </button>
        </div>
      </div>

      <button 
        onClick={onToggleExpand}
        className="w-full flex items-center justify-center py-1.5 text-slate-400 hover:text-blue-600 transition-colors"
      >
        <div className="flex items-center justify-center">
          {isExpanded ? <ChevronDown className="w-5 h-5 opacity-60" /> : <ChevronUp className="w-5 h-5 opacity-60" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="relative">
              <div className="relative flex items-center w-full h-14 pb-1">
                {showBottomLeft && (
                  <button 
                    onClick={() => scrollBottom('left')}
                    className="absolute left-0 top-0 bottom-0 z-20 w-10 bg-gradient-to-r from-white dark:from-slate-800 via-white/90 dark:via-slate-800/90 to-transparent flex text-slate-400 hover:text-blue-600 cursor-pointer items-center justify-start pl-1"
                  >
                    <div className="bg-white dark:bg-slate-700 rounded-full shadow-sm p-[2px] border border-slate-200 dark:border-slate-600 flex items-center justify-center">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </div>
                  </button>
                )}

                <nav 
                  ref={bottomNavRef}
                  onScroll={checkBottomScroll}
                  className="flex-1 flex h-full items-center px-4 pb-safe transition-colors duration-200 overflow-x-auto touch-pan-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth gap-2 md:gap-4 no-scrollbar"
                >
                  {links.map(link => (
                    <button key={link.id} onClick={() => onNavigate(link.url, link)} className="flex flex-col items-center justify-center gap-1 shrink-0 w-16 text-slate-500 hover:text-blue-600 dark:hover:text-[#60a5fa] transition-colors cursor-pointer">
                      <link.icon className="w-5 h-5"/> <span className="text-[10px] whitespace-nowrap">{link.title}</span>
                    </button>
                  ))}

                  <button 
                    className={`flex flex-col items-center justify-center gap-1 shrink-0 w-12 transition-colors cursor-pointer ${isSearchOpen ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`} 
                    onClick={() => setIsSearchOpen(!isSearchOpen)}
                  >
                    <globalLinks.search.icon className="w-5 h-5"/> 
                    <span className="text-[10px] whitespace-nowrap">{globalLinks.search.title}</span>
                  </button>

                  <button onClick={() => onNavigate(globalLinks.notifications.url, globalLinks.notifications)} className={`flex flex-col items-center justify-center gap-1 shrink-0 w-12 transition-colors relative cursor-pointer ${currentPath === globalLinks.notifications.url ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>
                    <globalLinks.notifications.icon className="w-5 h-5"/> <span className="text-[10px] whitespace-nowrap">{globalLinks.notifications.title}</span>
                    {userInfo?.notifications.some((n: any) => !n.isRead) && (
                      <span className="absolute top-0 right-1.5 w-2 h-2 bg-red-500 border border-white dark:border-slate-800 rounded-full"></span>
                    )}
                  </button>
                  <button onClick={() => onNavigate(globalLinks.settings.url, globalLinks.settings)} className={`flex flex-col items-center justify-center gap-1 shrink-0 w-12 transition-colors cursor-pointer ${currentPath === globalLinks.settings.url ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>
                    <globalLinks.settings.icon className="w-5 h-5"/> <span className="text-[10px] whitespace-nowrap">{globalLinks.settings.title}</span>
                  </button>
                </nav>

                {showBottomRight && (
                  <button 
                    onClick={() => scrollBottom('right')}
                    className="absolute right-0 top-0 bottom-0 z-20 w-10 bg-gradient-to-l from-white dark:from-slate-800 via-white/90 dark:via-slate-800/90 to-transparent flex text-slate-400 hover:text-blue-600 cursor-pointer items-center justify-end pr-1"
                  >
                    <div className="bg-white dark:bg-slate-700 rounded-full shadow-sm p-[2px] border border-slate-200 dark:border-slate-600 flex items-center justify-center">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
