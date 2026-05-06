import React, { useState, useMemo } from 'react';
import { Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { ProjectInfo } from '../../constants';
import { translations } from '../../lib/translations';

interface ProjectSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectInfo[];
  onSelect: (project: ProjectInfo) => void;
  language: 'zh' | 'en';
}

export const ProjectSelectionModal: React.FC<ProjectSelectionModalProps> = ({
  isOpen,
  onClose,
  projects,
  onSelect,
  language
}) => {
  const t = translations[language];
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  
  const filteredProjects = useMemo(() => {
    if (!searchTerm.trim()) return projects;
    const term = searchTerm.toLowerCase();
    return projects.filter(p => 
      p.name.toLowerCase().includes(term) || 
      (p.code && p.code.toLowerCase().includes(term))
    );
  }, [projects, searchTerm]);
  
  const totalPages = Math.ceil(filteredProjects.length / pageSize);
  const currentPage = page >= totalPages && totalPages > 0 ? totalPages - 1 : page;
  
  const paginatedProjects = useMemo(() => {
    return filteredProjects.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  }, [filteredProjects, currentPage, pageSize]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm shadow-2xl p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <div className="relative w-80">
            <input 
              type="text"
              placeholder={t.projectSearchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="overflow-x-auto overflow-y-auto bg-white dark:bg-slate-900 custom-scrollbar scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 h-[450px] shrink-0">
          <table className="w-full text-left border-collapse min-w-[850px] table-fixed">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
              <tr className="text-slate-500 dark:text-slate-400 text-sm border-b border-slate-200 dark:border-slate-700 h-[45px]">
                <th className="px-6 py-3 font-medium whitespace-nowrap overflow-hidden text-ellipsis w-[400px]">{t.projectName}</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap w-32">{t.projectStage}</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap w-32">{t.projectType}</th>
                <th className="px-6 py-3 font-medium whitespace-nowrap w-32">{t.projectCode}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
              {paginatedProjects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    {t.noMatchingProjects}
                  </td>
                </tr>
              ) : (
                paginatedProjects.map((p, i) => {
                  const stages = t.projectStages || ["设计阶段", "设计暂缓", "施工阶段", "完工结算阶段", "结算完成", "历史归档"];
                  const types = t.projectTypes || ["研发办公类", "工业厂房类", "数据中心类", "VIP", "旗舰店", "学校类", "其他"];
                  
                  // Mock deterministic values based on ID
                  const hash = p.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                  const stage = stages[hash % stages.length];
                  const type = types[(hash * 2) % types.length];
                  // Use 88 as prefix to match requirements
                  const code = p.code || `88${Math.floor(Math.abs(Math.sin(hash)) * 100000).toString().padStart(5, '0')}`;
                  
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group h-[45px]">
                      <td className="px-6 py-0 truncate cursor-pointer" onClick={() => onSelect(p)}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onSelect(p); }}
                          title={p.name}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium hover:underline text-left truncate w-full cursor-pointer block"
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="px-6 py-0 text-slate-600 dark:text-slate-300 truncate">{stage}</td>
                      <td className="px-6 py-0 text-slate-600 dark:text-slate-300 truncate">{type}</td>
                      <td className="px-6 py-0 text-slate-500 font-mono text-xs truncate">{code}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-600 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1">
            <button 
              disabled={currentPage === 0}
              onClick={() => setPage(0)}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button 
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2">{currentPage + 1} / {Math.max(1, totalPages)}</span>
            <button 
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage(currentPage + 1)}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button 
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage(totalPages - 1)}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span>{t.totalItems.replace('{count}', filteredProjects.length.toString())}</span>
            <select 
              value={pageSize} 
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 focus:outline-none"
            >
              <option value={10}>{t.itemsPerPage.replace('{count}', '10')}</option>
              <option value={20}>{t.itemsPerPage.replace('{count}', '20')}</option>
              <option value={50}>{t.itemsPerPage.replace('{count}', '50')}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
