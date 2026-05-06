import React from 'react';
import { translations, Language } from '../../lib/translations';
import { Search, ChevronRight, LayoutGrid } from 'lucide-react';
import { GET_MENU_DATA } from '../../lib/menu_data';

interface SearchResultsProps {
  language: Language;
  query: string;
  onNavigate: (path: string, item: any) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ language, query, onNavigate }) => {
  const t = translations[language];
  const menuData = GET_MENU_DATA(language);

  const searchMenu = (items: any[], query: string, pathPrefix: string[] = []): any[] => {
    let results: any[] = [];
    if (!query) return [];
    
    for (const item of items) {
      const currentPath = [...pathPrefix, item.title];
      const matches = item.title.toLowerCase().includes(query.toLowerCase());
      const isSubmenuContainer = item.url === '#submenu';
      
      if (matches && (item.url || item.children)) {
        results.push({
          id: item.id,
          type: 'menu',
          title: item.title,
          description: pathPrefix.length > 0 ? pathPrefix.join(' > ') : (language === 'zh' ? '主导航' : 'Main Navigation'),
          path: item.url,
          icon: item.icon,
          l2Id: item.id,
          children: item.children
        });
      }
      
      if (item.children && !isSubmenuContainer) {
        results = [...results, ...searchMenu(item.children, query, currentPath)];
      }
    }
    return results;
  };

  const results = searchMenu(menuData, query);

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-5 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col gap-1 px-1">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Search className="w-4.5 h-4.5 text-blue-500" />
          <span>{t.searchResultsFor} "{query}"</span>
        </h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">
          {language === 'zh' ? `找到 ${results.length} 条相关结果` : `Found ${results.length} relevant results`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2.5">
        {results.length > 0 ? (
          results.map((result) => (
            <div 
              key={result.id}
              className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-400/50 dark:hover:border-blue-500/30 transition-all cursor-pointer group"
              onClick={() => {
                onNavigate(result.path || '', { 
                  id: result.id, 
                  title: result.title, 
                  url: result.path,
                  children: result.children
                });
              }}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center shrink-0 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors border border-slate-100 dark:border-slate-700">
                  {result.icon ? (
                    <result.icon className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                  ) : (
                    <LayoutGrid className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                       <h3 className="font-medium text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                         {result.title}
                       </h3>
                    </div>
                    {result.path && (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
                    )}
                  </div>
                  <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5 truncate uppercase tracking-wider">
                    {result.description}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white/50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
              {language === 'zh' ? '未找到相关搜索结果' : 'No search results found'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {language === 'zh' ? '请尝试更换搜索词' : 'Please try different keywords'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
