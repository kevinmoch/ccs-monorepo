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
  Map,
  Stamp,
  Building2,
  Gavel,
  Landmark,
  FileSignature,
  Wrench,
  Truck,
  Receipt,
  PiggyBank,
  PieChart,
  BookOpen,
  Database,
  Hammer
} from 'lucide-react';
import { Language, translations } from './translations';
import {
  Monitor,
  AlertOctagon,
  Folders
} from 'lucide-react';
import { menu1 } from './menu1';
import { menu2 } from './menu2';
import { menu3 } from './menu3';
import { menu4 } from './menu4';
import { menu5 } from './menu5';
import { menu6 } from './menu6';
import { menu7 } from './menu7';

export const projectUrl =
  'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/eccui/ecc/index.html?formId=h#/ProManagementCenter?projectId=2455258360879040512&hideHeader=1&projectName=%E5%9B%A2%E6%B3%8A%E6%B4%BC%E5%8D%97%E9%83%A8%E5%AD%A6%E6%A0%A1-VIP%E9%A1%B9%E7%9B%AE';

export const getGlobalLinks = (lang: Language) => {
  const t = translations[lang];
  return {
    myWorkspace: { id: 'my-workspace', title: t.myWorkspace, url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/ecc/portal/#/', icon: Monitor },
    myProjects: { id: 'my-projects', title: t.myProjects, url: '#my-projects', icon: Folders },
    myTodos: { id: 'my-todos', title: t.myTodos, url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=por_mytasklist&gridTab=1', icon: CheckSquare },
    severelyOverdue: {
      id: 'severely-overdue',
      title: t.severelyOverdue,
      url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=bos_list&billFormId=hw_process_eff_ledger&type=list&wfStatus=0&effStatus=2',
      icon: AlertOctagon
    },
    overdue: {
      id: 'overdue',
      title: t.overdue,
      url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=bos_list&billFormId=hw_process_eff_ledger&type=list&wfStatus=0&effStatus=1',
      icon: AlertTriangle
    },
    notifications: { id: 'notifications', title: t.notifications, url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=hw_preview_page_more&category=innet_notice', icon: Bell },
    settings: { id: 'settings', title: t.settings, url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=bos_templatetreelist&billFormId=hw_index_adminconfig&type=list', icon: Settings },
    itSupport: { id: 'it-support', title: t.itSupport, url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=hw_portal_question_task&defaultView=Y', icon: Headset },
    helpGuide: {
      id: 'help-guide',
      title: t.helpGuide,
      url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/eccui/ecc/index.html#/TemplateLibraryHomePage?templateLibClass=UserGuide',
      icon: HelpCircle
    },
    search: { id: 'search', title: t.search, url: '#welcome', icon: Search }
  };
};

export const GET_MENU_DATA = (lang: Language) => {
  const isZh = lang === 'zh';
  return [
    menu1(isZh),
    menu2(isZh),
    menu3(isZh),
    menu4(isZh),
    menu5(isZh),
    menu6(isZh),
    menu7(isZh),
    {
      id: 'micro-frontend',
      title: isZh ? '微前端模块' : 'Micro Frontend',
      icon: Monitor,
      children: [
        {
          id: 'micro-ccs-module-demo',
          title: isZh ? '示例业务模块' : 'Demo Module',
          url: '#micro:ccs-module-demo',
          icon: Monitor
        }
      ]
    }
  ];
};
