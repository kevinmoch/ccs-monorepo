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

export const menu1 = (isZh: boolean) => ({
      id: 'L1-1',
      title: isZh ? '投资立项管理' : 'Investment Initiation',
      icon: HardHat,
      seperateLine: ['L2-3'],
      children: [
        {
          id: 'L2-1',
          title: isZh ? '国有投资项目' : 'State-owned Investment Projects',
          icon: Layers,
          children: [
            {
              id: 'L3-1',
              title: isZh ? '项目立项' : 'Project Initiation',
              icon: FileSignature,
              children: [
                {
                  id: 'L4-1',
                  title: isZh ? '创建立项' : 'Create Project',
                  url: '#submenu',
                  children: [
                    { id: 'M1-Sub-1', title: isZh ? '预立项' : 'Pre-Initiation', url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=hw_preprojectinitiation&pkId=2455254662123664384' },
                    {
                      id: 'M1-Sub-2',
                      title: isZh ? '土地购买审批' : 'Land Purchase Approval',
                      url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=hw_projectinilandpurchase&pkId=2455258931623115776'
                    },
                    {
                      id: 'M1-Sub-3',
                      title: isZh ? '土地信息录入' : 'Land Information Entry',
                      url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=bos_list&billFormId=hw_landpurchase_alist&type=list&projectid=2455258360879040512&reportid=2455262077183388672'
                    },
                    {
                      id: 'M1-Sub-4',
                      title: isZh ? '设计需求' : 'Design Requirements',
                      url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=bos_list&billFormId=hw_design_needs_win&type=list&projectReportId=2455262077183388672'
                    },
                    {
                      id: 'M1-Sub-5',
                      title: isZh ? '开工立项' : 'Project Commencement',
                      url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=hw_projectreport&pkId=2455262077183388672&nothighlight=Y'
                    }
                  ]
                },
                { id: 'L4-2', title: isZh ? '项目建议书' : 'Project Proposal', url: '#submissions' },
                { id: 'L4-3', title: isZh ? '窗口指导' : 'Window Guidance', url: '#submissions' },
                { id: 'L4-4', title: isZh ? '节能批复' : 'Energy Saving Approval', url: '#my-workspace' },
                { id: 'L4-5', title: isZh ? '空间认证' : 'Space Certification', url: '#pending' },
                { id: 'L4-6', title: isZh ? '立项批复' : 'Initiation Approval', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-2',
              title: isZh ? '土地手续' : 'Land Procedures',
              icon: Map,
              children: [
                { id: 'L4-7', title: isZh ? '规划调整' : 'Planning Adjustment', url: '#my-todos' },
                { id: 'L4-8', title: isZh ? '土地调查' : 'Land Survey', url: '#team-subs' },
                { id: 'L4-9', title: isZh ? '选址意见书' : 'Site Selection Opinion', url: '#overdue' },
                { id: 'L4-10', title: isZh ? '用地划拨决定书' : 'Land Allocation Decision', url: '#it-support' },
                { id: 'L4-11', title: isZh ? '土地合同' : 'Land Contract', url: '#team-subs' },
                { id: 'L4-12', title: isZh ? '用地规划许可证' : 'Planning Permit', url: '#notifications' },
                { id: 'L4-13', title: isZh ? '契税印花税完税证明' : 'Tax Payment Proof', url: '#my-workspace' },
                { id: 'L4-14', title: isZh ? '不动产权证（土地）' : 'Land Property Certificate', url: '#pending' }
              ]
            },
            {
              id: 'L3-3',
              title: isZh ? '可研批复' : 'Feasibility Approval',
              icon: Stamp,
              children: [
                { id: 'L4-15', title: isZh ? '可行性研究报告' : 'Feasibility Report', url: '#submissions' },
                { id: 'L4-16', title: isZh ? '水土保持评估' : 'Soil & Water Conservation', url: '#submissions' },
                { id: 'L4-17', title: isZh ? '环境影响评估' : 'Environmental Impact', url: '#pending' },
                { id: 'L4-18', title: isZh ? '交通影响评估' : 'Traffic Impact Assessment', url: '#help-guide' },
                { id: 'L4-19', title: isZh ? '其他专项评估' : 'Other Special Assessments', url: '#severely-overdue' },
                { id: 'L4-20', title: isZh ? '可研批复' : 'Feasibility Approval', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-4',
              title: isZh ? '概算批复' : 'Budget Approval',
              icon: PiggyBank,
              children: [
                { id: 'L4-21', title: isZh ? '施工图联审' : 'Joint Drawing Review', url: '#team-subs' },
                { id: 'L4-22', title: isZh ? '评审中心评审' : 'Review Center Assessment', url: '#overdue' },
                { id: 'L4-23', title: isZh ? '概算批复' : 'Budget Approval', url: '#it-support' }
              ]
            },
            {
              id: 'L3-5',
              title: isZh ? '设计报批' : 'Design Submission',
              icon: PencilRuler,
              children: [
                { id: 'L4-24', title: isZh ? '规划方案报批' : 'Planning Scheme Approval', url: '#team-subs' },
                { id: 'L4-25', title: isZh ? '初步设计报批' : 'Preliminary Design Approval', url: '#notifications' },
                { id: 'L4-26', title: isZh ? '施工图审图' : 'Construction Drawing Review', url: '#pending' },
                { id: 'L4-27', title: isZh ? '工程规划许可证' : 'Engineering Planning Permit', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-6',
              title: isZh ? '施工报建' : 'Construction Permitting',
              icon: Hammer,
              children: [
                { id: 'L4-28', title: isZh ? '专项审查' : 'Special Review', url: '#my-todos' },
                { id: 'L4-29', title: isZh ? '招投标备案' : 'Bidding Filing', url: '#submissions' },
                { id: 'L4-30', title: isZh ? '质安监手续' : 'Quality & Safety Supervision', url: '#submissions' },
                { id: 'L4-31', title: isZh ? '施工许可证' : 'Construction Permit', url: '#pending' },
                { id: 'L4-32', title: isZh ? '其他行政许可' : 'Other Administrative Permits', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-7',
              title: isZh ? '市政接驳' : 'Municipal Connection',
              icon: Truck,
              children: [
                { id: 'L4-33', title: isZh ? '临时市政接驳' : 'Temporary Municipal Connection', url: '#team-subs' },
                { id: 'L4-34', title: isZh ? '正式市政接驳' : 'Formal Municipal Connection', url: '#overdue' },
                { id: 'L4-35', title: isZh ? '出入口开办' : 'Entrance/Exit Opening', url: '#it-support' },
                { id: 'L4-36', title: isZh ? '市政道路' : 'Municipal Roads', url: '#team-subs' },
                { id: 'L4-37', title: isZh ? '园林景观' : 'Landscaping & Gardens', url: '#notifications' }
              ]
            },
            {
              id: 'L3-8',
              title: isZh ? '竣工验收' : 'Completion Acceptance',
              icon: CheckCircle2,
              children: [
                { id: 'L4-38', title: isZh ? '消防验收' : 'Fire Safety Inspection', url: '#pending' },
                { id: 'L4-39', title: isZh ? '规划验收' : 'Planning Acceptance', url: '#severely-overdue' },
                { id: 'L4-40', title: isZh ? '人防验收' : 'Civil Air Defense Inspection', url: '#help-guide' },
                { id: 'L4-41', title: isZh ? '档案验收' : 'Archive Acceptance', url: '#my-workspace' },
                { id: 'L4-42', title: isZh ? '竣工验收' : 'Completion Acceptance', url: '#submissions' },
                { id: 'L4-43', title: isZh ? '联合验收' : 'Joint Inspection', url: '#submissions' },
                { id: 'L4-44', title: isZh ? '其他验收' : 'Other Inspections', url: '#pending' },
                { id: 'L4-45', title: isZh ? '竣工测绘' : 'As-built Surveying', url: '#team-subs' },
                { id: 'L4-46', title: isZh ? '竣工备案' : 'Completion Filing', url: '#overdue' }
              ]
            },
            {
              id: 'L3-9',
              title: isZh ? '不动产权证' : 'Property Certificate',
              icon: Landmark,
              children: [
                { id: 'L4-47', title: isZh ? '房产测绘' : 'Real Estate Surveying', url: '#it-support' },
                { id: 'L4-48', title: isZh ? '不动产权证（房产）' : 'Property Certificate (Building)', url: '#team-subs' }
              ]
            },
            {
              id: 'L3-10',
              title: isZh ? '财政审查' : 'Financial Review',
              icon: Receipt,
              children: [{ id: 'L4-49', title: isZh ? '财政审查' : 'Financial Review', url: '#notifications' }]
            }
          ]
        },
        {
          id: 'L2-2',
          title: isZh ? '社会投资项目' : 'Social Investment Projects',
          icon: HardHat,
          children: [
            {
              id: 'L3-11',
              title: isZh ? '项目立项' : 'Project Initiation',
              icon: FileSignature,
              children: [
                { id: 'L4-50', title: isZh ? '创建立项' : 'Create Project', url: '#pending' },
                { id: 'L4-51', title: isZh ? '窗口指导（如有）' : 'Window Guidance (If Any)', url: '#submissions' },
                { id: 'L4-52', title: isZh ? '立项备案' : 'Initiation Filing', url: '#submissions' }
              ]
            },
            {
              id: 'L3-12',
              title: isZh ? '选址购地' : 'Site Selection & Purchase',
              icon: Map,
              children: [
                { id: 'L4-53', title: isZh ? '选址确认' : 'Site Confirmation', url: '#my-workspace' },
                { id: 'L4-54', title: isZh ? '投资协议' : 'Investment Agreement', url: '#pending' },
                { id: 'L4-55', title: isZh ? '土地招拍挂/协议出让' : 'Land Bidding/Auction/Agreement', url: '#severely-overdue' },
                { id: 'L4-56', title: isZh ? '土地合同' : 'Land Contract', url: '#my-todos' },
                { id: 'L4-57', title: isZh ? '建设用地规划许可证' : 'Construction Land Permit', url: '#team-subs' },
                { id: 'L4-58', title: isZh ? '交地确认' : 'Land Handover Confirmation', url: '#overdue' },
                { id: 'L4-59', title: isZh ? '不动产权证（土地）' : 'Land Property Certificate', url: '#it-support' }
              ]
            },
            {
              id: 'L3-13',
              title: isZh ? '顾问报告' : 'Consulting Reports',
              icon: BookOpen,
              children: [
                { id: 'L4-60', title: isZh ? '水土保持评估' : 'Soil & Water Conservation', url: '#team-subs' },
                { id: 'L4-61', title: isZh ? '环境影响评估' : 'Environmental Impact', url: '#notifications' },
                { id: 'L4-62', title: isZh ? '交通影响评估' : 'Traffic Impact Assessment', url: '#pending' },
                { id: 'L4-63', title: isZh ? '节能报告评估' : 'Energy Saving Report', url: '#severely-overdue' },
                { id: 'L4-64', title: isZh ? '其他专项评估' : 'Other Special Assessments', url: '#help-guide' }
              ]
            },
            {
              id: 'L3-14',
              title: isZh ? '设计报批' : 'Design Submission',
              icon: PencilRuler,
              children: [
                { id: 'L4-65', title: isZh ? '方案总图报批' : 'Master Plan Approval', url: '#my-workspace' },
                { id: 'L4-66', title: isZh ? '施工图审图' : 'Construction Drawing Review', url: '#submissions' },
                { id: 'L4-67', title: isZh ? '建设工程规划许可证' : 'Construction Planning Permit', url: '#submissions' },
                { id: 'L4-68', title: isZh ? '配套费缴纳' : 'Supporting Fee Payment', url: '#pending' }
              ]
            },
            {
              id: 'L3-15',
              title: isZh ? '施工报建' : 'Construction Permitting',
              icon: Hammer,
              children: [
                { id: 'L4-69', title: isZh ? '专项审查' : 'Special Review', url: '#team-subs' },
                { id: 'L4-70', title: isZh ? '招投标备案' : 'Bidding Filing', url: '#overdue' },
                { id: 'L4-71', title: isZh ? '质安监手续' : 'Quality & Safety Supervision', url: '#it-support' },
                { id: 'L4-72', title: isZh ? '施工许可证' : 'Construction Permit', url: '#team-subs' },
                { id: 'L4-73', title: isZh ? '其他行政许可' : 'Other Administrative Permits', url: '#notifications' }
              ]
            },
            {
              id: 'L3-16',
              title: isZh ? '市政接驳' : 'Municipal Connection',
              icon: Truck,
              children: [
                { id: 'L4-74', title: isZh ? '临时市政接驳' : 'Temporary Municipal Connection', url: '#pending' },
                { id: 'L4-75', title: isZh ? '正式市政接驳' : 'Formal Municipal Connection', url: '#severely-overdue' },
                { id: 'L4-76', title: isZh ? '出入口开办' : 'Entrance/Exit Opening', url: '#my-todos' },
                { id: 'L4-77', title: isZh ? '市政道路' : 'Municipal Roads', url: '#my-workspace' },
                { id: 'L4-78', title: isZh ? '园林景观' : 'Landscaping & Gardens', url: '#submissions' }
              ]
            },
            {
              id: 'L3-17',
              title: isZh ? '竣工验收' : 'Completion Acceptance',
              icon: CheckCircle2,
              children: [
                { id: 'L4-79', title: isZh ? '消防验收' : 'Fire Safety Inspection', url: '#submissions' },
                { id: 'L4-80', title: isZh ? '规划验收' : 'Planning Acceptance', url: '#pending' },
                { id: 'L4-81', title: isZh ? '人防验收' : 'Civil Air Defense Inspection', url: '#team-subs' },
                { id: 'L4-82', title: isZh ? '档案验收' : 'Archive Acceptance', url: '#overdue' },
                { id: 'L4-83', title: isZh ? '竣工验收' : 'Completion Acceptance', url: '#it-support' },
                { id: 'L4-84', title: isZh ? '联合验收' : 'Joint Inspection', url: '#team-subs' },
                { id: 'L4-85', title: isZh ? '其他验收' : 'Other Inspections', url: '#notifications' },
                { id: 'L4-86', title: isZh ? '竣工测绘' : 'As-built Surveying', url: '#pending' },
                { id: 'L4-87', title: isZh ? '竣工备案' : 'Completion Filing', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-18',
              title: isZh ? '不动产权证' : 'Property Certificate',
              icon: Landmark,
              children: [{ id: 'L4-88', title: isZh ? '不动产权证（房产）' : 'Property Certificate (Building)', url: '#help-guide' }]
            }
          ]
        },
        {
          id: 'L2-3',
          title: isZh ? '工具库' : 'Tool Library',
          icon: Folder,
          children: [
            { id: 'L3-19', title: isZh ? '政策规范查询' : 'Policy & Regulation Query', url: '#my-workspace' },
            { id: 'L3-20', title: isZh ? '模板&规程' : 'Templates & Procedures', url: '#notifications' },
            { id: 'L3-21', title: isZh ? '操作指导书' : 'Operation Manuals', url: '#it-support' },
            { id: 'L3-22', title: isZh ? '用地及规划要素清单' : 'Land & Planning Elements Checklist', url: '#team-subs' }
          ]
        },
        {
          id: 'L2-4',
          title: isZh ? '运营看板' : 'Operation Dashboard',
          icon: PieChart,
          children: [
            { id: 'L3-23', title: isZh ? '风险合规管控' : 'Risk & Compliance Control', url: '#pending' },
            { id: 'L3-24', title: isZh ? '资金概算管控' : 'Fund Budget Control', url: '#severely-overdue' },
            { id: 'L3-25', title: isZh ? '报建节点管控' : 'Permitting Node Control', url: '#my-todos' },
            { id: 'L3-26', title: isZh ? '周报/月报' : 'Weekly/Monthly Reports', url: '#my-workspace' }
          ]
        },
        {
          id: 'L2-5',
          title: isZh ? '批复文档管理' : 'Approval Doc Management',
          icon: FileText,
          children: [
            { id: 'L3-27', title: isZh ? '归档管理' : 'Archiving Mgmt', url: '#submissions' },
            { id: 'L3-28', title: isZh ? '借阅管理' : 'Borrowing Mgmt', url: '#submissions' }
          ]
        }
      ]
    })