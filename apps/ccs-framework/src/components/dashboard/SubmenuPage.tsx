import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface SubmenuPageProps {
  items: any[];
  language: 'zh' | 'en';
  isDark: boolean;
  projectName?: string;
  tabId?: string;
  isHidden?: boolean;
}

export const SubmenuPage: React.FC<SubmenuPageProps> = ({ items, language, isDark, projectName, tabId, isHidden }) => {
  const isProjectSelected = !!projectName;

  // Find the first leaf node to set as default active URL
  const findFirstLeafUrl = (nodes: any[]): string => {
    if (!isProjectSelected) return '';
    for (const node of nodes) {
      if (node.disabled) continue;
      if (node.url && (!node.children || node.children.length === 0)) {
        return node.url;
      }
      if (node.children && node.children.length > 0) {
        const found = findFirstLeafUrl(node.children);
        if (found) return found;
      }
    }
    return '';
  };

  const getInitialActiveUrl = () => {
    return findFirstLeafUrl(items);
  };

  const getInitialExpandedMenus = () => {
    const initial: Record<string, boolean> = {};
    if (items) {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          initial[item.id] = true;
        }
      });
    }
    return initial;
  };

  const [activeUrl, setActiveUrl] = React.useState(getInitialActiveUrl());
  const [expandedMenus, setExpandedMenus] = React.useState<Record<string, boolean>>(getInitialExpandedMenus());

  const toggleExpand = (id: string) => {
    if (!isProjectSelected) return;
    setExpandedMenus(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderMenuItem = (item: any, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isActive = activeUrl === item.url;
    
    return (
      <div key={item.id} className="flex flex-col">
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (!isProjectSelected || item.disabled) return;
            if (item.url) {
              setActiveUrl(item.url);
            }
            if (hasChildren) {
              toggleExpand(item.id);
            }
          }}
          className={`flex items-center py-2 px-3 rounded-md transition-all duration-200 group ${
            (!isProjectSelected || item.disabled)
              ? 'opacity-40 cursor-not-allowed text-slate-400'
              : isActive && !hasChildren
                ? 'bg-blue-600 text-white shadow-md cursor-pointer' 
                : isActive && hasChildren
                  ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 font-bold cursor-pointer'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer'
          }`}
          style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}
        >
          <span className={`flex-1 truncate text-sm ${isActive ? 'font-bold' : 'group-hover:translate-x-1 transition-transform'}`}>
            {item.title}
          </span>
          {hasChildren && (
            <div className={`transition-transform duration-200 ${expandedMenus[item.id] ? 'rotate-0' : '-rotate-90'}`}>
              <ChevronDown className={`w-3.5 h-3.5 ml-2 ${isActive && !isDark ? 'text-white' : 'text-slate-400'}`} />
            </div>
          )}
        </div>
        {hasChildren && expandedMenus[item.id] && (
          <div className="flex flex-col mt-1 gap-0.5">
            {item.children.map((child: any) => renderMenuItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 w-full h-full min-h-0" style={{ display: isHidden ? 'none' : 'flex' }}>
      {/* Project Status Bar */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {isProjectSelected 
            ? (language === 'zh' ? '当前项目' : 'Current Project') 
            : (language === 'zh' ? '请先选择项目' : 'Please select a project first')
          }
          {isProjectSelected && '：'}
        </span>
        {isProjectSelected && (
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
            {projectName}
          </span>
        )}
      </div>

      {/* Main Content Area (Rectangle) */}
      <div className="flex flex-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm min-h-0">
        <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-3 flex flex-col gap-1 bg-slate-50/50 dark:bg-slate-900/50 custom-scrollbar">
          {items?.length > 0 ? (
            items.map(item => renderMenuItem(item))
          ) : (
            <div className="p-4 text-center text-slate-400 text-xs">
              {language === 'zh' ? '暂无菜单' : 'No menu data'}
            </div>
          )}
        </aside>
        <main className="flex-1 relative bg-slate-100 dark:bg-slate-950 flex flex-col min-w-0">
          {activeUrl && isProjectSelected ? (
            <div className="flex-1 w-full h-full relative">
               <iframe 
                 src={activeUrl} 
                 className="absolute inset-0 w-full h-full border-0 rounded-none shadow-inner"
                 onLoad={(e) => {
                   const iframe = e.currentTarget;
                   iframe.contentWindow?.postMessage(
                     { type: 'SYNC_STATE', payload: { isDark, language } },
                     '*'
                   );
                 }}
               />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 p-8 text-center">
              <p className="text-sm max-w-xs">
                {!isProjectSelected 
                  ? (language === 'zh' ? '请在顶部工具栏选择一个项目以启用功能' : 'Please select a project in the top toolbar to enable functions')
                  : activeUrl 
                    ? '' 
                    : (language === 'zh' ? '请选择左侧菜单项' : 'Please select a menu item from the left')
                }
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
