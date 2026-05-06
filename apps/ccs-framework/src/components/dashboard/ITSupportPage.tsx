import React from 'react';
import { translations, Language } from '../../lib/translations';
import { HeaderCard } from './HeaderCard';
import { Headset, Mail, Phone } from 'lucide-react';

interface ITSupportPageProps {
  lang: Language;
}

export const ITSupportPage: React.FC<ITSupportPageProps> = ({ lang }) => {
  const t = translations[lang];

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard 
          title={t.itSupport} 
          description={lang === 'zh' ? '联系我们的IT团队获取技术支持和系统问题解决' : 'Contact our IT team for technical support and system issue resolution'} 
          breadcrumb={[t.itSupport]} 
          lang={lang}
        />
      </div>
      <div className="col-span-12 md:col-span-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 h-full">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Headset className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {lang === 'zh' ? '技术支持桌面' : 'Tech Support Desk'}
              </h3>
              <p className="text-slate-500">24/7 {lang === 'zh' ? '在线支持' : 'Online Support'}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <Phone className="w-5 h-5 text-slate-400" />
              <span>+1 (800) 123-4567</span>
            </div>
            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <Mail className="w-5 h-5 text-slate-400" />
              <span>support@huaweicloud.com</span>
            </div>
          </div>
          <div className="mt-8">
            <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors cursor-pointer">
              {lang === 'zh' ? '提交工单' : 'Submit a Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
