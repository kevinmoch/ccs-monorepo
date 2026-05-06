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

export const menu5 = (isZh: boolean) => ({
      id: 'L1-5',
      title: isZh ? '验收管理' : 'Acceptance Management',
      icon: Folder,
      seperateLine: ['L2-41'],
      children: [
        {
          id: 'L2-35',
          title: isZh ? '验收策划' : 'Acceptance Planning',
          icon: ClipboardList,
          children: [
            { id: 'L3-207', title: isZh ? '验收计划' : 'Acceptance Plan', url: '#my-workspace' },
            { id: 'L3-208', title: isZh ? '验收内容' : 'Acceptance Content', url: '#submissions' }
          ]
        },
        {
          id: 'L2-36',
          title: isZh ? '承包商自检' : 'Contractor Self-inspection',
          icon: CheckSquare,
          children: [
            { id: 'L3-209', title: isZh ? '实物自检' : 'Physical Self-inspection', url: '#submissions' },
            { id: 'L3-210', title: isZh ? '功能自检' : 'Functional Self-inspection', url: '#pending' }
          ]
        },
        {
          id: 'L2-37',
          title: isZh ? '实物验收' : 'Physical Acceptance',
          icon: Box,
          children: [
            { id: 'L3-211', title: isZh ? '合同/图纸验收' : 'Contract/Drawing Acceptance', url: '#team-subs' },
            { id: 'L3-212', title: isZh ? '变更验收管理' : 'Change Acceptance Mgmt', url: '#overdue' },
            { id: 'L3-213', title: isZh ? '实物验收报告' : 'Physical Acceptance Report', url: '#it-support' }
          ]
        },
        {
          id: 'L2-38',
          title: isZh ? '功能验收' : 'Functional Acceptance',
          icon: Shield,
          children: [
            { id: 'L3-214', title: isZh ? '启动成熟度' : 'Startup Maturity', url: '#team-subs' },
            { id: 'L3-215', title: isZh ? '成熟度评估' : 'Maturity Assessment', url: '#notifications' },
            { id: 'L3-216', title: isZh ? '功能验收' : 'Functional Acceptance', url: '#pending' },
            { id: 'L3-217', title: isZh ? '功能验收报告' : 'Functional Acceptance Report', url: '#severely-overdue' }
          ]
        },
        {
          id: 'L2-39',
          title: isZh ? '问题销项' : 'Issue Resolution',
          icon: Layers,
          children: [
            { id: 'L3-218', title: isZh ? '问题销项' : 'Issue Resolution', url: '#help-guide' },
            { id: 'L3-219', title: isZh ? '问题管理' : 'Issue Management', url: '#my-workspace' }
          ]
        },
        {
          id: 'L2-40',
          title: isZh ? '验收移交' : 'Acceptance Handover',
          icon: FileText,
          children: [
            { id: 'L3-220', title: isZh ? '验收移交进展' : 'Handover Progress', url: '#submissions' },
            { id: 'L3-221', title: isZh ? '承包商移交' : 'Contractor Handover', url: '#submissions' },
            { id: 'L3-222', title: isZh ? '项目移交会签' : 'Project Handover Co-signing', url: '#pending' },
            { id: 'L3-223', title: isZh ? '工程保修' : 'Engineering Warranty', url: '#team-subs' },
            { id: 'L3-224', title: isZh ? '物业前期介入' : 'Property Pre-intervention', url: '#overdue' },
            { id: 'L3-225', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#it-support' }
          ]
        },
        {
          id: 'L2-41',
          title: isZh ? '标准文件' : 'Standard Documents',
          icon: Folder,
          children: [
            { id: 'L3-226', title: isZh ? '材料验收标准' : 'Material Acceptance Standards', url: '#team-subs' },
            { id: 'L3-227', title: isZh ? 'A 类问题标准库' : 'Class A Issue Standards Library', url: '#notifications' },
            { id: 'L3-228', title: isZh ? '工艺验收标准' : 'Process Acceptance Standards', url: '#pending' },
            { id: 'L3-229', title: isZh ? '验收纲要库' : 'Acceptance Outline Library', url: '#severely-overdue' },
            { id: 'L3-230', title: isZh ? '功能验收标准' : 'Functional Acceptance Standards', url: '#my-todos' },
            { id: 'L3-231', title: isZh ? '成熟度评估表' : 'Maturity Assessment Form', url: '#my-workspace' }
          ]
        },
        {
          id: 'L2-42',
          title: isZh ? '资料库' : 'Document Library',
          icon: Users,
          children: [
            { id: 'L3-232', title: isZh ? '法律法规' : 'Laws & Regulations', url: '#submissions' },
            { id: 'L3-233', title: isZh ? '规范图集' : 'Code Atlases', url: '#submissions' },
            { id: 'L3-234', title: isZh ? '合同查询' : 'Contract Query', url: '#pending' },
            { id: 'L3-235', title: isZh ? '图纸查询' : 'Drawing Query', url: '#team-subs' }
          ]
        },
        {
          id: 'L2-43',
          title: isZh ? '辅助验收' : 'Auxiliary Acceptance',
          icon: HardHat,
          children: [
            { id: 'L3-236', title: isZh ? 'AI 防伪' : 'AI Anti-counterfeiting', url: '#overdue' },
            { id: 'L3-237', title: isZh ? '智慧验收' : 'Smart Acceptance', url: '#it-support' }
          ]
        }
      ]
    })