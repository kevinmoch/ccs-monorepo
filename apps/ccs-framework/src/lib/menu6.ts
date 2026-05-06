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

export const menu6 = (isZh: boolean) => ({
      id: 'L1-6',
      title: isZh ? 'EHS管理' : 'EHS Management',
      icon: Users,
      seperateLine: ['L2-50'],
      children: [
        {
          id: 'L2-44',
          title: isZh ? '策划&方案' : 'Planning & Schemes',
          icon: PencilRuler,
          children: [
            { id: 'L3-238', title: isZh ? '安全策划' : 'Safety Planning', url: '#team-subs' },
            { id: 'L3-239', title: isZh ? '安全方案' : 'Safety Schemes', url: '#notifications' },
            { id: 'L3-240', title: isZh ? '安全策划项目及合同' : 'Safety Planning Projects & Contracts', url: '#pending' }
          ]
        },
        {
          id: 'L2-45',
          title: isZh ? '安全培训' : 'Safety Training',
          icon: ClipboardList,
          children: [
            { id: 'L3-241', title: isZh ? '交底培训' : 'Briefing Training', url: '#severely-overdue' },
            { id: 'L3-242', title: isZh ? '安全考试' : 'Safety Examination', url: '#my-todos' }
          ]
        },
        {
          id: 'L2-46',
          title: isZh ? '安全验收' : 'Safety Acceptance',
          icon: CheckSquare,
          children: [
            { id: 'L3-243', title: isZh ? '安全事项验收' : 'Safety Item Acceptance', url: '#my-workspace' },
            { id: 'L3-244', title: isZh ? '危险作业验收' : 'Hazardous Operation Acceptance', url: '#submissions' },
            { id: 'L3-245', title: isZh ? '机械设备验收' : 'Machinery & Equipment Acceptance', url: '#submissions' },
            { id: 'L3-246', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#pending' }
          ]
        },
        {
          id: 'L2-47',
          title: isZh ? '安全检查' : 'Safety Inspection',
          icon: Shield,
          children: [
            { id: 'L3-247', title: isZh ? '承包商检查' : 'Contractor Inspection', url: '#team-subs' },
            { id: 'L3-248', title: isZh ? '监理检查' : 'Supervision Inspection', url: '#overdue' },
            { id: 'L3-249', title: isZh ? '业主检查' : 'Owner Inspection', url: '#it-support' }
          ]
        },
        {
          id: 'L2-48',
          title: isZh ? '问题管理' : 'Issue Management',
          icon: Layers,
          children: [
            { id: 'L3-250', title: isZh ? '巡检问题录入' : 'Inspection Issue Entry', url: '#team-subs' },
            { id: 'L3-251', title: isZh ? '问题销项管理' : 'Issue Resolution Mgmt', url: '#notifications' },
            { id: 'L3-252', title: isZh ? '安全违约处理' : 'Safety Breach Handling', url: '#pending' }
          ]
        },
        {
          id: 'L2-49',
          title: isZh ? '人员&设备管理' : 'Personnel & Equipment Mgmt',
          icon: Users,
          children: [
            { id: 'L3-253', title: isZh ? '安全监理人员' : 'Safety Supervision Personnel', url: '#severely-overdue' },
            { id: 'L3-254', title: isZh ? '安全管理人员' : 'Safety Management Personnel', url: '#my-todos' },
            { id: 'L3-255', title: isZh ? '特种作业人员' : 'Special Operation Personnel', url: '#my-workspace' },
            { id: 'L3-256', title: isZh ? '施工人员' : 'Construction Personnel', url: '#submissions' },
            { id: 'L3-257', title: isZh ? '设备车辆' : 'Equipment & Vehicles', url: '#submissions' },
            { id: 'L3-258', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#pending' }
          ]
        },
        {
          id: 'L2-50',
          title: isZh ? '标准文件' : 'Standard Documents',
          icon: Folder,
          children: [
            { id: 'L3-259', title: isZh ? '静态风险标准库' : 'Static Risk Standards Library', url: '#team-subs' },
            { id: 'L3-260', title: isZh ? '策划模版库' : 'Planning Template Library', url: '#overdue' },
            { id: 'L3-261', title: isZh ? '动态风险标准库' : 'Dynamic Risk Standards Library', url: '#it-support' },
            { id: 'L3-262', title: isZh ? '方案模版库' : 'Scheme Template Library', url: '#team-subs' }
          ]
        },
        {
          id: 'L2-51',
          title: isZh ? '资料库' : 'Document Library',
          icon: FileText,
          children: [
            { id: 'L3-263', title: isZh ? '法律法规' : 'Laws & Regulations', url: '#notifications' },
            { id: 'L3-264', title: isZh ? '安全培训资料库' : 'Safety Training Library', url: '#pending' },
            { id: 'L3-265', title: isZh ? '合同查询' : 'Contract Query', url: '#severely-overdue' }
          ]
        },
        {
          id: 'L2-52',
          title: isZh ? '智慧监控' : 'Smart Monitoring',
          icon: HardHat,
          children: [
            { id: 'L3-266', title: isZh ? '数字化监控中心' : 'Digital Monitoring Center', url: '#help-guide' },
            { id: 'L3-267', title: isZh ? '安全简报' : 'Safety Briefing', url: '#my-workspace' }
          ]
        }
      ]
    })