import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  ChevronUp,
  Settings,
  HelpCircle,
  Filter,
  CheckCircle2,
  PencilRuler,
  HardHat,
  LineChart,
  FileText,
  Clock,
  User,
  Zap,
  AlertTriangle,
  Plus,
  Layers,
  Shield,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Send,
  CheckSquare,
  Sun,
  Moon,
  Calendar,
  Box,
  ClipboardList,
  LogOut,
  Globe,
  Briefcase,
  X,
  Folder,
  Users,
  Headset,
  Monitor,
  Eye,
  AlertOctagon
} from 'lucide-react';

import { motion, AnimatePresence } from 'motion/react';
import { MicroApp, registerMicroApps, syncLanguageToMicroApps, syncThemeToMicroApps } from '@ccs/runtime/react';

import { getDashboardRegistry } from './components/dashboard/config';
import { HeaderCard } from './components/dashboard/HeaderCard';
import { DrawingCard } from './components/dashboard/DrawingCard';
import { StatsCard } from './components/dashboard/StatsCard';
import { ActionCard } from './components/dashboard/ActionCard';
import { WorkspaceTabs, TabItemData } from './components/ui/WorkspaceTabs';
import { WelcomePage } from './components/welcome/WelcomePage';
import { SearchResults } from './components/dashboard/SearchResults'; // Added SearchResults
import { translations, Language } from './lib/translations';
import { GET_MENU_DATA, getGlobalLinks, projectUrl } from './lib/menu_data';
import { ProjectInfo, fetchUserInfo, UserInfo, Notification, MOCK_PROJECTS } from './constants';
import { DesktopTopNav } from './components/layout/DesktopTopNav';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { ProjectSelectionModal } from './components/dashboard/ProjectSelectionModal';

import { SubmenuPage } from './components/dashboard/SubmenuPage';
import { HeaderLogo } from './components/ui/HeaderLogo';
import { SettingsPage } from './components/dashboard/SettingsPage';
import { NotificationsPage } from './components/dashboard/NotificationsPage';
import { ITSupportPage } from './components/dashboard/ITSupportPage';
import { HelpGuidePage } from './components/dashboard/HelpGuidePage';
import { MyWorkspacePage, MyProjectsPage, MyTodosPage, SeverelyOverduePage, OverduePage } from './components/dashboard/GenericPages';
import { moduleManifests } from './modules/registry';

const DefaultAvatar = ({ className = "w-full h-full text-slate-400" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <circle cx="12" cy="12" r="11" />
    <path d="M4.5 20c0-3.5 3-6.5 7.5-6.5s7.5 3 7.5 6.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8" r="3.5" fill="currentColor" stroke="none" />
  </svg>
);

const CardComponents: Record<string, React.FC<any>> = {
  HeaderCard,
  DrawingCard,
  StatsCard,
  ActionCard,
  SettingsPage,
  NotificationsPage,
  ITSupportPage,
  HelpGuidePage,
  MyWorkspacePage,
  MyProjectsPage,
  MyTodosPage,
  SeverelyOverduePage,
  OverduePage
};

const MICRO_APP_PATH = '#micro:ccs-module-demo';
const toRuntimeLanguage = (lang: Language) => (lang === 'zh' ? 'zh-CN' : 'en-US');

const MenuItem = ({ item, depth = 1, currentPath, activeMenuId, hideChevron = false, onNavigate, expandedMenus, onToggleExpand, showDivider = false }: { item: any, depth?: number, currentPath: string, activeMenuId?: string, key?: any, hideChevron?: boolean, onNavigate: (path: string, item?: any) => void, expandedMenus: Record<string, boolean>, onToggleExpand: (id: string) => void, showDivider?: boolean }) => {
  const hasChildren = item.children && item.children.length > 0;
  const isLeaf = !hasChildren || !!item.url;
  const isActive = activeMenuId ? activeMenuId === item.id : currentPath === item.url;
  const Icon = item.icon;
  const isExpanded = !!expandedMenus[item.id];

  const paddingLeftStyle = { paddingLeft: `${(depth - 1) * 1.15 + 0.75}rem` };

  const renderContent = () => {
    if (isLeaf) {
      return (
        <a
          href={item.disabled ? undefined : (item.url || '#')}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!item.disabled) onNavigate(item.url || '', item);
          }}
          style={paddingLeftStyle}
          className={`flex items-center py-2.5 pr-3 mt-0.5 rounded-lg transition-all text-sm font-medium ${
            item.disabled
              ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50 select-none'
              : isActive
                ? 'bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 cursor-pointer' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer'
          }`}
        >
           {Icon ? <Icon className={`w-4 h-4 mr-3 ${item.disabled ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'}`} /> : <div className={`w-4 h-4 mr-3 border-l-2 border-b-2 border-slate-300 dark:border-slate-600 rounded-bl-sm opacity-50 relative -top-1`} />}
           <span className="flex-1 truncate">{item.title}</span>
           {item.badge && (
             <span className={`text-[10px] px-2 py-0.5 rounded font-bold shadow-sm ${item.disabled ? 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300' : 'bg-blue-500 text-white'}`}>
               {item.badge}
             </span>
           )}
        </a>
      );
    }

    return (
      <div className="flex flex-col mb-1">
        <div
          style={paddingLeftStyle}
          onClick={(e) => {
            e.stopPropagation();
            if (item.disabled) return;
            onToggleExpand(item.id);
          }}
          className={`flex items-center py-2.5 pr-3 rounded-lg transition-all font-medium ${
            item.disabled
              ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50 select-none'
              : `cursor-pointer ${depth === 1 
                ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 text-sm'}`
          }`}
        >
          {Icon && <Icon className={`mr-2.5 ${depth === 1 ? 'w-5 h-5' : 'w-4 h-4'} ${item.disabled ? 'text-slate-400 dark:text-slate-500' : (depth === 1 ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500')}`} />}
          <span className={`flex-1 truncate ${depth === 1 ? 'text-[15px]' : ''}`}>{item.title}</span>
          {!hideChevron && (
            isExpanded ? (
              <ChevronUp className={`w-4 h-4 transition-transform ${item.disabled ? 'text-slate-600 dark:text-slate-500' : 'text-slate-500'}`} />
            ) : (
              <ChevronDown className={`w-4 h-4 transition-transform ${item.disabled ? 'text-slate-600 dark:text-slate-500' : 'text-slate-500'}`} />
            )
          )}
        </div>
        
        <div 
          className={`flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded ? 'max-h-[5000px] opacity-100 mt-1' : 'max-h-0 opacity-0'
          }`}
        >
          {item.children?.map((child: any) => (
            <MenuItem 
              key={child.id} 
              item={child} 
              depth={depth + 1} 
              currentPath={currentPath}
              activeMenuId={activeMenuId}
              onNavigate={onNavigate}
              expandedMenus={expandedMenus}
              onToggleExpand={onToggleExpand}
              showDivider={item.seperateLine?.includes(child.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {showDivider && (
        <div className="my-2 border-t border-slate-200 dark:border-slate-800 mx-3" />
      )}
      {renderContent()}
    </>
  );
};

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [language, setLanguage] = useState<Language>('zh');
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isProjectSelectionModalOpen, setIsProjectSelectionModalOpen] = useState(false);
  const [selectedHeaderProject, setSelectedHeaderProject] = useState<ProjectInfo | null>(null);
  const [isQuickLinksMenuOpen, setIsQuickLinksMenuOpen] = useState(false);
  const [projectPage, setProjectPage] = useState(0);
  const [isInsideApp, setIsInsideApp] = useState(false);
  const [isBottomNavExpanded, setIsBottomNavExpanded] = useState(false);
  const [sidebarHeaderId, setSidebarHeaderId] = useState<string | null>(null);
  const [isShowingL1List, setIsShowingL1List] = useState(false);

  // Menu Expansion State
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const toggleMenuExpand = (id: string) => {
    setExpandedMenus(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Tabs System
  const [tabs, setTabs] = useState<TabItemData[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const activeMenuId = tabs.find(t => t.id === activeTabId)?.menuId;
  const iframeRefs = useRef<{ [key: string]: HTMLIFrameElement | null }>({});

  useEffect(() => {
    Object.values(iframeRefs.current).forEach((iframe: HTMLIFrameElement | null) => {
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'SYNC_STATE', payload: { isDark, language } },
          '*'
        );
      }
    });
    syncThemeToMicroApps(isDark ? 'dark' : 'light');
    syncLanguageToMicroApps(toRuntimeLanguage(language));
  }, [isDark, language]);

  useEffect(() => {
    registerMicroApps(moduleManifests, () => ({
      theme: isDark ? 'dark' : 'light',
      language: toRuntimeLanguage(language),
      user: {
        id: userInfo?.id ?? 'guest',
        name: userInfo?.name[language] ?? 'Guest',
        roles: ['admin'],
        permissions: ['module:demo:view']
      }
    }));
  }, []);

  useEffect(() => {
    fetchUserInfo().then((info) => {
      setUserInfo(info);
      // Project will not be selected by default, user must explicitly pick one.
    });
  }, []);

  const menuData = GET_MENU_DATA(language);
  const t = translations[language];
  const globalLinks = getGlobalLinks(language);

  const [activeL1Id, setActiveL1Id] = useState(menuData.length > 1 ? menuData[1].id : menuData[0].id);
  const [currentPath, setCurrentPath] = useState('#welcome');

  const findTitle = (data: any[], id: string): string | null => {
    for (const i of data) {
      if (i.id === id) return i.title;
      if (i.children) {
        const found = findTitle(i.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const addTab = (item: any) => {
    const currentProject = projectInfo?.id;
    
    // Find the full item if it's a menu item to ensure children/submenu exists (Fix for search results)
    let fullItem = item;
    if (item.id && (!item.children || item.children.length === 0)) {
      const findFullNode = (nodes: any[], id: string): any => {
        for (const node of nodes) {
          if (node.id === id) return node;
          if (node.children) {
            const found = findFullNode(node.children, id);
            if (found) return found;
          }
        }
        return null;
      };
      const found = findFullNode(menuData, item.id);
      if (found) fullItem = found;
    }

    const existingTab = tabs.find(tab => 
      (tab.menuId && tab.menuId === fullItem.id && tab.projectName === currentProject) || 
      (!tab.menuId && tab.path === fullItem.url && tab.projectName === currentProject)
    );
    
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setCurrentPath(existingTab.path);
    } else {
      let zhTitle = fullItem.title;
      let enTitle = fullItem.title;
      let foundInMenu = false;
      
      if (fullItem.id) {
         const menuZhTitle = findTitle(GET_MENU_DATA('zh'), fullItem.id);
         const menuEnTitle = findTitle(GET_MENU_DATA('en'), fullItem.id);
         if (menuZhTitle && menuEnTitle) {
            zhTitle = menuZhTitle;
            enTitle = menuEnTitle;
            foundInMenu = true;
         }
      }
      
      if (!foundInMenu) {
         const zhLinks = getGlobalLinks('zh');
         const enLinks = getGlobalLinks('en');
         const objZh = Object.values(zhLinks).find(l => l.id === fullItem.id || l.url === fullItem.url);
         const objEn = Object.values(enLinks).find(l => l.id === fullItem.id || l.url === fullItem.url);
         if (objZh && objEn) {
            zhTitle = objZh.title;
            enTitle = objEn.title;
         }
      }

      const newId = `tab-${Date.now()}`;
      setTabs([...tabs, { 
        id: newId, 
        title: { zh: zhTitle, en: enTitle },
        path: fullItem.url,
        projectName: currentProject,
        menuId: fullItem.id,
        submenuChildren: fullItem.children
      }]);
      setActiveTabId(newId);
      setCurrentPath(fullItem.url);
    }
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newTabs = tabs.filter(tab => tab.id !== id);
    setTabs(newTabs);
    if (activeTabId === id && newTabs.length > 0) {
      const lastTab = newTabs[newTabs.length - 1];
      setActiveTabId(lastTab.id);
      setCurrentPath(lastTab.path);
      if (lastTab.projectName) {
        switchProject(lastTab.projectName);
      }
    } else if (newTabs.length === 0) {
      setActiveTabId('');
      setCurrentPath('#welcome');
    }
  };

  const switchProject = (id: string) => {
    setIsProjectDropdownOpen(false);
    
    // Explicit requested: no auto-generation of tabs on project switch.
    // Just map to the local globally-selected project environment.
    if (userInfo && userInfo.projects) {
      const p = userInfo.projects.find(proj => proj.id === id);
      if (p) setProjectInfo(p);
    }
  };

  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);

  const handleNavigateL1 = (l1Id: string) => {
    setIsInsideApp(true);
    setActiveL1Id(l1Id);
    setSidebarHeaderId(l1Id);
    setIsShowingL1List(false);
    if (window.innerWidth < 768) {
      setIsMobileMenuOpen(true);
    }
  };

  const handleNavigateL2 = (l1Id: string, l2Id: string) => {
    setIsInsideApp(true);
    setActiveL1Id(l1Id);
    setSidebarHeaderId(l2Id);
    setIsShowingL1List(false);
    setExpandedMenus(prev => ({ ...prev, [l2Id]: true }));
    if (window.innerWidth < 768) {
      setIsMobileMenuOpen(true);
    }
  };

  const syncSidebarToMenuId = (menuId: string) => {
    const findHierarchy = (nodes: any[], targetId: string, currentPath: any[] = []): any[] | null => {
      for (const node of nodes) {
        if (node.id === targetId) return [...currentPath, node];
        if (node.children) {
          const res = findHierarchy(node.children, targetId, [...currentPath, node]);
          if (res) return res;
        }
      }
      return null;
    };

    const hierarchy = findHierarchy(menuData, menuId);
    if (hierarchy && hierarchy.length > 0) {
      const l1 = hierarchy[0];
      setActiveL1Id(l1.id);
      setIsShowingL1List(false);
      
      const newExpanded = { ...expandedMenus };
      // Expand all parents in the hierarchy
      hierarchy.forEach(node => {
        if (node.children) {
          newExpanded[node.id] = true;
        }
      });
      
      // Only use L2 as header if it belongs to the professional subsets (index >= 6)
      let bestHeaderId = l1.id;
      const l2Node = hierarchy.find(node => node.id.startsWith('L2'));
      if (l2Node) {
        const l2Index = parseInt(l2Node.id.substring(3));
        if (l2Index >= 6) {
          bestHeaderId = l2Node.id;
        }
      }
      
      setSidebarHeaderId(bestHeaderId);
      setExpandedMenus(newExpanded);
    }
  };

  const handleNavigate = (path: string, item?: any) => {
    setIsInsideApp(true);
    const isGlobalLink = Object.values(globalLinks).some(link => link.url === path || (item && link.url === item.url));
    if (isGlobalLink) {
      setIsShowingL1List(true);
    }
    
    if (item && item.id) {
      syncSidebarToMenuId(item.id);
    }

    if (item && item.url) {
      addTab(item);
    } else if (path) {
      setCurrentPath(path);
    }
  };

  // Global listeners for ESC key and click-outside for standard popups
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLangOpen(false);
        setIsProjectDropdownOpen(false);
        setIsQuickLinksMenuOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Element;
      if (!target.closest('.lang-container')) {
        setIsLangOpen(false);
      }
      if (!target.closest('.project-container')) {
        setIsProjectDropdownOpen(false);
      }
      if (!target.closest('.quick-links-container')) {
        setIsQuickLinksMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const bottomNavRef = useRef<HTMLElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    if (bottomNavRef.current) {
      startXRef.current = e.pageX - bottomNavRef.current.offsetLeft;
      scrollLeftRef.current = bottomNavRef.current.scrollLeft;
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !bottomNavRef.current) return;
    
    const x = e.pageX - bottomNavRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 2;
    
    if (Math.abs(walk) > 5) {
      hasDraggedRef.current = true;
    }
    
    e.preventDefault();
    bottomNavRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleSearch = (query: string) => {
    if (query) {
      // Add a Search Tab
      const searchItem = {
        id: `search-${Date.now()}`,
        url: `#search?q=${encodeURIComponent(query)}`,
        title: `${translations[language].searchResultsFor} "${query}"`,
        isSearch: true,
        query: query
      };
      
      const zhTitle = `${translations.zh.searchResultsFor} "${query}"`;
      const enTitle = `${translations.en.searchResultsFor} "${query}"`;

      const newId = `tab-${Date.now()}`;
      setTabs([...tabs, { 
        id: newId, 
        title: { zh: zhTitle, en: enTitle },
        path: searchItem.url,
        projectName: projectInfo?.id,
        isSearch: true,
        searchQuery: query
      }]);
      setActiveTabId(newId);
      setCurrentPath(searchItem.url);
    }
  };

  const l1NavRef = useRef<HTMLElement>(null);
  const [showL1Left, setShowL1Left] = useState(false);
  const [showL1Right, setShowL1Right] = useState(false);

  const [showBottomLeft, setShowBottomLeft] = useState(false);
  const [showBottomRight, setShowBottomRight] = useState(false);

  const checkL1Scroll = () => {
    if (l1NavRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = l1NavRef.current;
      setShowL1Left(scrollLeft > 0);
      setShowL1Right(Math.ceil(scrollLeft) < scrollWidth - clientWidth - 1);
    }
  };

  const checkBottomScroll = () => {
    if (bottomNavRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = bottomNavRef.current;
      setShowBottomLeft(scrollLeft > 0);
      setShowBottomRight(Math.ceil(scrollLeft) < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    checkL1Scroll();
    checkBottomScroll();
    const nodeL1 = l1NavRef.current;
    const nodeBottom = bottomNavRef.current;

    const observer = new ResizeObserver(() => {
      checkL1Scroll();
      checkBottomScroll();
    });

    if (nodeL1) observer.observe(nodeL1);
    if (nodeBottom) observer.observe(nodeBottom);

    window.addEventListener('resize', checkL1Scroll);
    window.addEventListener('resize', checkBottomScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkL1Scroll);
      window.removeEventListener('resize', checkBottomScroll);
    };
  }, [menuData]);

  const scrollL1 = (direction: 'left' | 'right') => {
    if (l1NavRef.current) {
      const scrollAmount = 250;
      l1NavRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkL1Scroll, 300);
    }
  };

  const scrollBottom = (direction: 'left' | 'right') => {
    if (bottomNavRef.current) {
      const scrollAmount = 250;
      bottomNavRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkBottomScroll, 300);
    }
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const renderProjectDropdown = () => (
    <div className="relative project-container w-full">
      <div 
        onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
        className="bg-slate-800/50 rounded-lg py-3 px-3 flex items-center gap-3 cursor-pointer border border-slate-700/50 hover:bg-slate-800 transition-colors"
      >
        <div className="flex-1 overflow-hidden min-w-0">
          <h2 className="text-white font-medium text-sm truncate" title={projectInfo ? projectInfo.name : ''}>{projectInfo ? projectInfo.name : t.myProjects}</h2>
        </div>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
      </div>

      {isProjectDropdownOpen && (
        <div className="absolute left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col max-h-[60vh] overflow-hidden">
          {userInfo?.projects && userInfo.projects.length > 0 ? (
            <>
              <div className="flex-1 overflow-y-auto py-1">
                {userInfo.projects.slice(projectPage * 10, (projectPage + 1) * 10).map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      switchProject(p.id);
                      setIsProjectDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors cursor-pointer text-sm break-words ${projectInfo?.id === p.id ? 'text-blue-400 bg-blue-400/5 font-bold' : 'text-slate-300'}`}
                  >
                    <div className="line-clamp-2 leading-snug">{p.name}</div>
                  </button>
                ))}
              </div>
              {userInfo.projects.length > 10 && (
                <div className="px-3 py-2 border-t border-slate-700/50 flex justify-between items-center text-slate-400 bg-slate-800 shrink-0 shadow-inner">
                  <button 
                    disabled={projectPage === 0} 
                    onClick={() => setProjectPage(0)} 
                    className="p-1 hover:text-white hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-all"
                    title={t.firstPage}
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button 
                    disabled={projectPage === 0} 
                    onClick={() => setProjectPage(p => p - 1)} 
                    className="p-1 hover:text-white hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-all"
                    title={t.prevPage}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-medium">
                    {projectPage + 1} / {Math.ceil(userInfo.projects.length / 10)}
                  </span>
                  <button 
                    disabled={projectPage >= Math.ceil(userInfo.projects.length / 10) - 1} 
                    onClick={() => setProjectPage(p => p + 1)} 
                    className="p-1 hover:text-white hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-all"
                    title={t.nextPage}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button 
                    disabled={projectPage >= Math.ceil(userInfo.projects.length / 10) - 1} 
                    onClick={() => setProjectPage(Math.ceil(userInfo.projects.length / 10) - 1)} 
                    className="p-1 hover:text-white hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-all"
                    title={t.lastPage}
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">
              {t.noProjects}
            </div>
          )}
        </div>
      )}
    </div>
  );
  const renderLanguageDropdown = (isMobile = false) => (
    <div className={`relative flex items-center lang-container ${isMobile ? 'w-full h-full' : 'w-9 h-9'} justify-center`}>
      <button 
        onClick={() => setIsLangOpen(!isLangOpen)}
        className="w-full h-full flex items-center justify-center hover:text-blue-600 dark:hover:text-[#60a5fa] transition-colors cursor-pointer"
      >
        <Globe className="w-5 h-5" />
      </button>
      {isLangOpen && (
        <div className={`absolute ${isMobile ? 'bottom-full mb-3' : 'top-full mt-3'} right-0 w-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg overflow-visible pb-1 z-50 animate-in fade-in zoom-in-95 duration-200`}>
          <div className={`absolute ${isMobile ? '-bottom-2 border-b border-r' : '-top-2 border-t border-l'} right-2.5 w-4 h-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rotate-45`}></div>
          <div className="relative bg-white dark:bg-slate-800 rounded flex flex-col pt-1">
            {[{id: 'zh', label: '中文'}, {id: 'en', label: 'English'}].map(lang => (
              <button
                key={lang.id}
                onClick={() => { setLanguage(lang.id as Language); setIsLangOpen(false); }}
                className={`w-full text-center px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer ${language === lang.id ? 'text-blue-600 dark:text-[#60a5fa] font-semibold' : 'text-slate-600 dark:text-slate-300'}`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (!isInsideApp) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
        <main className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto">
          <WelcomePage 
            language={language} 
            onNavigateL1={handleNavigateL1} 
            onNavigateL2={handleNavigateL2} 
            onNavigate={handleNavigate}
          />
        </main>
        
        {/* Welcome Footer */}
        <footer className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between px-6 py-2 md:h-[38px] text-[12px] text-slate-600 dark:text-slate-400 z-30 shrink-0">
          <div className="hidden md:block">{t.copyright}</div>
          <div className="flex md:hidden w-full justify-center mb-1">{t.copyright}</div>
          <div className="flex items-center gap-3 font-medium">
             <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer">{t.legalDeclaration}</a>
             <span className="text-slate-300 dark:text-slate-600">|</span>
             <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer">{t.privacyPolicy}</a>
             <span className="text-slate-300 dark:text-slate-600">|</span>
             <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer">{t.cookiesPolicy}</a>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* MOBILE TOP NAV */}
      <header className="md:hidden flex justify-between items-center px-4 h-16 w-full bg-white dark:bg-slate-800 sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 transition-colors duration-200 gap-3">
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
        >
          <Menu className="w-6 h-6" />
        </button>
        
        <div className="flex-1 min-w-0 flex justify-start">
          <div className="flex items-center text-sm font-medium gap-2 max-w-full">
            <div 
              onClick={() => setIsProjectSelectionModalOpen(true)}
              className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg cursor-pointer hover:border-slate-300 dark:hover:border-slate-500 transition-colors flex-1 min-w-0"
            >
              <span className={`truncate text-xs ${selectedHeaderProject ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
                {selectedHeaderProject ? selectedHeaderProject.name : t.selectProject}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2" />
            </div>
              <button
              disabled={!selectedHeaderProject}
              onClick={() => {
                if (selectedHeaderProject) {
                  switchProject(selectedHeaderProject.id);
                  handleNavigate('#projects/' + selectedHeaderProject.id, { title: selectedHeaderProject.name, url: projectUrl });
                }
              }}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 scale-90">
          {renderLanguageDropdown(false)}
        </div>
      </header>

        {/* MOBILE SIDE NAV (DRAWER) */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Overlay */}
            <div 
              className="absolute inset-0 bg-slate-900/60 transition-opacity" 
              onClick={() => setIsMobileMenuOpen(false)}
            ></div>
            
            {/* Drawer contents */}
            <div className="relative flex flex-col w-80 max-w-[85vw] h-full bg-white dark:bg-slate-900 shadow-xl overflow-hidden animate-in slide-in-from-left duration-300">
              <div className="h-[72px] px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0 relative">
                <div 
                  className="flex flex-col flex-1 min-w-0 pr-3 cursor-pointer" 
                  onClick={() => { setIsInsideApp(false); setIsMobileMenuOpen(false); }}
                >
                  <HeaderLogo className="h-[48px] w-auto text-slate-900 dark:text-white shrink-0 object-contain object-left pointer-events-none" />
                </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0 absolute right-4"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {!isShowingL1List && sidebarHeaderId && (
                <div 
                  className="mb-2 pl-0 pr-2 py-2 flex items-center gap-2 cursor-pointer group"
                  onClick={() => setIsShowingL1List(true)}
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 group-hover:text-slate-900 dark:group-hover:text-white transition-colors shrink-0">
                    <ChevronLeft className="w-5 h-5" />
                  </div>
                  <span className="text-[17px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                    {findTitle(menuData, sidebarHeaderId)}
                  </span>
                </div>
              )}
              {isShowingL1List ? (
                <div className="flex flex-col">
                  {/* First Section - Enabled Items */}
                  <div className="flex flex-col gap-0.5">
                    {/* Items 1, 3, 4, 5, 6, 7: Show only top level */}
                    {/* Planning & Design (L1-2): Show children but hide their children */}
                    {menuData.map((l1Item: any) => {
                      const isPlanningDesign = l1Item.id === 'L1-2';
                      
                      // Create a shallow copy to prevent modifying the original data
                      // For non-PlanningDesign items, we remove children so they don't expand
                      // For PlanningDesign, we keep children but remove THEIR children
                      const displayItem = {
                        ...l1Item,
                        children: isPlanningDesign 
                          ? l1Item.children?.map((l2: any) => ({ ...l2, children: undefined }))
                          : undefined
                      };

                      return (
                        <MenuItem 
                          key={displayItem.id} 
                          item={displayItem} 
                          currentPath={currentPath}
                          activeMenuId={activeMenuId}
                          onNavigate={(path, item) => { 
                            if (item?.url) handleNavigate(path, item); 
                            setActiveL1Id(l1Item.id);
                            setSidebarHeaderId(item?.id || l1Item.id);
                            setIsShowingL1List(false); 
                          }}
                        hideChevron={isPlanningDesign}
                        expandedMenus={isPlanningDesign ? { [l1Item.id]: true } : expandedMenus}
                          onToggleExpand={toggleMenuExpand}
                        />
                      );
                    })}
                  </div>

                  {/* Separator */}
                  <div className="my-4 border-t border-slate-200 dark:border-slate-800"></div>

                  {/* Second Section - Disabled Items */}
                  <div className="flex flex-col gap-0.5">
                    {[
                      { id: 'policy', title: t.welcomePolicy, icon: FileText, disabled: true },
                      { id: 'hr', title: t.welcomeHR, icon: Users, disabled: true },
                      { id: 'asset', title: t.welcomeAsset, icon: Box, disabled: true },
                      { id: 'meeting', title: t.welcomeMeeting, icon: ClipboardList, disabled: true },
                      { id: 'operation', title: t.welcomeOperation, icon: Monitor, disabled: true },
                      { id: 'others', title: t.welcomeOthers, icon: Layers, disabled: true }
                    ].map(item => (
                      <MenuItem 
                        key={item.id}
                        item={item}
                        currentPath={currentPath}
                        onNavigate={() => {}}
                        expandedMenus={{}}
                        onToggleExpand={() => {}}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                (() => {
                  const isProfessionalSubset = sidebarHeaderId && sidebarHeaderId.startsWith('L2') && parseInt(sidebarHeaderId.substring(3)) >= 6;
                  
                  if (isProfessionalSubset) {
                     const findNode = (nodes: any[], id: string): any => {
                       for (const n of nodes) {
                         if (n.id === id) return n;
                         if (n.children) {
                           const f = findNode(n.children, id);
                           if (f) return f;
                         }
                       }
                       return null;
                     };
                     const subset = findNode(menuData, sidebarHeaderId);
                     return subset?.children?.map((item: any) => (
                      <MenuItem 
                        key={item.id} 
                        item={item} 
                        currentPath={currentPath}
                        activeMenuId={activeMenuId}
                        onNavigate={(path, item) => {
                          handleNavigate(path, item);
                          setIsMobileMenuOpen(false);
                        }}
                        expandedMenus={expandedMenus}
                        onToggleExpand={toggleMenuExpand}
                        showDivider={subset.seperateLine?.includes(item.id)}
                      />
                     ));
                  }

                  return menuData.find(item => item.id === activeL1Id)?.children?.map((l2Item: any) => {
                    const parent = menuData.find(item => item.id === activeL1Id);
                    return (
                      <MenuItem 
                        key={l2Item.id} 
                        item={l2Item} 
                        currentPath={currentPath}
                        activeMenuId={activeMenuId}
                        onNavigate={(path, item) => {
                          handleNavigate(path, item);
                          setIsMobileMenuOpen(false);
                        }}
                        expandedMenus={expandedMenus}
                        onToggleExpand={toggleMenuExpand}
                        showDivider={(parent as any)?.seperateLine?.includes(l2Item.id)}
                      />
                    );
                  });
                })()
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-300 overflow-hidden border border-slate-200 dark:border-slate-600 shrink-0">
                    {/* @ts-ignore */}
                    {userInfo?.avatarUrl ? (
                      /* @ts-ignore */
                      <img src={userInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <DefaultAvatar className="w-full h-full text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-slate-900 dark:text-white text-sm font-medium">{userInfo?.name[language] || '...'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button 
                    onClick={toggleTheme} 
                    className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer" 
                    title={isDark ? 'Light Mode' : 'Dark Mode'}
                  >
                    {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => { handleNavigate(globalLinks.itSupport.url, globalLinks.itSupport); setIsMobileMenuOpen(false); }}
                    className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer" 
                    title={globalLinks.itSupport.title}
                  >
                    <globalLinks.itSupport.icon className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => { handleNavigate(globalLinks.helpGuide.url, globalLinks.helpGuide); setIsMobileMenuOpen(false); }}
                    className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer" 
                    title={globalLinks.helpGuide.title}
                  >
                    <globalLinks.helpGuide.icon className="w-4 h-4" />
                  </button>
                  <button className="text-slate-500 hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer" title={t.logout}>
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP SIDE NAV */}
      <nav className={`hidden md:flex flex-none h-screen ${isDesktopSidebarCollapsed ? 'w-0 opacity-0 invisible' : 'w-80 opacity-100 visible'} bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 flex-col z-50 transition-all duration-300 ease-in-out overflow-hidden`}>
        <div 
          className="h-16 px-6 shrink-0 flex items-center justify-center overflow-hidden border-b border-slate-200 dark:border-slate-700 relative shadow-sm z-10 cursor-pointer"
          onClick={() => setIsInsideApp(false)}
        >
          <HeaderLogo className="h-[42px] w-auto text-slate-900 dark:text-slate-100 shrink-0 transform transition-transform hover:scale-105 pointer-events-none" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-4">
          {!isShowingL1List && sidebarHeaderId && (
            <div 
              className="mb-2 pl-0 pr-2 py-2 flex items-center gap-2 cursor-pointer group"
              onClick={() => setIsShowingL1List(true)}
            >
              <div className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 group-hover:text-slate-900 dark:group-hover:text-white transition-colors shrink-0">
                <ChevronLeft className="w-5 h-5" />
              </div>
              <span className="text-[17px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                {findTitle(menuData, sidebarHeaderId)}
              </span>
            </div>
          )}
          {isShowingL1List ? (
            <div className="flex flex-col">
              {/* First Section - Enabled Items */}
              <div className="flex flex-col gap-0.5">
                {menuData.map((l1Item: any) => {
                  const isPlanningDesign = l1Item.id === 'L1-2';
                  const displayItem = {
                    ...l1Item,
                    children: isPlanningDesign 
                      ? l1Item.children?.map((l2: any) => ({ ...l2, children: undefined }))
                      : undefined
                  };

                  return (
                    <MenuItem 
                      key={displayItem.id} 
                      item={displayItem} 
                      currentPath={currentPath}
                      activeMenuId={activeMenuId}
                      onNavigate={(path, item) => { 
                        if (item?.url) handleNavigate(path, item); 
                        setActiveL1Id(l1Item.id);
                        setSidebarHeaderId(item?.id || l1Item.id);
                        setIsShowingL1List(false); 
                      }}
                      hideChevron={isPlanningDesign}
                      expandedMenus={isPlanningDesign ? { [l1Item.id]: true } : expandedMenus}
                      onToggleExpand={toggleMenuExpand}
                    />
                  );
                })}
              </div>

              {/* Separator */}
              <div className="my-4 border-t border-slate-200 dark:border-slate-800"></div>

              {/* Second Section - Disabled Items */}
              <div className="flex flex-col gap-0.5">
                {[
                  { id: 'policy', title: t.welcomePolicy, icon: FileText, disabled: true },
                  { id: 'hr', title: t.welcomeHR, icon: Users, disabled: true },
                  { id: 'asset', title: t.welcomeAsset, icon: Box, disabled: true },
                  { id: 'meeting', title: t.welcomeMeeting, icon: ClipboardList, disabled: true },
                  { id: 'operation', title: t.welcomeOperation, icon: Monitor, disabled: true },
                  { id: 'others', title: t.welcomeOthers, icon: Layers, disabled: true }
                ].map(item => (
                  <MenuItem 
                    key={item.id}
                    item={item}
                    currentPath={currentPath}
                    onNavigate={() => {}}
                    expandedMenus={{}}
                    onToggleExpand={() => {}}
                  />
                ))}
              </div>
            </div>
          ) : (
            (() => {
              const isProfessionalSubset = sidebarHeaderId && sidebarHeaderId.startsWith('L2') && parseInt(sidebarHeaderId.substring(3)) >= 6;
              
                 if (isProfessionalSubset) {
                    const findNode = (nodes: any[], id: string): any => {
                      for (const n of nodes) {
                        if (n.id === id) return n;
                        if (n.children) {
                          const f = findNode(n.children, id);
                          if (f) return f;
                        }
                      }
                      return null;
                    };
                    const subset = findNode(menuData, sidebarHeaderId);
                    return subset?.children?.map((item: any) => (
                     <MenuItem 
                       key={item.id} 
                       item={item} 
                       currentPath={currentPath}
                       activeMenuId={activeMenuId}
                       onNavigate={(path, item) => handleNavigate(path, item)}
                       expandedMenus={expandedMenus}
                       onToggleExpand={toggleMenuExpand}
                       showDivider={subset.seperateLine?.includes(item.id)}
                     />
                    ));
                 }

                 return menuData.find(item => item.id === activeL1Id)?.children?.filter((l2Item: any) => !(l2Item.url && l2Item.children && l2Item.children.length > 0)).map((l2Item: any) => {
                   const parent = menuData.find(item => item.id === activeL1Id);
                   return (
                    <MenuItem 
                      key={l2Item.id} 
                      item={l2Item} 
                      currentPath={currentPath}
                      activeMenuId={activeMenuId}
                      onNavigate={(path, item) => {
                        handleNavigate(path, item)
                      }}
                      expandedMenus={expandedMenus}
                      onToggleExpand={toggleMenuExpand}
                      showDivider={(parent as any)?.seperateLine?.includes(l2Item.id)}
                    />
                  );
                 });
            })()
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-300 overflow-hidden border border-slate-200 dark:border-slate-600 shrink-0">
                {/* @ts-ignore */}
                {userInfo?.avatarUrl ? (
                  /* @ts-ignore */
                  <img src={userInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <DefaultAvatar className="w-full h-full text-slate-400" />
                )}
              </div>
              <div>
                <p className="text-slate-900 dark:text-white text-sm font-medium">{userInfo?.name[language] || '...'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={toggleTheme} 
                className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer" 
                title={isDark ? 'Light Mode' : 'Dark Mode'}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button 
                onClick={() => handleNavigate(globalLinks.itSupport.url, globalLinks.itSupport)}
                className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer" 
                title={globalLinks.itSupport.title}
              >
                <globalLinks.itSupport.icon className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handleNavigate(globalLinks.helpGuide.url, globalLinks.helpGuide)}
                className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer" 
                title={globalLinks.helpGuide.title}
              >
                <globalLinks.helpGuide.icon className="w-4 h-4" />
              </button>
              <button className="text-slate-500 hover:text-red-500 dark:hover:text-red-400 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer" title={t.logout}>
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* COLLAPSE TOGGLE DIVIDER */}
      <div 
        className={`hidden md:flex fixed top-0 bottom-0 z-[60] w-4 cursor-pointer group items-center justify-center transition-all duration-300 ease-in-out ${isDesktopSidebarCollapsed ? 'left-0 translate-x-0' : 'left-80 -translate-x-1/2'}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed);
        }}
      >
        {!isDesktopSidebarCollapsed && (
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-slate-200 dark:bg-slate-800 group-hover:bg-blue-500/50 transition-colors"></div>
        )}
        <div className={`z-10 h-16 w-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-full flex items-center justify-center shadow-md text-slate-400 group-hover:text-blue-500 group-hover:scale-110 group-hover:shadow-lg transition-all}`}>
          {isDesktopSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </div>
      </div>

      {/* MAIN CONTENT WRAPPER */}
      <div className={`flex-1 flex flex-col ${isBottomNavExpanded ? 'pb-32' : 'pb-10'} md:pb-0 relative min-w-0 overflow-hidden`}>
        {/* DESKTOP TOP NAV */}
        <DesktopTopNav
          language={language}
          currentPath={currentPath}
          projectInfo={projectInfo}
          userInfo={userInfo}
          selectedHeaderProject={selectedHeaderProject}
          onSelectProjectClick={() => setIsProjectSelectionModalOpen(true)}
          onViewProject={(proj) => {
            switchProject(proj.id);
            handleNavigate('#projects/' + proj.id, { title: proj.name, url: projectUrl });
          }}
          onNavigate={handleNavigate}
          onSearch={handleSearch}
          renderLanguageDropdown={renderLanguageDropdown}
          isQuickLinksMenuOpen={isQuickLinksMenuOpen}
          setIsQuickLinksMenuOpen={setIsQuickLinksMenuOpen}
        />

        {/* TABS VIEW */}
        {tabs.length > 0 && userInfo?.projects && userInfo.projects.length > 0 && (
          <div className="relative w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
            <WorkspaceTabs 
              tabs={tabs}
              activeTabId={activeTabId}
              language={language}
              onTabSelect={(tab) => {
                setActiveTabId(tab.id);
                if (tab.projectName) switchProject(tab.projectName);
                setCurrentPath(tab.path);
              }}
              onTabClose={closeTab}
              isSidebarCollapsed={isDesktopSidebarCollapsed}
            />
          </div>
        )}

        {/* PAGE CONTENT */}
        <div className={`relative flex-1 flex flex-col w-full min-w-0 ${currentPath === '#submenu' ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
          {tabs.length > 0 && currentPath && currentPath !== '#settings' && (() => {
            const activeTab = tabs.find(t => t.id === activeTabId);
            const explicitProject = activeTab?.projectName 
              ? userInfo?.projects?.find(p => p.id === activeTab.projectName)
              : projectInfo;

            const getBreadcrumbPath = (url: string, menuId?: string) => {
              let path: string[] = [];
              const search = (nodes: any[], currentPathSegments: string[]): boolean => {
                for (const node of nodes) {
                  const isMatch = menuId ? node.id === menuId : node.url === url;
                  if (isMatch) {
                    path = [...currentPathSegments]; // Exclude the final node's title
                    return true;
                  }
                  if (node.children) {
                    if (search(node.children, [...currentPathSegments, node.title])) {
                      return true;
                    }
                  }
                }
                return false;
              };
              search(menuData, []);
              return path;
            };
            const breadcrumbPath = getBreadcrumbPath(currentPath, activeMenuId);

            if (breadcrumbPath.length === 0 && !explicitProject) return null;

            return (
              <div className="w-full h-9 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 px-4 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium overflow-hidden">
                  {breadcrumbPath.map((item, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-500" />}
                      <span 
                         className={`block truncate max-w-[100px] lg:max-w-[180px] ${index === breadcrumbPath.length - 1 ? "font-bold text-slate-700 dark:text-slate-200" : ""}`} 
                         title={item}
                      >
                         {item}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}

          <main className={`p-4 md:p-4 flex-1 flex-col gap-6 w-full mx-auto ${currentPath === '#submenu' ? 'overflow-hidden' : 'overflow-x-hidden'} ${currentPath.startsWith('http') ? 'hidden' : 'flex'}`}>
            {(() => {
              const activeTab = tabs.find(t => t.id === activeTabId);
              const isWelcome = currentPath === '#welcome';
              const hasSubmenuTabs = tabs.some(t => t.path === '#submenu');
              
              return (
                <>
                  {hasSubmenuTabs && tabs.map(tab => {
                    if (tab.path !== '#submenu') return null;
                    return (
                      <SubmenuPage 
                        key={tab.id}
                        tabId={tab.id}
                        items={tab.submenuChildren || []} 
                        language={language} 
                        isDark={isDark} 
                        projectName={tab.projectName ? userInfo?.projects.find(p => p.id === tab.projectName)?.name : selectedHeaderProject?.name}
                        isHidden={activeTabId !== tab.id || currentPath !== '#submenu'}
                      />
                    );
                  })}

                  {activeTab?.isSearch && (
                    <SearchResults 
                      language={language} 
                      query={activeTab.searchQuery || ''} 
                      onNavigate={handleNavigate} 
                    />
                  )}

                  {currentPath === MICRO_APP_PATH && (
                    <div className="flex-1 min-h-[640px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                      {(() => {
                        const app = moduleManifests.find((module) => module.name === 'ccs-module-demo');
                        if (!app) return null;
                        return (
                          <MicroApp
                            app={app}
                            theme={isDark ? 'dark' : 'light'}
                            language={toRuntimeLanguage(language)}
                            routePath="/modules/demo/dashboard"
                            user={{
                              id: userInfo?.id ?? 'guest',
                              name: userInfo?.name[language] ?? 'Guest',
                              roles: ['admin'],
                              permissions: ['module:demo:view']
                            }}
                          />
                        );
                      })()}
                    </div>
                  )}
                  
                  {(currentPath !== '#welcome' && currentPath !== '#submenu' && currentPath !== MICRO_APP_PATH && !activeTab?.isSearch) && (
                    <div className="grid grid-cols-12 auto-rows-min gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 md:pb-8 items-start">
                      {(() => {
                        let prjName = '...';
                        const explicitProject = activeTab?.projectName 
                          ? userInfo?.projects.find(p => p.id === activeTab.projectName)
                          : projectInfo;
                        
                        prjName = explicitProject ? explicitProject.name : '...';
                        
                        const registry = getDashboardRegistry(language, prjName);
                        const layout = registry[currentPath] || registry.default;
                        return layout.map((config) => {
                          const Component = CardComponents[config.component];
                          if (!Component) return null;

                          return (
                            <div 
                              key={config.id} 
                              className="dashboard-card-item transition-all"
                              style={{
                                '--col-base': config.colSpan.base,
                                '--row-base': config.rowSpan || 1,
                                '--col-md': config.colSpan.md,
                                '--row-md': config.rowSpan || 1,
                              } as any}
                            >
                              <Component 
                                {...config.props} 
                                lang={language} 
                                isDark={isDark} 
                                setLanguage={setLanguage} 
                                toggleTheme={toggleTheme} 
                                userInfo={userInfo} 
                              />
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </>
              );
            })()}
          </main>

          {/* External URLs (iFrames) */}
          {tabs.map((tab) => {
            const isExternal = tab.path.startsWith('http://') || tab.path.startsWith('https://');
            if (!isExternal) return null;
            
            return (
              <iframe
                key={tab.id}
                src={tab.path}
                className={`w-full flex-1 border-0 custom-scrollbar ${activeTabId === tab.id ? 'block' : 'hidden'}`}
                ref={el => {
                  if (el) {
                    iframeRefs.current[tab.id] = el;
                  } else {
                    delete iframeRefs.current[tab.id];
                  }
                }}
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  iframe.contentWindow?.postMessage(
                    { type: 'SYNC_STATE', payload: { isDark, language } },
                    '*'
                  );
                }}
              />
            );
          })}
          
          {/* Welcome Page Fixed Footer */}
          {currentPath === '#welcome' && (!isInsideApp || tabs.length > 0) && (
            <footer className={`fixed bottom-14 md:bottom-0 right-0 left-0 ${isDesktopSidebarCollapsed ? 'md:left-0' : 'md:left-80'} bg-slate-200/80 dark:bg-slate-800/90 backdrop-blur-sm border-t border-slate-300/60 dark:border-slate-700/60 flex flex-col md:flex-row items-center justify-between px-6 py-2 md:h-[38px] text-[12px] text-slate-600 dark:text-slate-400 z-30 transition-all duration-300 ease-in-out`}>
              <div className="hidden md:block">{t.copyright}</div>
              <div className="flex md:hidden w-full justify-center mb-1">{t.copyright}</div>
              <div className="flex items-center gap-3 font-medium">
                 <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer">{t.legalDeclaration}</a>
                 <span className="text-slate-300 dark:text-slate-600">|</span>
                 <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer">{t.privacyPolicy}</a>
                 <span className="text-slate-300 dark:text-slate-600">|</span>
                 <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer">{t.cookiesPolicy}</a>
              </div>
            </footer>
          )}
        </div>

      </div>

      {/* MOBILE BOTTOM NAV */}
      <MobileBottomNav
        language={language}
        currentPath={currentPath}
        userInfo={userInfo}
        onNavigate={handleNavigate}
        onSearch={handleSearch}
        isExpanded={isBottomNavExpanded}
        onToggleExpand={() => setIsBottomNavExpanded(!isBottomNavExpanded)}
      />

      <ProjectSelectionModal 
        isOpen={isProjectSelectionModalOpen}
        onClose={() => setIsProjectSelectionModalOpen(false)}
        projects={userInfo?.projects || MOCK_PROJECTS}
        language={language}
        onSelect={(project) => {
          setSelectedHeaderProject(project);
          setIsProjectSelectionModalOpen(false);
        }}
      />
    </div>
  );
}
