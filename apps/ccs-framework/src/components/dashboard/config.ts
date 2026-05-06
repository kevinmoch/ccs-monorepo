import React from 'react';
import { 
  HardHat, 
  Layers, 
  PencilRuler, 
  LineChart, 
  Briefcase, 
  Shield, 
  Folder, 
  Users 
} from 'lucide-react';

export interface CardConfig {
  id: string;
  component: 'HeaderCard' | 'DrawingCard' | 'StatsCard' | 'ActionCard' | 'SettingsPage' | 'NotificationsPage' | 'ITSupportPage' | 'HelpGuidePage' | 'MyWorkspacePage' | 'MyProjectsPage' | 'MyTodosPage' | 'SeverelyOverduePage' | 'OverduePage';
  colSpan: {
    base: number; // mobile
    md: number;   // desktop
  };
  rowSpan?: number;
  props: any;
}

export type DashboardConfig = CardConfig[];

export const getDashboardRegistry = (lang: 'zh' | 'en', projectName: string): Record<string, DashboardConfig> => {
  const isZh = lang === 'zh';

  // Seed modifier based on simple string chart codes to vary data between projects
  const nameHash = projectName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const v1 = ((nameHash % 5) + 1) * 2;
  const v2 = ((nameHash % 7) + 1);

  const PENDING_ME_LAYOUT: DashboardConfig = [
    {
      id: 'header-pending',
      component: 'HeaderCard',
      colSpan: { base: 12, md: 12 },
      rowSpan: 3,
      props: {
        title: isZh ? '待我处理' : 'Pending Me',
        description: isZh ? '审查并签署您队列中的结构和机械图纸。此处项目需要您的立即签署或拒绝。' : 'Review and sign off on structural and mechanical drawings in your queue. Items here require your immediate signature or rejection.',
        breadcrumb: isZh ? ['设计管理', '图纸审批', '待我处理'] : ['Design Management', 'Drawing Approval', 'Pending Me']
      }
    },
    {
      id: 'stat-pending-1',
      component: 'StatsCard',
      colSpan: { base: 6, md: 3 },
      rowSpan: 3,
      props: { label: isZh ? '待办总数' : 'TOTAL QUEUE', value: `${12 + v1}`, color: 'blue' }
    },
    {
      id: 'stat-pending-2',
      component: 'StatsCard',
      colSpan: { base: 6, md: 3 },
      rowSpan: 3,
      props: { label: isZh ? '紧急项目' : 'URGENT', value: `0${2 + (v1 % 3)}`, color: 'red' }
    },
    {
      id: 'stat-pending-3',
      component: 'StatsCard',
      colSpan: { base: 6, md: 3 },
      rowSpan: 3,
      props: { label: isZh ? '今日到期' : 'DUE TODAY', value: `0${1 + (v2 % 2)}`, color: 'blue' }
    },
    {
      id: 'stat-pending-4',
      component: 'StatsCard',
      colSpan: { base: 6, md: 3 },
      rowSpan: 3,
      props: { label: isZh ? '等待中' : 'WAITING', value: `0${9 + v2}`, color: 'green' }
    },
    {
      id: 'draw-p-1',
      component: 'DrawingCard',
      colSpan: { base: 12, md: 6 },
      rowSpan: 4,
      props: {
        drawingId: `STR-B1-00${42 + v1}`,
        title: isZh ? '基础平面图 - B节' : 'Foundation Plan - Section B',
        discipline: isZh ? '结构' : 'Structural',
        submitter: isZh ? '张三' : 'John Doe',
        dueDate: isZh ? '今天' : 'Today',
        isUrgent: true
      }
    },
    {
      id: 'draw-p-2',
      component: 'DrawingCard',
      colSpan: { base: 12, md: 6 },
      rowSpan: 4,
      props: {
        drawingId: `MEP-L2-01${10 + v2}`,
        title: isZh ? '暖通布局 - 2层' : 'HVAC Layout - Level 2',
        discipline: isZh ? '机械' : 'Mechanical',
        submitter: isZh ? '李四' : 'Alice Smith',
        dueDate: 'Oct 24, 2026',
        isUrgent: false
      }
    }
  ];

  const SUBMISSIONS_LAYOUT: DashboardConfig = [
    {
      id: 'header-sub',
      component: 'HeaderCard',
      colSpan: { base: 12, md: 12 },
      rowSpan: 3,
      props: {
        title: isZh ? '我的提交' : 'My Submissions',
        description: isZh ? '跟踪您提交的所有专业图纸的审批状态。' : 'Track the status of drawings you have submitted for approval across all project disciplines.',
        breadcrumb: isZh ? ['设计管理', '图纸审批', '我的提交'] : ['Design Management', 'Drawing Approval', 'My Submissions']
      }
    },
    {
      id: 'stat-sub-1',
      component: 'StatsCard',
      colSpan: { base: 6, md: 6 },
      rowSpan: 3,
      props: { label: isZh ? '总计提交' : 'TOTAL SUBMITTED', value: `${24 + v1 + v2}`, color: 'blue' }
    },
    {
      id: 'stat-sub-2',
      component: 'StatsCard',
      colSpan: { base: 6, md: 6 },
      rowSpan: 3,
      props: { label: isZh ? '本月获批' : 'APPROVED THIS MONTH', value: `${18 + v1}`, color: 'green' }
    },
    {
      id: 'draw-s-1',
      component: 'DrawingCard',
      colSpan: { base: 12, md: 4 },
      rowSpan: 4,
      props: {
        drawingId: `ARC-E1-00${12 + v1}`,
        title: isZh ? '外部立面图 - 北' : 'Exterior Elevations - North',
        discipline: isZh ? '建筑' : 'Architectural',
        submitter: isZh ? '您' : 'You',
        dueDate: 'Oct 28, 2026',
        isUrgent: false
      }
    },
    {
      id: 'draw-s-2',
      component: 'DrawingCard',
      colSpan: { base: 12, md: 4 },
      rowSpan: 4,
      props: {
        drawingId: `ELE-L4-05${11 + v2}`,
        title: isZh ? '电气布线 - L4' : 'Electrical Routing - L4',
        discipline: isZh ? '电气' : 'Electrical',
        submitter: isZh ? '您' : 'You',
        dueDate: isZh ? '明天' : 'Tomorrow',
        isUrgent: false
      }
    },
    {
      id: 'draw-s-3',
      component: 'DrawingCard',
      colSpan: { base: 12, md: 4 },
      rowSpan: 4,
      props: {
        drawingId: `CIV-L0-120${v1}`,
        title: isZh ? '场地平整规划' : 'Site Grading Plan',
        discipline: isZh ? '土木' : 'Civil',
        submitter: isZh ? '您' : 'You', // Adding the missing comma here intentionally, wait the original is:   submitter: isZh ? '您' : 'You',
        dueDate: 'Nov 02, 2026',
        isUrgent: false
      }
    }
  ];

  const CONTACTS_LAYOUT: DashboardConfig = [
    {
      id: 'header-team',
      component: 'HeaderCard',
      colSpan: { base: 12, md: 12 },
      rowSpan: 3,
      props: {
        title: isZh ? '项目目录' : 'Project Directory',
        description: isZh ? `访问分配给 ${projectName} 的所有分包商和团队成员的联系信息。` : `Access contact information for all subcontractors and team members assigned to ${projectName}.`,
        breadcrumb: isZh ? ['团队与通讯', '目录', '联系人'] : ['Team & Comms', 'Directory', 'Contacts']
      }
    },
    {
      id: 'stat-team-1',
      component: 'StatsCard',
      colSpan: { base: 6, md: 4 },
      rowSpan: 3,
      props: { label: isZh ? '联系人总数' : 'TOTAL CONTACTS', value: `${142 + (v1 * 5)}`, color: 'blue' }
    },
    {
      id: 'stat-team-2',
      component: 'StatsCard',
      colSpan: { base: 6, md: 4 },
      rowSpan: 3,
      props: { label: isZh ? '分包商' : 'SUBCONTRACTORS', value: `${28 + v2}`, color: 'blue' }
    },
    {
      id: 'stat-team-3',
      component: 'StatsCard',
      colSpan: { base: 12, md: 4 },
      rowSpan: 3,
      props: { label: isZh ? '内部团队' : 'INTERNAL TEAM', value: `${15 + v1}`, color: 'green' }
    },
    {
      id: 'action-add-contact',
      component: 'ActionCard',
      colSpan: { base: 12, md: 12 },
      rowSpan: 2,
      props: { label: isZh ? '添加新团队成员' : 'Add New Team Member', type: 'primary' }
    }
  ];

  const WELCOME_LAYOUT: DashboardConfig = [
    {
      id: 'header-welcome',
      component: 'HeaderCard',
      colSpan: { base: 12, md: 12 },
      rowSpan: 3,
      props: {
        title: isZh ? '欢迎使用 CCS 系统' : 'Welcome to CCS System',
        description: isZh 
          ? '欢迎登录。在这里，您可以高效管理跨专业的结构、机械和建筑图纸设计流，跟踪团队任务并即时沟通。请从左侧侧边栏选择您需要的功能开始使用。' 
          : 'Welcome back. Here you can efficiently manage multidisciplinary structural, mechanical, and architectural design workflows, track team tasks, and communicate instantly. Select a function from the left sidebar to begin.',
        breadcrumb: [isZh ? '系统' : 'System', isZh ? '主页' : 'Home']
      }
    },
    {
      id: 'action-docs',
      component: 'ActionCard',
      colSpan: { base: 12, md: 4 },
      rowSpan: 2,
      props: { label: isZh ? '系统功能介绍' : 'System Features', type: 'primary' }
    },
    {
      id: 'action-help',
      component: 'ActionCard',
      colSpan: { base: 12, md: 4 },
      rowSpan: 2,
      props: { label: isZh ? '使用帮助文档' : 'Help Documentation', type: 'secondary' }
    },
    {
      id: 'action-support',
      component: 'ActionCard',
      colSpan: { base: 12, md: 4 },
      rowSpan: 2,
      props: { label: isZh ? '联系技术支持' : 'Contact Support', type: 'secondary' }
    }
  ];

  const SETTINGS_LAYOUT: DashboardConfig = [
    {
      id: 'page-settings',
      component: 'SettingsPage',
      colSpan: { base: 12, md: 12 },
      props: {}
    }
  ];

  const NOTIFICATIONS_LAYOUT: DashboardConfig = [
    {
      id: 'page-notifications',
      component: 'NotificationsPage',
      colSpan: { base: 12, md: 12 },
      props: {}
    }
  ];

  const IT_SUPPORT_LAYOUT: DashboardConfig = [
    {
      id: 'page-it-support',
      component: 'ITSupportPage',
      colSpan: { base: 12, md: 12 },
      props: {}
    }
  ];

  const HELP_GUIDE_LAYOUT: DashboardConfig = [
    {
      id: 'page-help-guide',
      component: 'HelpGuidePage',
      colSpan: { base: 12, md: 12 },
      props: {}
    }
  ];

  const OVERDUE_LAYOUT: DashboardConfig = [
    {
      id: 'page-overdue',
      component: 'OverduePage',
      colSpan: { base: 12, md: 12 },
      props: {}
    }
  ];

  return {
    '#welcome': WELCOME_LAYOUT,
    '#pending': PENDING_ME_LAYOUT,
    '#submissions': SUBMISSIONS_LAYOUT,
    '#team-subs': CONTACTS_LAYOUT,
    '#settings': SETTINGS_LAYOUT,
    '#notifications': NOTIFICATIONS_LAYOUT,
    '#it-support': IT_SUPPORT_LAYOUT,
    '#help-guide': HELP_GUIDE_LAYOUT,
    '#my-workspace': [
      { id: 'page-my-workspace', component: 'MyWorkspacePage', colSpan: { base: 12, md: 12 }, props: {} }
    ],
    '#my-projects': [
      { id: 'page-my-projects', component: 'MyProjectsPage', colSpan: { base: 12, md: 12 }, props: {} }
    ],
    '#my-todos': [
      { id: 'page-my-todos', component: 'MyTodosPage', colSpan: { base: 12, md: 12 }, props: {} }
    ],
    '#severely-overdue': [
      { id: 'page-severely-overdue', component: 'SeverelyOverduePage', colSpan: { base: 12, md: 12 }, props: {} }
    ],
    '#overdue': OVERDUE_LAYOUT,
    default: []
  };
};
