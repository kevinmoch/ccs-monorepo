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

export const menu3 = (isZh: boolean) => ({
      id: 'L1-3',
      title: isZh ? '工程管理' : 'Engineering Management',
      icon: Briefcase,
      seperateLine: ['L2-29'],
      children: [
        {
          id: 'L2-16',
          title: isZh ? '项目启动' : 'Project Kickoff',
          icon: Clock,
          children: [
            { id: 'L3-129', title: isZh ? '开工审批' : 'Commencement Approval', url: '#pending' },
            { id: 'L3-130', title: isZh ? '组建项目团队' : 'Team Formation', url: '#submissions' },
            { id: 'L3-131', title: isZh ? '项目策划' : 'Project Planning', url: '#submissions' },
            { id: 'L3-132', title: isZh ? '合同交底' : 'Contract Briefing', url: '#my-workspace' },
            { id: 'L3-133', title: isZh ? '图纸交底' : 'Drawing Briefing', url: '#pending' },
            { id: 'L3-134', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#severely-overdue' }
          ]
        },
        {
          id: 'L2-17',
          title: isZh ? '计划管理' : 'Schedule Management',
          icon: LineChart,
          children: [
            { id: 'L3-135', title: isZh ? '一/二/三级计划' : 'Level 1/2/3 Schedules', url: '#help-guide' },
            { id: 'L3-136', title: isZh ? '作战地图' : 'Battle Map', url: '#my-workspace' },
            { id: 'L3-137', title: isZh ? '材料计划' : 'Material Plan', url: '#submissions' },
            { id: 'L3-138', title: isZh ? '劳动力计划' : 'Labor Plan', url: '#submissions' },
            { id: 'L3-139', title: isZh ? '工作面移交计划' : 'Workface Handover Plan', url: '#pending' },
            { id: 'L3-140', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#team-subs' }
          ]
        },
        {
          id: 'L2-18',
          title: isZh ? '质量管理' : 'Quality Management',
          icon: Shield,
          children: [
            { id: 'L3-141', title: isZh ? '质量策划' : 'Quality Planning', url: '#overdue' },
            { id: 'L3-142', title: isZh ? '材料管理' : 'Material Mgmt', url: '#it-support' },
            { id: 'L3-143', title: isZh ? '质量检查' : 'Quality Inspection', url: '#team-subs' },
            { id: 'L3-144', title: isZh ? '质量验收' : 'Quality Acceptance', url: '#notifications' },
            { id: 'L3-145', title: isZh ? '问题管理' : 'Issue Management', url: '#pending' },
            { id: 'L3-146', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#severely-overdue' }
          ]
        },
        {
          id: 'L2-19',
          title: isZh ? '安全管理' : 'Safety Management',
          icon: HardHat,
          children: [
            { id: 'L3-147', title: isZh ? '安全策划' : 'Safety Planning', url: '#my-todos' },
            { id: 'L3-148', title: isZh ? '交底赋能' : 'Briefing & Empowerment', url: '#my-workspace' },
            { id: 'L3-149', title: isZh ? '安全验收' : 'Safety Acceptance', url: '#submissions' },
            { id: 'L3-150', title: isZh ? '安全巡检' : 'Safety Inspection', url: '#submissions' }
          ]
        },
        {
          id: 'L2-20',
          title: isZh ? '变更管理' : 'Change Management',
          icon: PencilRuler,
          children: [
            { id: 'L3-151', title: isZh ? '指令性变更' : 'Directive Changes', url: '#pending' },
            { id: 'L3-152', title: isZh ? '暂定数量' : 'Provisional Quantities', url: '#team-subs' },
            { id: 'L3-153', title: isZh ? '暂定金额' : 'Provisional Sums', url: '#overdue' },
            { id: 'L3-154', title: isZh ? '用户需求' : 'User Requirements', url: '#it-support' },
            { id: 'L3-155', title: isZh ? '甲指乙供联络函' : 'Party A Designated Party B Supply Letter', url: '#team-subs' },
            { id: 'L3-156', title: isZh ? '分岐处理' : 'Discrepancy Handling', url: '#notifications' }
          ]
        },
        {
          id: 'L2-21',
          title: isZh ? '验收移交' : 'Acceptance & Handover',
          icon: CheckSquare,
          children: [
            { id: 'L3-157', title: isZh ? '验收策划' : 'Acceptance Planning', url: '#pending' },
            { id: 'L3-158', title: isZh ? '承包商自检' : 'Contractor Self-inspection', url: '#severely-overdue' },
            { id: 'L3-159', title: isZh ? '实物验收' : 'Physical Acceptance', url: '#help-guide' },
            { id: 'L3-160', title: isZh ? '功能验收' : 'Functional Acceptance', url: '#my-workspace' },
            { id: 'L3-161', title: isZh ? '问题销项' : 'Issue Resolution', url: '#submissions' },
            { id: 'L3-162', title: isZh ? '项目移交' : 'Project Handover', url: '#submissions' }
          ]
        },
        {
          id: 'L2-22',
          title: isZh ? '供应商评价' : 'Supplier Evaluation',
          icon: Users,
          children: [
            { id: 'L3-163', title: isZh ? '供应商绩效考核' : 'Supplier Performance Assessment', url: '#pending' },
            { id: 'L3-164', title: isZh ? '供应商关键事件管理' : 'Key Event Management', url: '#team-subs' }
          ]
        },
        {
          id: 'L2-23',
          title: isZh ? '风险管理' : 'Risk Management',
          icon: Box,
          children: [
            { id: 'L3-165', title: isZh ? '风险策划' : 'Risk Planning', url: '#overdue' },
            { id: 'L3-166', title: isZh ? '风险识别/应对/闭环' : 'Identify/Respond/Closed-loop', url: '#it-support' },
            { id: 'L3-167', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#team-subs' }
          ]
        },
        {
          id: 'L2-24',
          title: isZh ? '供应商管理' : 'Supplier Management',
          icon: Folder,
          children: [
            { id: 'L3-168', title: isZh ? '供应商日常激励与处罚' : 'Daily Incentives & Penalties', url: '#notifications' },
            { id: 'L3-169', title: isZh ? '问题约谈管理' : 'Issue Interview Management', url: '#pending' },
            { id: 'L3-170', title: isZh ? '核心人员考勤管理' : 'Core Personnel Attendance', url: '#severely-overdue' },
            { id: 'L3-171', title: isZh ? '监理管理' : 'Supervision Mgmt', url: '#my-todos' },
            { id: 'L3-172', title: isZh ? '监理档案库' : 'Supervision Archive Library', url: '#my-workspace' },
            { id: 'L3-173', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#submissions' }
          ]
        },
        {
          id: 'L2-25',
          title: isZh ? '文档管理' : 'Document Management',
          icon: FileText,
          children: [
            { id: 'L3-174', title: isZh ? '归档计划' : 'Archiving Plan', url: '#submissions' },
            { id: 'L3-175', title: isZh ? '归档检查' : 'Archiving Inspection', url: '#pending' },
            { id: 'L3-176', title: isZh ? '归档进展' : 'Archiving Progress', url: '#team-subs' },
            { id: 'L3-177', title: isZh ? '其他文档' : 'Other Documents', url: '#overdue' },
            { id: 'L3-178', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#it-support' }
          ]
        },
        {
          id: 'L2-26',
          title: isZh ? '运作管理' : 'Operations Management',
          icon: ClipboardList,
          children: [
            { id: 'L3-179', title: isZh ? '项目例会' : 'Project Regular Meeting', url: '#team-subs' },
            { id: 'L3-180', title: isZh ? '监理例会' : 'Supervision Regular Meeting', url: '#notifications' },
            { id: 'L3-181', title: isZh ? '总包例会' : 'General Contractor Regular Meeting', url: '#pending' },
            { id: 'L3-182', title: isZh ? '项目巡场' : 'Site Patrol', url: '#severely-overdue' }
          ]
        },
        {
          id: 'L2-27',
          title: isZh ? '文档移交' : 'Document Handover',
          icon: Briefcase,
          children: [
            { id: 'L3-183', title: isZh ? '移交计划' : 'Handover Plan', url: '#my-todos' },
            { id: 'L3-184', title: isZh ? '移交检查' : 'Handover Inspection', url: '#my-workspace' },
            { id: 'L3-185', title: isZh ? '移交进展' : 'Handover Progress', url: '#submissions' }
          ]
        },
        {
          id: 'L2-28',
          title: isZh ? '复盘总结' : 'Post-mortem & Summary',
          icon: Layers,
          children: [
            { id: 'L3-186', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#submissions' },
            { id: 'L3-187', title: isZh ? '案例管理' : 'Case Management', url: '#pending' }
          ]
        },
        {
          id: 'L2-29',
          title: isZh ? '标准文件' : 'Standard Documents',
          icon: Folder,
          children: [
            { id: 'L3-188', title: isZh ? '设计标准文件库' : 'Design Standards Library', url: '#team-subs' },
            { id: 'L3-189', title: isZh ? '材料库' : 'Material Library', url: '#overdue' },
            { id: 'L3-190', title: isZh ? '标准单元库' : 'Standard Units Library', url: '#it-support' },
            { id: 'L3-191', title: isZh ? '工艺标准库' : 'Process Standards Library', url: '#team-subs' },
            { id: 'L3-192', title: isZh ? '标准节点库' : 'Standard Nodes Library', url: '#notifications' },
            { id: 'L3-193', title: isZh ? '计划节点库' : 'Schedule Nodes Library', url: '#pending' }
          ]
        },
        {
          id: 'L2-30',
          title: isZh ? '合同及图纸' : 'Contracts & Drawings',
          icon: FileText,
          children: [
            { id: 'L3-194', title: isZh ? '合同查询' : 'Contract Query', url: '#severely-overdue' },
            { id: 'L3-195', title: isZh ? '图纸查询' : 'Drawing Query', url: '#help-guide' }
          ]
        },
        {
          id: 'L2-31',
          title: isZh ? '工具库' : 'Tool Library',
          icon: Box,
          children: [{ id: 'L3-196', title: isZh ? '项目管理工具' : 'Project Management Tools', url: '#my-workspace' }]
        }
      ]
    })