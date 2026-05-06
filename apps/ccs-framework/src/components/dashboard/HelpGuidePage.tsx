import React from 'react';
import { translations, Language } from '../../lib/translations';
import { HeaderCard } from './HeaderCard';
import { HelpCircle, BookOpen, FileText, PlayCircle } from 'lucide-react';

interface HelpGuidePageProps {
  lang: Language;
}

export const HelpGuidePage: React.FC<HelpGuidePageProps> = ({ lang }) => {
  const t = translations[lang];

  const resources = [
    {
      icon: BookOpen,
      title: lang === 'zh' ? '用户指南' : 'User Guide',
      desc: lang === 'zh' ? '系统的全面使用手册' : 'Comprehensive manual for using the system'
    },
    {
      icon: FileText,
      title: lang === 'zh' ? '常见问题 (FAQ)' : 'FAQ',
      desc: lang === 'zh' ? '常见问题及解答' : 'Answers to frequently asked questions'
    },
    {
      icon: PlayCircle,
      title: lang === 'zh' ? '视频教程' : 'Video Tutorials',
      desc: lang === 'zh' ? '逐步视频指导' : 'Step-by-step video instructions'
    }
  ];

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard 
          title={t.helpGuide} 
          description={lang === 'zh' ? '浏览我们的知识库和教程学习如何使用系统' : 'Browse our knowledge base and tutorials to learn how to use the system'} 
          breadcrumb={[t.helpGuide]} 
          lang={lang}
        />
      </div>
      {resources.map((res, idx) => (
        <div key={idx} className="col-span-12 md:col-span-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col h-full hover:shadow-md transition-shadow cursor-pointer">
            <div className="p-3 bg-slate-100 dark:bg-slate-700 w-fit rounded-lg mb-4 text-slate-600 dark:text-slate-300">
              <res.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{res.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 flex-1">{res.desc}</p>
            <div className="mt-4 text-blue-600 dark:text-blue-400 text-sm font-medium flex items-center">
              {lang === 'zh' ? '了解更多 →' : 'Learn more →'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
