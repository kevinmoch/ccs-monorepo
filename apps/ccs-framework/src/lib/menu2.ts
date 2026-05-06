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

export const menu2 = (isZh: boolean) => ({
      id: 'L1-2',
      title: isZh ? '规划设计管理' : 'Planning & Design Management',
      icon: LineChart,
      children: [
        {
          id: 'L2-6',
          title: isZh ? '建筑专业' : 'Architecture',
          icon: Building2,
          seperateLine: ['L3-35'],
          children: [
            {
              id: 'L3-29',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
            {
              id: 'L4-89',
              title: isZh ? '启动资料' : 'Kickoff Documents',
              url: '#submenu',
              children: [
                {
                  id: 'M2-Sub-1',
                  title: isZh ? '项目立项' : 'Project Initiation',
                  url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/eccui/ecc/index.html?buildTime=1777358321678#/InitiationInfo?hideHeader=1&majorId=1203594021327343616&projectId=2455258360879040512&projectName=%E5%9B%A2%E6%B3%8A%E6%B4%BC%E5%8D%97%E9%83%A8%E5%AD%A6%E6%A0%A1-VIP%E9%A1%B9%E7%9B%AE'
                },
                {
                  id: 'M2-Sub-2',
                  title: isZh ? '设计需求' : 'Design Requirements',
                  url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=hw_bos_list_nohead&billFormId=hw_design_needs&type=list&hideHeader=1&buildTime=1777358321678&projectId=2455258360879040512&projectName=%E5%9B%A2%E6%B3%8A%E6%B4%BC%E5%8D%97%E9%83%A8%E5%AD%A6%E6%A0%A1-VIP%E9%A1%B9%E7%9B%AE'
                },
                {
                  id: 'M2-Sub-3',
                  title: isZh ? '初步勘察' : 'Preliminary Survey',
                  disabled: true
                },
                {
                  id: 'M2-Sub-4',
                  title: isZh ? '地形测绘' : 'Topographic Survey',
                  disabled: true
                },
                {
                  id: 'M2-Sub-5',
                  title: isZh ? '工程物探' : 'Geophysical Survey',
                  disabled: true
                },
                {
                  id: 'M2-Sub-6',
                  title: isZh ? '设计任务书' : 'Design Brief',
                  url: 'https://ccs-gamma.huaweicloud.com/CCS_TEST_201/ierp/?formId=hw_bos_list_nohead&billFormId=des_designassignment&type=list&hideHeader=1&fromPage=designheade&majorId=1203594021327343616&buildTime=1777358321678&projectId=2455258360879040512&projectName=%E5%9B%A2%E6%B3%8A%E6%B4%BC%E5%8D%97%E9%83%A8%E5%AD%A6%E6%A0%A1-VIP%E9%A1%B9%E7%9B%AE'
                }
              ]
            },
                { id: 'L4-90', title: isZh ? '前期策划' : 'Pre-planning', url: '#my-workspace', disabled: true },
                { id: 'L4-91', title: isZh ? '建筑信息维护' : 'Arch Info Maintenance', url: `${location.origin}/iframe.html` },
                { id: 'L4-92', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-30',
              title: isZh ? '概念规划管理' : 'Concept Planning',
              icon: PencilRuler,
              children: [
                { id: 'L4-93', title: isZh ? '概念规划设计成果' : 'Concept Design Output', url: '#pending' },
                { id: 'L4-94', title: isZh ? '设计评审' : 'Design Review', url: '#severely-overdue' },
                { id: 'L4-95', title: isZh ? '成果确认' : 'Output Confirmation', url: '#my-todos' }
              ]
            },
            {
              id: 'L3-31',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-96', title: isZh ? '设计交底' : 'Design Briefing', url: '#logs-archive' },
                { id: 'L4-97', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#safety-daily' },
                { id: 'L4-98', title: isZh ? '设计评审' : 'Design Review', url: '#docs-permits' },
                { id: 'L4-99', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#team-subs' },
                { id: 'L4-100', title: isZh ? '成果会签' : 'Output Co-signing', url: '#logs-today' },
                { id: 'L4-101', title: isZh ? '成果确认' : 'Output Confirmation', url: '#model' },
                { id: 'L4-102', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#clashes' }
              ]
            },
            {
              id: 'L3-32',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-103', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#help-guide' },
                { id: 'L4-104', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#my-workspace' },
                { id: 'L4-105', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#submissions' },
                { id: 'L4-106', title: isZh ? '设计师管理' : 'Designer Management', url: '#submissions' }
              ]
            },
            {
              id: 'L3-33',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-107', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#pending' },
                { id: 'L4-108', title: isZh ? '业务策略' : 'Business Strategy', url: '#logs-archive' },
                { id: 'L4-109', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#safety-daily' },
                { id: 'L4-110', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#docs-permits' }
              ]
            },
            {
              id: 'L3-34',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-111', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#team-subs' },
                { id: 'L4-112', title: isZh ? '施工交底' : 'Construction Briefing', url: '#logs-today' },
                { id: 'L4-113', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#model' },
                { id: 'L4-114', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#clashes' },
                { id: 'L4-115', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#gantt-critical' }
              ]
            },
            {
              id: 'L3-35',
              title: isZh ? '建筑标准文件' : 'Arch Standards',
              icon: Folder,
              children: [
                { id: 'L4-116', title: isZh ? '设计标准' : 'Design Standards', url: '#budget-q3' },
                { id: 'L4-117', title: isZh ? '标准节点' : 'Standard Nodes', url: '#submissions' },
                { id: 'L4-118', title: isZh ? '标准单元' : 'Standard Units', url: '#completed' },
                { id: 'L4-119', title: isZh ? '材料标准' : 'Material Standards', url: '#pending' }
              ]
            },
            {
              id: 'L3-36',
              title: isZh ? '建筑资料库' : 'Arch Library',
              icon: Users,
              children: [
                { id: 'L4-120', title: isZh ? '业界资料' : 'Industry References', url: '#logs-archive' },
                { id: 'L4-121', title: isZh ? '公司成果' : 'Company Outputs', url: '#safety-daily' },
                { id: 'L4-122', title: isZh ? '模板库' : 'Template Library', url: '#docs-permits' },
                { id: 'L4-123', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#team-subs' }
              ]
            },
            {
              id: 'L3-37',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [{ id: 'L4-124', title: isZh ? '建筑专业线评审会' : 'Arch Line Review Meeting', url: '#logs-today' }]
            },
            {
              id: 'L3-38',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-125', title: isZh ? 'BIM' : 'BIM', url: '#pending' }]
            }
          ]
        },
        {
          id: 'L2-7',
          title: isZh ? '土建专业' : 'Civil Engineering',
          icon: HardHat,
          seperateLine: ['L3-45'],
          children: [
            {
              id: 'L3-39',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
                { id: 'L4-126', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#pending' },
                { id: 'L4-127', title: isZh ? '前期策划' : 'Pre-planning', url: '#submissions' },
                { id: 'L4-128', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#submissions' }
              ]
            },
            {
              id: 'L3-40',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-129', title: isZh ? '设计交底' : 'Design Briefing', url: '#my-workspace' },
                { id: 'L4-130', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#pending' },
                { id: 'L4-131', title: isZh ? '设计评审' : 'Design Review', url: '#severely-overdue' },
                { id: 'L4-132', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#my-todos' },
                { id: 'L4-133', title: isZh ? '成果会签' : 'Output Co-signing', url: '#team-subs' },
                { id: 'L4-134', title: isZh ? '成果确认' : 'Output Confirmation', url: '#overdue' },
                { id: 'L4-135', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#it-support' }
              ]
            },
            {
              id: 'L3-41',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-136', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#team-subs' },
                { id: 'L4-137', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#logs-today' },
                { id: 'L4-138', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#pending' },
                { id: 'L4-139', title: isZh ? '设计师管理' : 'Designer Management', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-42',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-140', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#help-guide' },
                { id: 'L4-141', title: isZh ? '业务策略' : 'Business Strategy', url: '#my-workspace' },
                { id: 'L4-142', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#submissions' },
                { id: 'L4-143', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#submissions' },
                { id: 'L4-144', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#pending' }
              ]
            },
            {
              id: 'L3-43',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-145', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#logs-archive' },
                { id: 'L4-146', title: isZh ? '施工交底' : 'Construction Briefing', url: '#safety-daily' },
                { id: 'L4-147', title: isZh ? '实施策划' : 'Implementation Planning', url: '#docs-permits' },
                { id: 'L4-148', title: isZh ? '样板管理' : 'Sample Management', url: '#team-subs' },
                { id: 'L4-149', title: isZh ? '材料管理' : 'Material Mgmt', url: '#logs-today' },
                { id: 'L4-150', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#pending' },
                { id: 'L4-151', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-44',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-152', title: isZh ? '合同查询' : 'Contract Query', url: '#my-todos' },
                { id: 'L4-153', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#my-workspace' },
                { id: 'L4-154', title: isZh ? '质量管理' : 'Quality Management', url: '#submissions' },
                { id: 'L4-155', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#submissions' },
                { id: 'L4-156', title: isZh ? '供应商管理' : 'Supplier Management', url: '#pending' },
                { id: 'L4-157', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#team-subs' }
              ]
            },
            {
              id: 'L3-45',
              title: isZh ? '土建标准文件' : 'Civil Standards',
              icon: Folder,
              children: [
                { id: 'L4-158', title: isZh ? '设计标准' : 'Design Standards', url: '#overdue' },
                { id: 'L4-159', title: isZh ? '材料标准' : 'Material Standards', url: '#it-support' },
                { id: 'L4-160', title: isZh ? '标准节点' : 'Standard Nodes', url: '#team-subs' },
                { id: 'L4-161', title: isZh ? '标准清单' : 'Standard Checklists', url: '#notifications' },
                { id: 'L4-162', title: isZh ? '工艺标准' : 'Process Standards', url: '#pending' }
              ]
            },
            {
              id: 'L3-46',
              title: isZh ? '土建资料库' : 'Civil Library',
              icon: Users,
              children: [
                { id: 'L4-163', title: isZh ? '业界资料' : 'Industry References', url: '#severely-overdue' },
                { id: 'L4-164', title: isZh ? '模板库' : 'Template Library', url: '#help-guide' },
                { id: 'L4-165', title: isZh ? '公司成果' : 'Company Outputs', url: '#my-workspace' },
                { id: 'L4-166', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#submissions' }
              ]
            },
            {
              id: 'L3-47',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [{ id: 'L4-167', title: isZh ? '土建专业线评审会' : 'Civil Line Review Meeting', url: '#submissions' }]
            },
            {
              id: 'L3-48',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-168', title: isZh ? 'BIM' : 'BIM', url: '#pending' }]
            }
          ]
        },
        {
          id: 'L2-8',
          title: isZh ? '幕墙专业' : 'Curtain Wall',
          icon: Box,
          seperateLine: ['L3-55'],
          children: [
            {
              id: 'L3-49',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
                { id: 'L4-169', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#logs-archive' },
                { id: 'L4-170', title: isZh ? '前期策划' : 'Pre-planning', url: '#safety-daily' },
                { id: 'L4-171', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#docs-permits' }
              ]
            },
            {
              id: 'L3-50',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-172', title: isZh ? '设计交底' : 'Design Briefing', url: '#team-subs' },
                { id: 'L4-173', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#logs-today' },
                { id: 'L4-174', title: isZh ? '设计评审' : 'Design Review', url: '#model' },
                { id: 'L4-175', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#clashes' },
                { id: 'L4-176', title: isZh ? '成果会签' : 'Output Co-signing', url: '#gantt-critical' },
                { id: 'L4-177', title: isZh ? '成果确认' : 'Output Confirmation', url: '#budget-q3' },
                { id: 'L4-178', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#submissions' }
              ]
            },
            {
              id: 'L3-51',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-179', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#completed' },
                { id: 'L4-180', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#pending' },
                { id: 'L4-181', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#logs-archive' },
                { id: 'L4-182', title: isZh ? '设计师管理' : 'Designer Management', url: '#safety-daily' }
              ]
            },
            {
              id: 'L3-52',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-183', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#docs-permits' },
                { id: 'L4-184', title: isZh ? '业务策略' : 'Business Strategy', url: '#team-subs' },
                { id: 'L4-185', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#logs-today' },
                { id: 'L4-186', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#model' },
                { id: 'L4-187', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#clashes' }
              ]
            },
            {
              id: 'L3-53',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-188', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#gantt-critical' },
                { id: 'L4-189', title: isZh ? '施工交底' : 'Construction Briefing', url: '#budget-q3' },
                { id: 'L4-190', title: isZh ? '实施策划' : 'Implementation Planning', url: '#submissions' },
                { id: 'L4-191', title: isZh ? '样板管理' : 'Sample Management', url: '#completed' },
                { id: 'L4-192', title: isZh ? '材料管理' : 'Material Mgmt', url: '#pending' },
                { id: 'L4-193', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#logs-archive' },
                { id: 'L4-194', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#safety-daily' }
              ]
            },
            {
              id: 'L3-54',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-195', title: isZh ? '合同查询' : 'Contract Query', url: '#docs-permits' },
                { id: 'L4-196', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#team-subs' },
                { id: 'L4-197', title: isZh ? '质量管理' : 'Quality Management', url: '#logs-today' },
                { id: 'L4-198', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#model' },
                { id: 'L4-199', title: isZh ? '框架分单' : 'Framework Allocation', url: '#severely-overdue' },
                { id: 'L4-200', title: isZh ? '供应商管理' : 'Supplier Management', url: '#my-todos' },
                { id: 'L4-201', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-55',
              title: isZh ? '幕墙标准文件' : 'Curtain Wall Standards',
              icon: Folder,
              children: [
                { id: 'L4-202', title: isZh ? '设计标准' : 'Design Standards', url: '#submissions' },
                { id: 'L4-203', title: isZh ? '工艺标准' : 'Process Standards', url: '#submissions' },
                { id: 'L4-204', title: isZh ? '标准单元' : 'Standard Units', url: '#pending' },
                { id: 'L4-205', title: isZh ? '材料标准' : 'Material Standards', url: '#team-subs' },
                { id: 'L4-206', title: isZh ? '标准节点' : 'Standard Nodes', url: '#overdue' },
                { id: 'L4-207', title: isZh ? '标准清单' : 'Standard Checklists', url: '#it-support' }
              ]
            },
            {
              id: 'L3-56',
              title: isZh ? '幕墙资料库' : 'Curtain Wall Library',
              icon: Users,
              children: [
                { id: 'L4-208', title: isZh ? '业界资料' : 'Industry References', url: '#team-subs' },
                { id: 'L4-209', title: isZh ? '模板库' : 'Template Library', url: '#logs-today' },
                { id: 'L4-210', title: isZh ? '公司成果' : 'Company Outputs', url: '#pending' },
                { id: 'L4-211', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-57',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [
                { id: 'L4-212', title: isZh ? '幕墙专业线评审会' : 'Curtain Wall Line Review Meeting', url: '#help-guide' },
                { id: 'L4-213', title: isZh ? '建筑&幕墙设计管理部评审会' : 'Arch & Curtain Wall Design Review', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-58',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-214', title: isZh ? 'BIM' : 'BIM', url: '#submissions' }]
            }
          ]
        },
        {
          id: 'L2-9',
          title: isZh ? '暖通专业' : 'HVAC',
          icon: Zap,
          seperateLine: ['L3-65'],
          children: [
            {
              id: 'L3-59',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: ClipboardList,
              children: [
                { id: 'L4-215', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#submissions' },
                { id: 'L4-216', title: isZh ? '前期策划' : 'Pre-planning', url: '#pending' },
                { id: 'L4-217', title: isZh ? '市政资料' : 'Municipal Data', url: '#team-subs' },
                { id: 'L4-218', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#overdue' }
              ]
            },
            {
              id: 'L3-60',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-219', title: isZh ? '设计交底' : 'Design Briefing', url: '#it-support' },
                { id: 'L4-220', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#team-subs' },
                { id: 'L4-221', title: isZh ? '设计评审' : 'Design Review', url: '#notifications' },
                { id: 'L4-222', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#pending' },
                { id: 'L4-223', title: isZh ? '成果会签' : 'Output Co-signing', url: '#severely-overdue' },
                { id: 'L4-224', title: isZh ? '成果确认' : 'Output Confirmation', url: '#my-todos' },
                { id: 'L4-225', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-61',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-226', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#submissions' },
                { id: 'L4-227', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#submissions' },
                { id: 'L4-228', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#pending' },
                { id: 'L4-229', title: isZh ? '设计师管理' : 'Designer Management', url: '#team-subs' }
              ]
            },
            {
              id: 'L3-62',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-230', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#overdue' },
                { id: 'L4-231', title: isZh ? '业务策略' : 'Business Strategy', url: '#it-support' },
                { id: 'L4-232', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#team-subs' },
                { id: 'L4-233', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#notifications' },
                { id: 'L4-234', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#pending' }
              ]
            },
            {
              id: 'L3-63',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-235', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#clashes' },
                { id: 'L4-236', title: isZh ? '施工交底' : 'Construction Briefing', url: '#gantt-critical' },
                { id: 'L4-237', title: isZh ? '实施策划' : 'Implementation Planning', url: '#budget-q3' },
                { id: 'L4-238', title: isZh ? '样板管理' : 'Sample Management', url: '#submissions' },
                { id: 'L4-239', title: isZh ? '材料管理' : 'Material Mgmt', url: '#completed' },
                { id: 'L4-240', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#pending' },
                { id: 'L4-241', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#logs-archive' }
              ]
            },
            {
              id: 'L3-64',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-242', title: isZh ? '合同查询' : 'Contract Query', url: '#overdue' },
                { id: 'L4-243', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#it-support' },
                { id: 'L4-244', title: isZh ? '质量管理' : 'Quality Management', url: '#team-subs' },
                { id: 'L4-245', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#notifications' },
                { id: 'L4-246', title: isZh ? '框架分单' : 'Framework Allocation', url: '#pending' },
                { id: 'L4-247', title: isZh ? '供应商管理' : 'Supplier Management', url: '#severely-overdue' },
                { id: 'L4-248', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#my-todos' }
              ]
            },
            {
              id: 'L3-65',
              title: isZh ? '暖通标准文件' : 'HVAC Standards',
              icon: Folder,
              children: [
                { id: 'L4-249', title: isZh ? '设计标准' : 'Design Standards', url: '#budget-q3' },
                { id: 'L4-250', title: isZh ? '工艺标准' : 'Process Standards', url: '#submissions' },
                { id: 'L4-251', title: isZh ? '标准单元' : 'Standard Units', url: '#completed' },
                { id: 'L4-252', title: isZh ? '材料标准' : 'Material Standards', url: '#pending' },
                { id: 'L4-253', title: isZh ? '标准节点' : 'Standard Nodes', url: '#logs-archive' },
                { id: 'L4-254', title: isZh ? '标准清单' : 'Standard Checklists', url: '#safety-daily' }
              ]
            },
            {
              id: 'L3-66',
              title: isZh ? '暖通资料库' : 'HVAC Library',
              icon: Users,
              children: [
                { id: 'L4-255', title: isZh ? '业界资料' : 'Industry References', url: '#docs-permits' },
                { id: 'L4-256', title: isZh ? '模板库' : 'Template Library', url: '#team-subs' },
                { id: 'L4-257', title: isZh ? '公司成果' : 'Company Outputs', url: '#logs-today' },
                { id: 'L4-258', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#model' }
              ]
            },
            {
              id: 'L3-67',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [
                { id: 'L4-259', title: isZh ? '暖通专业线评审会' : 'HVAC Line Review Meeting', url: '#clashes' },
                { id: 'L4-260', title: isZh ? '机电&暖通设计管理部评审会' : 'MEP & HVAC Design Review', url: '#gantt-milestone' }
              ]
            },
            {
              id: 'L3-68',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-261', title: isZh ? 'BIM' : 'BIM', url: '#budget-q3' }]
            }
          ]
        },
        {
          id: 'L2-10',
          title: isZh ? '强电专业' : 'Power & Electrical',
          icon: Shield,
          seperateLine: ['L3-75'],
          children: [
            {
              id: 'L3-69',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
                { id: 'L4-262', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#submissions' },
                { id: 'L4-263', title: isZh ? '前期策划' : 'Pre-planning', url: '#completed' },
                { id: 'L4-264', title: isZh ? '市政资料' : 'Municipal Data', url: '#pending' },
                { id: 'L4-265', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#logs-archive' }
              ]
            },
            {
              id: 'L3-70',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-266', title: isZh ? '设计交底' : 'Design Briefing', url: '#safety-daily' },
                { id: 'L4-267', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#docs-permits' },
                { id: 'L4-268', title: isZh ? '设计评审' : 'Design Review', url: '#team-subs' },
                { id: 'L4-269', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#logs-today' },
                { id: 'L4-270', title: isZh ? '成果会签' : 'Output Co-signing', url: '#model' },
                { id: 'L4-271', title: isZh ? '成果确认' : 'Output Confirmation', url: '#clashes' },
                { id: 'L4-272', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#gantt-critical' }
              ]
            },
            {
              id: 'L3-71',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-273', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#pending' },
                { id: 'L4-274', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#submissions' },
                { id: 'L4-275', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#submissions' },
                { id: 'L4-276', title: isZh ? '设计师管理' : 'Designer Management', url: '#pending' }
              ]
            },
            {
              id: 'L3-72',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-277', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#team-subs' },
                { id: 'L4-278', title: isZh ? '业务策略' : 'Business Strategy', url: '#overdue' },
                { id: 'L4-279', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#it-support' },
                { id: 'L4-280', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#team-subs' },
                { id: 'L4-281', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#notifications' }
              ]
            },
            {
              id: 'L3-73',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-282', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#pending' },
                { id: 'L4-283', title: isZh ? '施工交底' : 'Construction Briefing', url: '#severely-overdue' },
                { id: 'L4-284', title: isZh ? '实施策划' : 'Implementation Planning', url: '#help-guide' },
                { id: 'L4-285', title: isZh ? '样板管理' : 'Sample Management', url: '#my-workspace' },
                { id: 'L4-286', title: isZh ? '材料管理' : 'Material Mgmt', url: '#submissions' },
                { id: 'L4-287', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#submissions' },
                { id: 'L4-288', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#pending' }
              ]
            },
            {
              id: 'L3-74',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-289', title: isZh ? '合同查询' : 'Contract Query', url: '#team-subs' },
                { id: 'L4-290', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#overdue' },
                { id: 'L4-291', title: isZh ? '质量管理' : 'Quality Management', url: '#it-support' },
                { id: 'L4-292', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#team-subs' },
                { id: 'L4-293', title: isZh ? '框架分单' : 'Framework Allocation', url: '#notifications' },
                { id: 'L4-294', title: isZh ? '供应商管理' : 'Supplier Management', url: '#pending' },
                { id: 'L4-295', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-75',
              title: isZh ? '强电标准文件' : 'Power Standards',
              icon: Folder,
              children: [
                { id: 'L4-296', title: isZh ? '设计标准' : 'Design Standards', url: '#my-todos' },
                { id: 'L4-297', title: isZh ? '工艺标准' : 'Process Standards', url: '#my-workspace' },
                { id: 'L4-298', title: isZh ? '标准单元' : 'Standard Units', url: '#submissions' },
                { id: 'L4-299', title: isZh ? '材料标准' : 'Material Standards', url: '#submissions' },
                { id: 'L4-300', title: isZh ? '标准节点' : 'Standard Nodes', url: '#pending' },
                { id: 'L4-301', title: isZh ? '标准清单' : 'Standard Checklists', url: '#team-subs' }
              ]
            },
            {
              id: 'L3-76',
              title: isZh ? '强电资料库' : 'Power Library',
              icon: Users,
              children: [
                { id: 'L4-302', title: isZh ? '业界资料' : 'Industry References', url: '#overdue' },
                { id: 'L4-303', title: isZh ? '模板库' : 'Template Library', url: '#it-support' },
                { id: 'L4-304', title: isZh ? '公司成果' : 'Company Outputs', url: '#team-subs' },
                { id: 'L4-305', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#notifications' }
              ]
            },
            {
              id: 'L3-77',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [
                { id: 'L4-306', title: isZh ? '强电专业线评审会' : 'Power Line Review Meeting', url: '#pending' },
                { id: 'L4-307', title: isZh ? '机电强电专业线评审会' : 'MEP Power Line Review', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-78',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-308', title: isZh ? 'BIM' : 'BIM', url: '#gantt-milestone' }]
            }
          ]
        },
        {
          id: 'L2-11',
          title: isZh ? '弱电专业' : 'Weak Current & IT',
          icon: Users,
          seperateLine: ['L3-85'],
          children: [
            {
              id: 'L3-79',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
                { id: 'L4-309', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#budget-q3' },
                { id: 'L4-310', title: isZh ? '前期策划' : 'Pre-planning', url: '#submissions' },
                { id: 'L4-311', title: isZh ? '市政资料' : 'Municipal Data', url: '#completed' },
                { id: 'L4-312', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#pending' }
              ]
            },
            {
              id: 'L3-80',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-313', title: isZh ? '设计交底' : 'Design Briefing', url: '#help-guide' },
                { id: 'L4-314', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#my-workspace' },
                { id: 'L4-315', title: isZh ? '设计评审' : 'Design Review', url: '#submissions' },
                { id: 'L4-316', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#submissions' },
                { id: 'L4-317', title: isZh ? '成果会签' : 'Output Co-signing', url: '#pending' },
                { id: 'L4-318', title: isZh ? '成果确认' : 'Output Confirmation', url: '#team-subs' },
                { id: 'L4-319', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#overdue' }
              ]
            },
            {
              id: 'L3-81',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-320', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#it-support' },
                { id: 'L4-321', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#team-subs' },
                { id: 'L4-322', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#notifications' },
                { id: 'L4-323', title: isZh ? '设计师管理' : 'Designer Management', url: '#pending' }
              ]
            },
            {
              id: 'L3-82',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-324', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#pending' },
                { id: 'L4-325', title: isZh ? '业务策略' : 'Business Strategy', url: '#team-subs' },
                { id: 'L4-326', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#overdue' },
                { id: 'L4-327', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#it-support' },
                { id: 'L4-328', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#team-subs' }
              ]
            },
            {
              id: 'L3-83',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-329', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#pending' },
                { id: 'L4-330', title: isZh ? '施工交底' : 'Construction Briefing', url: '#severely-overdue' },
                { id: 'L4-331', title: isZh ? '实施策划' : 'Implementation Planning', url: '#help-guide' },
                { id: 'L4-332', title: isZh ? '样板管理' : 'Sample Management', url: '#my-workspace' },
                { id: 'L4-333', title: isZh ? '材料管理' : 'Material Mgmt', url: '#submissions' },
                { id: 'L4-334', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#submissions' },
                { id: 'L4-335', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#pending' }
              ]
            },
            {
              id: 'L3-84',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-336', title: isZh ? '合同查询' : 'Contract Query', url: '#team-subs' },
                { id: 'L4-337', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#overdue' },
                { id: 'L4-338', title: isZh ? '质量管理' : 'Quality Management', url: '#it-support' },
                { id: 'L4-339', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#team-subs' },
                { id: 'L4-340', title: isZh ? '框架分单' : 'Framework Allocation', url: '#notifications' },
                { id: 'L4-341', title: isZh ? '供应商管理' : 'Supplier Management', url: '#pending' },
                { id: 'L4-342', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-85',
              title: isZh ? '弱电标准文件' : 'Weak Current Standards',
              icon: Folder,
              children: [
                { id: 'L4-343', title: isZh ? '设计标准' : 'Design Standards', url: '#clashes' },
                { id: 'L4-344', title: isZh ? '工艺标准' : 'Process Standards', url: '#gantt-critical' },
                { id: 'L4-345', title: isZh ? '标准单元' : 'Standard Units', url: '#budget-q3' },
                { id: 'L4-346', title: isZh ? '材料标准' : 'Material Standards', url: '#submissions' },
                { id: 'L4-347', title: isZh ? '标准节点' : 'Standard Nodes', url: '#completed' },
                { id: 'L4-348', title: isZh ? '标准清单' : 'Standard Checklists', url: '#pending' }
              ]
            },
            {
              id: 'L3-86',
              title: isZh ? '弱电资料库' : 'Weak Current Library',
              icon: Users,
              children: [
                { id: 'L4-349', title: isZh ? '业界资料' : 'Industry References', url: '#logs-archive' },
                { id: 'L4-350', title: isZh ? '模板库' : 'Template Library', url: '#safety-daily' },
                { id: 'L4-351', title: isZh ? '公司成果' : 'Company Outputs', url: '#docs-permits' },
                { id: 'L4-352', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#team-subs' }
              ]
            },
            {
              id: 'L3-87',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [
                { id: 'L4-353', title: isZh ? '弱电专业线评审会' : 'Weak Current Line Review Meeting', url: '#submissions' },
                { id: 'L4-354', title: isZh ? '机电暖通设计评审会' : 'MEP & HVAC Design Review', url: '#pending' }
              ]
            },
            {
              id: 'L3-88',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-355', title: isZh ? 'BIM' : 'BIM', url: '#severely-overdue' }]
            }
          ]
        },
        {
          id: 'L2-12',
          title: isZh ? '精装专业' : 'Interior Fit-out',
          icon: PencilRuler,
          seperateLine: ['L3-95'],
          children: [
            {
              id: 'L3-89',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
                { id: 'L4-356', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#help-guide' },
                { id: 'L4-357', title: isZh ? '前期策划' : 'Pre-planning', url: '#my-workspace' },
                { id: 'L4-358', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#submissions' }
              ]
            },
            {
              id: 'L3-90',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-359', title: isZh ? '设计交底' : 'Design Briefing', url: '#completed' },
                { id: 'L4-360', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#pending' },
                { id: 'L4-361', title: isZh ? '设计评审' : 'Design Review', url: '#logs-archive' },
                { id: 'L4-362', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#safety-daily' },
                { id: 'L4-363', title: isZh ? '成果会签' : 'Output Co-signing', url: '#docs-permits' },
                { id: 'L4-364', title: isZh ? '成果确认' : 'Output Confirmation', url: '#team-subs' },
                { id: 'L4-365', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#logs-today' }
              ]
            },
            {
              id: 'L3-91',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-366', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#pending' },
                { id: 'L4-367', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#severely-overdue' },
                { id: 'L4-368', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#help-guide' },
                { id: 'L4-369', title: isZh ? '设计师管理' : 'Designer Management', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-92',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-370', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#submissions' },
                { id: 'L4-371', title: isZh ? '业务策略' : 'Business Strategy', url: '#submissions' },
                { id: 'L4-372', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#pending' },
                { id: 'L4-373', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#team-subs' },
                { id: 'L4-374', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#overdue' }
              ]
            },
            {
              id: 'L3-93',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-375', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#it-support' },
                { id: 'L4-376', title: isZh ? '施工交底' : 'Construction Briefing', url: '#team-subs' },
                { id: 'L4-377', title: isZh ? '实施策划' : 'Implementation Planning', url: '#notifications' },
                { id: 'L4-378', title: isZh ? '样板管理' : 'Sample Management', url: '#pending' },
                { id: 'L4-379', title: isZh ? '材料管理' : 'Material Mgmt', url: '#severely-overdue' },
                { id: 'L4-380', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#my-todos' },
                { id: 'L4-381', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-94',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-382', title: isZh ? '合同查询' : 'Contract Query', url: '#submissions' },
                { id: 'L4-383', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#submissions' },
                { id: 'L4-384', title: isZh ? '质量管理' : 'Quality Management', url: '#pending' },
                { id: 'L4-385', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#team-subs' },
                { id: 'L4-386', title: isZh ? '供应商管理' : 'Supplier Management', url: '#overdue' },
                { id: 'L4-387', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#it-support' }
              ]
            },
            {
              id: 'L3-95',
              title: isZh ? '精装标准文件' : 'Fit-out Standards',
              icon: Folder,
              children: [
                { id: 'L4-388', title: isZh ? '设计标准' : 'Design Standards', url: '#team-subs' },
                { id: 'L4-389', title: isZh ? '工艺标准' : 'Process Standards', url: '#team-subs' },
                { id: 'L4-390', title: isZh ? '标准单元' : 'Standard Units', url: '#pending' },
                { id: 'L4-391', title: isZh ? '材料标准' : 'Material Standards', url: '#severely-overdue' },
                { id: 'L4-392', title: isZh ? '标准节点' : 'Standard Nodes', url: '#my-todos' },
                { id: 'L4-393', title: isZh ? '标准清单' : 'Standard Checklists', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-96',
              title: isZh ? '精装资料库' : 'Fit-out Library',
              icon: Users,
              children: [
                { id: 'L4-394', title: isZh ? '业界资料' : 'Industry References', url: '#submissions' },
                { id: 'L4-395', title: isZh ? '模板库' : 'Template Library', url: '#submissions' },
                { id: 'L4-396', title: isZh ? '公司成果' : 'Company Outputs', url: '#pending' },
                { id: 'L4-397', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#team-subs' }
              ]
            },
            {
              id: 'L3-97',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [{ id: 'L4-398', title: isZh ? '精装专业设计评审会' : 'Fit-out Design Review Meeting', url: '#overdue' }]
            },
            {
              id: 'L3-98',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-399', title: isZh ? 'BIM' : 'BIM', url: '#it-support' }]
            }
          ]
        },
        {
          id: 'L2-13',
          title: isZh ? '软装专业' : 'Soft Furnishing',
          icon: Folder,
          seperateLine: ['L3-105'],
          children: [
            {
              id: 'L3-99',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
                { id: 'L4-400', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#team-subs' },
                { id: 'L4-401', title: isZh ? '前期策划' : 'Pre-planning', url: '#logs-today' },
                { id: 'L4-402', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#model' }
              ]
            },
            {
              id: 'L3-100',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-403', title: isZh ? '设计交底' : 'Design Briefing', url: '#pending' },
                { id: 'L4-404', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#severely-overdue' },
                { id: 'L4-405', title: isZh ? '设计评审' : 'Design Review', url: '#help-guide' },
                { id: 'L4-406', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#my-workspace' },
                { id: 'L4-407', title: isZh ? '成果会签' : 'Output Co-signing', url: '#submissions' },
                { id: 'L4-408', title: isZh ? '成果确认' : 'Output Confirmation', url: '#submissions' },
                { id: 'L4-409', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#logs-archive' }
              ]
            },
            {
              id: 'L3-101',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-410', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#safety-daily' },
                { id: 'L4-411', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#docs-permits' },
                { id: 'L4-412', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#team-subs' },
                { id: 'L4-413', title: isZh ? '设计师管理' : 'Designer Management', url: '#logs-today' }
              ]
            },
            {
              id: 'L3-102',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-414', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#model' },
                { id: 'L4-415', title: isZh ? '业务策略' : 'Business Strategy', url: '#clashes' },
                { id: 'L4-416', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#gantt-critical' },
                { id: 'L4-417', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#budget-q3' },
                { id: 'L4-418', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#submissions' }
              ]
            },
            {
              id: 'L3-103',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-419', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#completed' },
                { id: 'L4-420', title: isZh ? '施工交底' : 'Construction Briefing', url: '#pending' },
                { id: 'L4-421', title: isZh ? '实施策划' : 'Implementation Planning', url: '#logs-archive' },
                { id: 'L4-422', title: isZh ? '样板管理' : 'Sample Management', url: '#safety-daily' },
                { id: 'L4-423', title: isZh ? '材料管理' : 'Material Mgmt', url: '#docs-permits' },
                { id: 'L4-424', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#team-subs' },
                { id: 'L4-425', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#logs-today' }
              ]
            },
            {
              id: 'L3-104',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-426', title: isZh ? '合同查询' : 'Contract Query', url: '#pending' },
                { id: 'L4-427', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#severely-overdue' },
                { id: 'L4-428', title: isZh ? '质量管理' : 'Quality Management', url: '#help-guide' },
                { id: 'L4-429', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#my-workspace' },
                { id: 'L4-430', title: isZh ? '供应商管理' : 'Supplier Management', url: '#submissions' },
                { id: 'L4-431', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#submissions' }
              ]
            },
            {
              id: 'L3-105',
              title: isZh ? '软装标准文件' : 'Soft Furnishing Standards',
              icon: Folder,
              children: [
                { id: 'L4-432', title: isZh ? '设计标准' : 'Design Standards', url: '#pending' },
                { id: 'L4-433', title: isZh ? '工艺标准' : 'Process Standards', url: '#team-subs' },
                { id: 'L4-434', title: isZh ? '标准单元' : 'Standard Units', url: '#overdue' },
                { id: 'L4-435', title: isZh ? '材料标准' : 'Material Standards', url: '#it-support' },
                { id: 'L4-436', title: isZh ? '标准节点' : 'Standard Nodes', url: '#team-subs' },
                { id: 'L4-437', title: isZh ? '标准清单' : 'Standard Checklists', url: '#notifications' }
              ]
            },
            {
              id: 'L3-106',
              title: isZh ? '软装资料库' : 'Soft Furnishing Library',
              icon: Users,
              children: [
                { id: 'L4-438', title: isZh ? '业界资料' : 'Industry References', url: '#pending' },
                { id: 'L4-439', title: isZh ? '模板库' : 'Template Library', url: '#severely-overdue' },
                { id: 'L4-440', title: isZh ? '公司成果' : 'Company Outputs', url: '#help-guide' },
                { id: 'L4-441', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#my-workspace' }
              ]
            },
            {
              id: 'L3-107',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [{ id: 'L4-442', title: isZh ? '软装专业线评审会' : 'Soft Furnishing Line Review Meeting', url: '#submissions' }]
            },
            {
              id: 'L3-108',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-443', title: isZh ? 'BIM' : 'BIM', url: '#pending' }]
            }
          ]
        },
        {
          id: 'L2-14',
          title: isZh ? '园林专业' : 'Landscape',
          icon: CheckSquare,
          seperateLine: ['L3-116'],
          children: [
            {
              id: 'L3-109',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
                { id: 'L4-444', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#pending' },
                { id: 'L4-445', title: isZh ? '前期策划' : 'Pre-planning', url: '#team-subs' },
                { id: 'L4-446', title: isZh ? '市政资料' : 'Municipal Data', url: '#overdue' },
                { id: 'L4-447', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#it-support' }
              ]
            },
            {
              id: 'L3-110',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-448', title: isZh ? '设计交底' : 'Design Briefing', url: '#team-subs' },
                { id: 'L4-449', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#notifications' },
                { id: 'L4-450', title: isZh ? '设计评审' : 'Design Review', url: '#pending' },
                { id: 'L4-451', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#severely-overdue' },
                { id: 'L4-452', title: isZh ? '成果会签' : 'Output Co-signing', url: '#help-guide' },
                { id: 'L4-453', title: isZh ? '成果确认' : 'Output Confirmation', url: '#my-workspace' },
                { id: 'L4-454', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#submissions' }
              ]
            },
            {
              id: 'L3-111',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-455', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#submissions' },
                { id: 'L4-456', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#pending' },
                { id: 'L4-457', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#team-subs' },
                { id: 'L4-458', title: isZh ? '设计师管理' : 'Designer Management', url: '#overdue' },
                { id: 'L4-459', title: isZh ? '室外雕塑' : 'Outdoor Sculptures', url: '#it-support' }
              ]
            },
            {
              id: 'L3-112',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-460', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#team-subs' },
                { id: 'L4-461', title: isZh ? '业务策略' : 'Business Strategy', url: '#notifications' },
                { id: 'L4-462', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#pending' },
                { id: 'L4-463', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#severely-overdue' },
                { id: 'L4-464', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#help-guide' }
              ]
            },
            {
              id: 'L3-113',
              title: isZh ? '苗木管理' : 'Nursery & Plant Mgmt',
              icon: Box,
              children: [
                { id: 'L4-465', title: isZh ? '苗木在线评标' : 'Online Plant Bidding', url: '#my-workspace' },
                { id: 'L4-466', title: isZh ? '合同样板苗' : 'Contract Sample Plants', url: '#submissions' },
                { id: 'L4-467', title: isZh ? '起苗通知书' : 'Plant Extraction Notice', url: '#submissions' },
                { id: 'L4-468', title: isZh ? '苗木配送进场' : 'Plant Delivery & Site Entry', url: '#pending' },
                { id: 'L4-469', title: isZh ? '苗木验收' : 'Plant Acceptance', url: '#team-subs' },
                { id: 'L4-470', title: isZh ? '苗木档案库' : 'Plant Archive Library', url: '#overdue' },
                { id: 'L4-471', title: isZh ? '养护管理' : 'Maintenance Mgmt', url: '#it-support' }
              ]
            },
            {
              id: 'L3-114',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-472', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#team-subs' },
                { id: 'L4-473', title: isZh ? '施工交底' : 'Construction Briefing', url: '#notifications' },
                { id: 'L4-474', title: isZh ? '实施策划' : 'Implementation Planning', url: '#pending' },
                { id: 'L4-475', title: isZh ? '样板管理' : 'Sample Management', url: '#severely-overdue' },
                { id: 'L4-476', title: isZh ? '材料管理' : 'Material Mgmt', url: '#help-guide' },
                { id: 'L4-477', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#my-workspace' },
                { id: 'L4-478', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#submissions' }
              ]
            },
            {
              id: 'L3-115',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-479', title: isZh ? '合同查询' : 'Contract Query', url: '#submissions' },
                { id: 'L4-480', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#pending' },
                { id: 'L4-481', title: isZh ? '质量管理' : 'Quality Management', url: '#team-subs' },
                { id: 'L4-482', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#overdue' },
                { id: 'L4-483', title: isZh ? '框架分单' : 'Framework Allocation', url: '#it-support' },
                { id: 'L4-484', title: isZh ? '供应商管理' : 'Supplier Management', url: '#team-subs' },
                { id: 'L4-485', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#notifications' }
              ]
            },
            {
              id: 'L3-116',
              title: isZh ? '园林标准文件' : 'Landscape Standards',
              icon: Folder,
              children: [
                { id: 'L4-486', title: isZh ? '设计标准' : 'Design Standards', url: '#pending' },
                { id: 'L4-487', title: isZh ? '工艺标准' : 'Process Standards', url: '#severely-overdue' },
                { id: 'L4-488', title: isZh ? '标准单元' : 'Standard Units', url: '#help-guide' },
                { id: 'L4-489', title: isZh ? '材料标准' : 'Material Standards', url: '#my-workspace' },
                { id: 'L4-490', title: isZh ? 'Standard Nodes' : 'Standard Nodes', url: '#submissions' },
                { id: 'L4-491', title: isZh ? '标准清单' : 'Standard Checklists', url: '#submissions' }
              ]
            },
            {
              id: 'L3-117',
              title: isZh ? '园林资料库' : 'Landscape Library',
              icon: Users,
              children: [
                { id: 'L4-492', title: isZh ? '业界资料' : 'Industry References', url: '#pending' },
                { id: 'L4-493', title: isZh ? '模板库' : 'Template Library', url: '#team-subs' },
                { id: 'L4-494', title: isZh ? '公司成果' : 'Company Outputs', url: '#overdue' },
                { id: 'L4-495', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#it-support' }
              ]
            },
            {
              id: 'L3-118',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [{ id: 'L4-496', title: isZh ? '园林专业线评审会' : 'Landscape Line Review Meeting', url: '#team-subs' }]
            }
          ]
        },
        {
          id: 'L2-15',
          title: isZh ? '工艺专业' : 'Process & Mechanical',
          icon: Briefcase,
          seperateLine: ['L3-125'],
          children: [
            {
              id: 'L3-119',
              title: isZh ? '项目启动' : 'Project Kickoff',
              icon: Clock,
              children: [
                { id: 'L4-497', title: isZh ? '启动资料' : 'Kickoff Documents', url: '#team-subs' },
                { id: 'L4-498', title: isZh ? '前期策划' : 'Pre-planning', url: '#pending' },
                { id: 'L4-499', title: isZh ? '市政资料' : 'Municipal Data', url: '#severely-overdue' },
                { id: 'L4-500', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#help-guide' }
              ]
            },
            {
              id: 'L3-120',
              title: isZh ? '方案-初步-施工图' : 'Scheme to Construction Drawings',
              icon: FileText,
              children: [
                { id: 'L4-501', title: isZh ? '设计交底' : 'Design Briefing', url: '#pending' },
                { id: 'L4-502', title: isZh ? '阶段成果' : 'Phase Outputs', url: '#severely-overdue' },
                { id: 'L4-503', title: isZh ? '设计评审' : 'Design Review', url: '#help-guide' },
                { id: 'L4-504', title: isZh ? '第三方审图' : 'Third-party Drawing Review', url: '#my-workspace' },
                { id: 'L4-505', title: isZh ? '成果会签' : 'Output Co-signing', url: '#submissions' },
                { id: 'L4-506', title: isZh ? '成果确认' : 'Output Confirmation', url: '#submissions' },
                { id: 'L4-507', title: isZh ? '配置管理' : 'Configuration Mgmt', url: '#pending' }
              ]
            },
            {
              id: 'L3-121',
              title: isZh ? '设计管理' : 'Design Management',
              icon: Briefcase,
              children: [
                { id: 'L4-508', title: isZh ? '设计计划管理' : 'Design Schedule Mgmt', url: '#team-subs' },
                { id: 'L4-509', title: isZh ? '设计进展跟踪' : 'Progress Tracking', url: '#logs-today' },
                { id: 'L4-510', title: isZh ? '设计合同变更管理' : 'Contract Change Mgmt', url: '#pending' },
                { id: 'L4-511', title: isZh ? '设计师管理' : 'Designer Management', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-122',
              title: isZh ? '招标配合' : 'Bidding Support',
              icon: ClipboardList,
              children: [
                { id: 'L4-512', title: isZh ? '采购需求' : 'Procurement Requirements', url: '#help-guide' },
                { id: 'L4-513', title: isZh ? '业务策略' : 'Business Strategy', url: '#my-workspace' },
                { id: 'L4-514', title: isZh ? '招标技术文件' : 'Technical Bidding Docs', url: '#submissions' },
                { id: 'L4-515', title: isZh ? '招标图确认' : 'Bidding Drawing Confirmation', url: '#submissions' },
                { id: 'L4-516', title: isZh ? '招标清单' : 'Bidding Bill of Quantities', url: '#pending' }
              ]
            },
            {
              id: 'L3-123',
              title: isZh ? '现场技术管理' : 'Site Tech Management',
              icon: HardHat,
              children: [
                { id: 'L4-517', title: isZh ? '图纸管理' : 'Drawing Mgmt', url: '#logs-archive' },
                { id: 'L4-518', title: isZh ? '施工交底' : 'Construction Briefing', url: '#safety-daily' },
                { id: 'L4-519', title: isZh ? '实施策划' : 'Implementation Planning', url: '#docs-permits' },
                { id: 'L4-520', title: isZh ? '样板管理' : 'Sample Management', url: '#team-subs' },
                { id: 'L4-521', title: isZh ? '材料管理' : 'Material Mgmt', url: '#logs-today' },
                { id: 'L4-522', title: isZh ? '专业巡检' : 'Specialty Inspection', url: '#pending' },
                { id: 'L4-523', title: isZh ? '项目复盘' : 'Project Post-mortem', url: '#severely-overdue' }
              ]
            },
            {
              id: 'L3-124',
              title: isZh ? '现场实施管理' : 'Site Implementation Mgmt',
              icon: Box,
              children: [
                { id: 'L4-524', title: isZh ? '合同查询' : 'Contract Query', url: '#help-guide' },
                { id: 'L4-525', title: isZh ? '工程计划管理' : 'Engineering Schedule Mgmt', url: '#my-workspace' },
                { id: 'L4-526', title: isZh ? '质量管理' : 'Quality Management', url: '#submissions' },
                { id: 'L4-527', title: isZh ? '工程变更管理' : 'Engineering Change Mgmt', url: '#submissions' },
                { id: 'L4-528', title: isZh ? '框架分单' : 'Framework Allocation', url: '#pending' },
                { id: 'L4-529', title: isZh ? '供应商管理' : 'Supplier Management', url: '#team-subs' },
                { id: 'L4-530', title: isZh ? '供应商付款' : 'Supplier Payment', url: '#overdue' }
              ]
            },
            {
              id: 'L3-125',
              title: isZh ? '工艺标准文件' : 'Process Standards',
              icon: Folder,
              children: [
                { id: 'L4-531', title: isZh ? '设计标准' : 'Design Standards', url: '#it-support' },
                { id: 'L4-532', title: isZh ? '工艺标准' : 'Process Standards', url: '#team-subs' },
                { id: 'L4-533', title: isZh ? '标准单元' : 'Standard Units', url: '#notifications' },
                { id: 'L4-534', title: isZh ? '材料标准' : 'Material Standards', url: '#pending' },
                { id: 'L4-535', title: isZh ? '标准节点' : 'Standard Nodes', url: '#severely-overdue' },
                { id: 'L4-536', title: isZh ? '标准清单' : 'Standard Checklists', url: '#help-guide' }
              ]
            },
            {
              id: 'L3-126',
              title: isZh ? '工艺资料库' : 'Process Library',
              icon: Users,
              children: [
                { id: 'L4-537', title: isZh ? '业界资料' : 'Industry References', url: '#my-workspace' },
                { id: 'L4-538', title: isZh ? '模板库' : 'Template Library', url: '#submissions' },
                { id: 'L4-539', title: isZh ? '公司成果' : 'Company Outputs', url: '#submissions' },
                { id: 'L4-540', title: isZh ? '正反案例' : 'Positive & Negative Cases', url: '#pending' }
              ]
            },
            {
              id: 'L3-127',
              title: isZh ? '汇报决策' : 'Reporting & Decision',
              icon: CheckSquare,
              children: [
                { id: 'L4-541', title: isZh ? '工艺专业线评审会' : 'Process Line Review Meeting', url: '#team-subs' },
                { id: 'L4-542', title: isZh ? '机电工艺专业线评审会' : 'MEP & Process Line Review', url: '#overdue' }
              ]
            },
            {
              id: 'L3-128',
              title: isZh ? '辅助设计' : 'Auxiliary Design',
              icon: Box,
              children: [{ id: 'L4-543', title: isZh ? 'BIM' : 'BIM', url: '#it-support' }]
            }
          ]
        }
      ]
    })