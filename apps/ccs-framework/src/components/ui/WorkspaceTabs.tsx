import React, { useRef, useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface TabItemData {
  id: string;
  title: { zh: string; en: string };
  path: string;
  projectName?: string;
  menuId?: string;
  isSearch?: boolean;
  searchQuery?: string;
  submenuChildren?: any[];
}

interface WorkspaceTabsProps {
  tabs: TabItemData[];
  activeTabId: string;
  language: 'zh' | 'en';
  onTabSelect: (tab: TabItemData) => void;
  onTabClose: (e: React.MouseEvent, tabId: string) => void;
  isSidebarCollapsed?: boolean;
}

export const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({
  tabs,
  activeTabId,
  language,
  onTabSelect,
  onTabClose,
  isSidebarCollapsed
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  
  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftArrow(scrollLeft > 2);
      // Use a small buffer (2px) to handle sub-pixel rendering issues
      setShowRightArrow(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 2);
    }
  };

  useEffect(() => {
    // Initial check
    checkScroll();
    
    const node = scrollContainerRef.current;
    if (!node) return;

    // Monitor for tab list changes and layout changes
    const observer = new ResizeObserver(() => {
      checkScroll();
    });
    
    // Add a slight delay to allow the DOM to fully render the new tabs before checking
    const timer = setTimeout(checkScroll, 50);
    
    observer.observe(node);
    // Also observe the inner elements if possible, but observing the container is usually enough
    window.addEventListener('resize', checkScroll);
    
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', checkScroll);
    };
  }, [tabs]);

  useEffect(() => {
    checkScroll();
    // Re-check after transition duration
    const timer = setTimeout(checkScroll, 350);
    return () => clearTimeout(timer);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const activeTabElement = scrollContainerRef.current.querySelector('[aria-selected="true"]');
      if (activeTabElement) {
        activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      setTimeout(checkScroll, 300);
    }
  }, [activeTabId]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };

  return (
    <div className="relative flex items-center bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 h-11 px-0 shadow-sm w-full overflow-hidden group/tabs">
      {showLeftArrow && (
        <button 
          onClick={(e) => { e.preventDefault(); scroll('left'); }}
          className="absolute left-0 top-0 bottom-0 z-20 px-1 bg-gradient-to-r from-slate-100 via-slate-100/95 dark:from-slate-800 dark:via-slate-800/95 to-transparent flex items-center text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
        >
          <div className="bg-white dark:bg-slate-700 rounded-full shadow-sm p-[2px] border border-slate-200 dark:border-slate-600 flex items-center justify-center">
            <ChevronLeft className="w-3.5 h-3.5" />
          </div>
        </button>
      )}
      
      <div 
        ref={scrollContainerRef}
        onScroll={checkScroll}
        role="tablist" 
        aria-label="Workspace Tabs"
        className="flex-1 min-w-0 flex items-end gap-1 overflow-x-auto no-scrollbar scroll-smooth h-full px-2"
      >
        {tabs.map(tab => {
          const isActive = activeTabId === tab.id;
          const displayTitle = language === 'zh' ? tab.title.zh : tab.title.en;

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => onTabSelect(tab)}
              className={`group flex items-center h-9 px-4 rounded-t-lg text-xs font-semibold transition-all min-w-fit shadow-[0_-2px_0_transparent_inset] border border-b-0 cursor-pointer
                ${isActive 
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-blue-600 dark:text-[#60a5fa] shadow-[0_-2px_0_blue_inset] dark:shadow-[0_-2px_0_#60a5fa_inset] relative z-10' 
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                }`}
            >
              <span>{displayTitle}</span>
              <div 
                role="button"
                tabIndex={0}
                aria-label="Close tab"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onTabClose(e, tab.id); 
                }}
                className={`ml-2.5 p-1 rounded-full transition-colors flex items-center justify-center
                  ${isActive 
                    ? 'hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-600 dark:hover:text-blue-400' 
                    : 'opacity-0 group-hover:opacity-100 hover:bg-slate-300/50 dark:hover:bg-slate-600/50 hover:text-slate-700 dark:hover:text-slate-200'
                  }
                `}
              >
                <X className="w-3.5 h-3.5" />
              </div>
            </div>
          );
        })}
      </div>

      {showRightArrow && (
        <button 
          onClick={(e) => { e.preventDefault(); scroll('right'); }}
          className="absolute right-0 top-0 bottom-0 z-20 px-1 bg-gradient-to-l from-slate-100 via-slate-100/95 dark:from-slate-800 dark:via-slate-800/95 to-transparent flex items-center text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
        >
          <div className="bg-white dark:bg-slate-700 rounded-full shadow-sm p-[2px] border border-slate-200 dark:border-slate-600 flex items-center justify-center">
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </button>
      )}
    </div>
  );
};
