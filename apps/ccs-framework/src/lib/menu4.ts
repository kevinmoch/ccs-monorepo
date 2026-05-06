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

export const menu4 = (isZh: boolean) => ({
      id: 'L1-4',
      title: isZh ? '采购管理' : 'Procurement Management',
      icon: Shield,
      seperateLine: ['L2-34'],
      children: [
        {
          id: 'L2-32',
          title: isZh ? '采购作业平台' : 'Procurement Operation Platform',
          icon: ClipboardList,
          children: [
            {
              id: 'L3-197',
              title: isZh ? '供应商认证' : 'Supplier Certification',
              icon: CheckSquare,
              children: [
                { id: 'L4-544', title: isZh ? '品类管理' : 'Category Management', url: '#team-subs' },
                { id: 'L4-545', title: isZh ? '资源池认证' : 'Resource Pool Certification', url: '#it-support' },
                { id: 'L4-546', title: isZh ? '材料品牌认证' : 'Material Brand Certification', url: '#overdue' }
              ]
            },
            {
              id: 'L3-198',
              title: isZh ? '供应商选择' : 'Supplier Selection',
              icon: Users,
              children: [
                { id: 'L4-547', title: isZh ? '常规采购' : 'Regular Procurement', url: '#notifications' },
                { id: 'L4-548', title: isZh ? '框架分单' : 'Framework Allocation', url: '#pending' },
                { id: 'L4-549', title: isZh ? '框架采购' : 'Framework Procurement', url: '#severely-overdue' },
                { id: 'L4-550', title: isZh ? '紧急采购' : 'Emergency Procurement', url: '#my-todos' },
                { id: 'L4-551', title: isZh ? '简易采购' : 'Simplified Procurement', url: '#my-workspace' },
                { id: 'L4-552', title: isZh ? '甲指乙供联络函' : 'Party A Designated Party B Supply Letter', url: '#submissions' }
              ]
            },
            {
              id: 'L3-199',
              title: isZh ? '合同签署' : 'Contract Signing',
              icon: FileText,
              children: [
                { id: 'L4-553', title: isZh ? '项目合同框架' : 'Project Contract Framework', url: '#submissions' },
                { id: 'L4-554', title: isZh ? '合同签署' : 'Contract Signing', url: '#pending' },
                { id: 'L4-555', title: isZh ? '合同拟制' : 'Contract Drafting', url: '#team-subs' },
                { id: 'L4-556', title: isZh ? '合同注册' : 'Contract Registration', url: '#overdue' },
                { id: 'L4-557', title: isZh ? '合同评审' : 'Contract Review', url: '#it-support' },
                { id: 'L4-558', title: isZh ? '合同交底' : 'Contract Briefing', url: '#team-subs' }
              ]
            }
          ]
        },
        {
          id: 'L2-33',
          title: isZh ? '采购运营平台' : 'Procurement Operation Platform',
          icon: LineChart,
          children: [
            {
              id: 'L3-200',
              title: isZh ? '采购运作管理' : 'Procurement Operations Mgmt',
              icon: ClipboardList,
              children: [
                { id: 'L4-559', title: isZh ? '采购模板库' : 'Procurement Template Library', url: '#notifications' },
                { id: 'L4-560', title: isZh ? '风险预警管理' : 'Risk Warning Mgmt', url: '#pending' },
                { id: 'L4-561', title: isZh ? '运营数据管理' : 'Operation Data Mgmt', url: '#severely-overdue' },
                { id: 'L4-562', title: isZh ? '报表分析' : 'Report Analysis', url: '#help-guide' }
              ]
            },
            {
              id: 'L3-201',
              title: isZh ? '采购计划管理' : 'Procurement Plan Mgmt',
              icon: Clock,
              children: [
                { id: 'L4-563', title: isZh ? '供应商认证计划' : 'Supplier Certification Plan', url: '#my-workspace' },
                { id: 'L4-564', title: isZh ? '招标采购计划' : 'Bidding Procurement Plan', url: '#submissions' },
                { id: 'L4-565', title: isZh ? '品牌认证计划' : 'Brand Certification Plan', url: '#submissions' }
              ]
            },
            {
              id: 'L3-202',
              title: isZh ? '采购会议决策' : 'Procurement Meeting Decisions',
              icon: Briefcase,
              children: [
                { id: 'L4-566', title: isZh ? '采购管理委员会' : 'Procurement Management Committee', url: '#pending' },
                { id: 'L4-567', title: isZh ? '专家团分会' : 'Expert Panel Branch', url: '#team-subs' },
                { id: 'L4-568', title: isZh ? '商务评审会' : 'Commercial Review Meeting', url: '#overdue' },
                { id: 'L4-569', title: isZh ? '其他采购业务决策会议' : 'Other Procurement Decision Meetings', url: '#it-support' },
                { id: 'L4-570', title: isZh ? 'CEG办公会' : 'CEG Office Meeting', url: '#team-subs' }
              ]
            }
          ]
        },
        {
          id: 'L2-34',
          title: isZh ? '采购能力平台' : 'Procurement Capability Platform',
          icon: Box,
          children: [
            {
              id: 'L3-203',
              title: isZh ? '供应商管理' : 'Supplier Management',
              icon: Users,
              children: [
                { id: 'L4-571', title: isZh ? '标签管理' : 'Tag Management', url: '#notifications' },
                { id: 'L4-572', title: isZh ? '团队管理' : 'Team Management', url: '#pending' },
                { id: 'L4-573', title: isZh ? '关键事件' : 'Key Events', url: '#severely-overdue' },
                { id: 'L4-574', title: isZh ? '绩效管理' : 'Performance Mgmt', url: '#my-todos' },
                { id: 'L4-575', title: isZh ? '组合管理' : 'Portfolio Management', url: '#my-workspace' },
                { id: 'L4-576', title: isZh ? '风险管理' : 'Risk Management', url: '#submissions' },
                { id: 'L4-577', title: isZh ? '供应商履历' : 'Supplier History', url: '#submissions' }
              ]
            },
            {
              id: 'L3-204',
              title: isZh ? '采购资源管理' : 'Procurement Resource Mgmt',
              icon: Folder,
              children: [
                { id: 'L4-578', title: isZh ? '供应商资源池' : 'Supplier Resource Pool', url: '#pending' },
                { id: 'L4-579', title: isZh ? '材料管理' : 'Material Management', url: '#team-subs' },
                { id: 'L4-580', title: isZh ? '货架管理' : 'Shelf Management', url: '#overdue' }
              ]
            },
            {
              id: 'L3-205',
              title: isZh ? '合同管理' : 'Contract Management',
              icon: FileText,
              children: [
                { id: 'L4-581', title: isZh ? '合约规划管理' : 'Contract Planning Mgmt', url: '#it-support' },
                { id: 'L4-582', title: isZh ? '订单管理' : 'Order Management', url: '#team-subs' },
                { id: 'L4-583', title: isZh ? '合同模板管理' : 'Contract Template Mgmt', url: '#notifications' }
              ]
            },
            {
              id: 'L3-206',
              title: isZh ? '采购成本管理' : 'Procurement Cost Management',
              icon: Briefcase,
              children: [
                { id: 'L4-584', title: isZh ? '标准清单库' : 'Standard Checklist Library', url: '#pending' },
                { id: 'L4-585', title: isZh ? '价格数据库' : 'Price Database', url: '#severely-overdue' }
              ]
            }
          ]
        }
      ]
    })