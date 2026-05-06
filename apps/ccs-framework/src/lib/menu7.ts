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

export const menu7 = (isZh: boolean) => ({
      id: 'L1-7',
      title: isZh ? '成本管理' : 'Cost Management',
      icon: Briefcase,
      seperateLine: ['L2-57'],
      children: [
        {
          id: 'L2-53',
          title: isZh ? '概算管理' : 'Budget Estimation Mgmt',
          icon: LineChart,
          children: [
            { id: 'L3-268', title: isZh ? '概算生成' : 'Estimation Generation', url: '#submissions' },
            { id: 'L3-269', title: isZh ? '发布概算' : 'Publish Estimation', url: '#submissions' },
            { id: 'L3-270', title: isZh ? '基础配置' : 'Basic Configuration', url: '#pending' }
          ]
        },
        {
          id: 'L2-54',
          title: isZh ? '预算管理' : 'Budget Management',
          icon: ClipboardList,
          children: [
            { id: 'L3-271', title: isZh ? '预算生成' : 'Budget Generation', url: '#team-subs' },
            { id: 'L3-272', title: isZh ? '合同清单编制' : 'Contract BOQ Preparation', url: '#overdue' },
            { id: 'L3-273', title: isZh ? '合同包标底' : 'Contract Package Base Price', url: '#it-support' },
            { id: 'L3-274', title: isZh ? '动态成本管理' : 'Dynamic Cost Management', url: '#team-subs' },
            { id: 'L3-275', title: isZh ? '超预算管理' : 'Over-budget Management', url: '#notifications' },
            { id: 'L3-276', title: isZh ? '资金预算预测' : 'Fund Budget Forecasting', url: '#pending' },
            { id: 'L3-277', title: isZh ? '基础配置' : 'Basic Configuration', url: '#severely-overdue' }
          ]
        },
        {
          id: 'L2-55',
          title: isZh ? '核算管理' : 'Accounting Mgmt',
          icon: FileText,
          children: [
            { id: 'L3-278', title: isZh ? '合同查询' : 'Contract Query', url: '#my-todos' },
            { id: 'L3-279', title: isZh ? '保函管理' : 'Guarantee Management', url: '#my-workspace' },
            { id: 'L3-280', title: isZh ? '付款管理' : 'Payment Management', url: '#submissions' },
            { id: 'L3-281', title: isZh ? '变更管理' : 'Change Management', url: '#submissions' },
            { id: 'L3-282', title: isZh ? '扣款管理' : 'Deduction Management', url: '#pending' },
            { id: 'L3-283', title: isZh ? '材料调差' : 'Material Price Adjustment', url: '#team-subs' },
            { id: 'L3-284', title: isZh ? '结算管理' : 'Settlement Management', url: '#overdue' },
            { id: 'L3-285', title: isZh ? '测量师管理' : 'Quantity Surveyor Mgmt', url: '#it-support' },
            { id: 'L3-286', title: isZh ? '形象进度预提' : 'Progress Provisioning', url: '#team-subs' },
            { id: 'L3-287', title: isZh ? '基础配置' : 'Basic Configuration', url: '#notifications' }
          ]
        },
        {
          id: 'L2-56',
          title: isZh ? '决算管理' : 'Final Account Mgmt',
          icon: Folder,
          children: [
            { id: 'L3-288', title: isZh ? '项目转固/决算' : 'Project Capitalization/Final Account', url: '#pending' },
            { id: 'L3-289', title: isZh ? '项目后评价' : 'Post-project Evaluation', url: '#severely-overdue' },
            { id: 'L3-290', title: isZh ? '成本指标入库' : 'Cost Index Repository', url: '#help-guide' },
            { id: 'L3-291', title: isZh ? '基础配置' : 'Basic Configuration', url: '#my-workspace' }
          ]
        },
        {
          id: 'L2-57',
          title: isZh ? '动态成本报告' : 'Dynamic Cost Reports',
          icon: LineChart,
          children: [
            { id: 'L3-292', title: isZh ? '成本管理报告' : 'Cost Management Report', url: '#submissions' },
            { id: 'L3-293', title: isZh ? '风险监控报告' : 'Risk Monitoring Report', url: '#submissions' },
            { id: 'L3-294', title: isZh ? '变更管理报告' : 'Change Management Report', url: '#pending' }
          ]
        },
        {
          id: 'L2-58',
          title: isZh ? '成本资产库' : 'Cost Asset Library',
          icon: Box,
          children: [
            { id: 'L3-295', title: isZh ? '成本指标库' : 'Cost Index Library', url: '#team-subs' },
            { id: 'L3-296', title: isZh ? '成本价格库' : 'Cost Price Database', url: '#overdue' },
            { id: 'L3-297', title: isZh ? '案例库' : 'Case Library', url: '#it-support' }
          ]
        },
        {
          id: 'L2-59',
          title: isZh ? '汇报决策' : 'Reporting & Decision',
          icon: Briefcase,
          children: [
            { id: 'L3-298', title: isZh ? '预决算评审会' : 'Budget/Final Account Review Meeting', url: '#team-subs' },
            { id: 'L3-299', title: isZh ? '造价管理组评审会' : 'Cost Management Group Review', url: '#notifications' }
          ]
        },
        {
          id: 'L2-60',
          title: isZh ? '工具模板库' : 'Tool & Template Library',
          icon: Folder,
          children: [
            { id: 'L3-300', title: isZh ? '作业模板库' : 'Operation Template Library', url: '#pending' },
            { id: 'L3-301', title: isZh ? '清单模板库' : 'BOQ Template Library', url: '#severely-overdue' }
          ]
        },
        {
          id: 'L2-61',
          title: isZh ? '辅助工具' : 'Auxiliary Tools',
          icon: HardHat,
          children: [
            { id: 'L3-302', title: isZh ? '算量软件' : 'Quantity Takeoff Software', url: '#my-todos' },
            { id: 'L3-303', title: isZh ? 'BIM' : 'BIM', url: '#my-workspace' }
          ]
        }
      ]
    })