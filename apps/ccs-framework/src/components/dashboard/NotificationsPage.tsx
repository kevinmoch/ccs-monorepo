import React from 'react';
import { translations, Language } from '../../lib/translations';
import { HeaderCard } from './HeaderCard';
import { UserInfo } from '../../constants';
import { Bell } from 'lucide-react';

interface NotificationsPageProps {
  lang: Language;
  userInfo?: UserInfo | null;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ lang, userInfo }) => {
  const t = translations[lang];

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 items-start w-full">
      <div className="col-span-12">
        <HeaderCard 
          title={t.notifications} 
          description={lang === 'zh' ? '查看和管理您的所有通知' : 'View and manage all your notifications'} 
          breadcrumb={[t.notifications]} 
          lang={lang}
        />
      </div>
      <div className="col-span-12">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden min-h-[400px]">
          {userInfo?.notifications && userInfo.notifications.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {userInfo.notifications.map(n => (
                <div key={n.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-start gap-4">
                  <div className={`mt-1 flex-shrink-0 p-2 rounded-full ${n.isRead ? 'bg-slate-100 dark:bg-slate-700 text-slate-500' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-base font-semibold ${n.isRead ? 'text-slate-600 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                      {n.title[lang]}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {n.content[lang]}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {n.timestamp}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 h-full">
              <Bell className="w-12 h-12 mb-4 opacity-50" />
              <p>{t.noNotifications}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
