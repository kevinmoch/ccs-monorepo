import type { CardDefinition } from '@ccs/card';

export default {
  cards: [
    {
      id: 'sample-header',
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 2 },
      props: {
        title: '待我处理',
        description: '审查并签署您队列中的结构和机械图纸。此处项目需要您的立即签署或拒绝。',
        breadcrumb: ['设计管理', '图纸审批', '待我处理']
      }
    },
    {
      id: 'sample-stat-1',
      layout: { colSpan: { base: 6, md: 3 }, rowSpan: 1 },
      props: { label: '待办总数', value: '14', color: 'blue' }
    },
    {
      id: 'sample-stat-2',
      layout: { colSpan: { base: 6, md: 3 }, rowSpan: 1 },
      props: { label: '紧急项目', value: '03', color: 'red' }
    },
    {
      id: 'sample-stat-3',
      layout: { colSpan: { base: 6, md: 3 }, rowSpan: 1 },
      props: { label: '今日到期', value: '02', color: 'blue' }
    },
    {
      id: 'sample-stat-4',
      layout: { colSpan: { base: 6, md: 3 }, rowSpan: 1 },
      props: { label: '等待中', value: '09', color: 'green' }
    },
    {
      id: 'sample-drawing-1',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 },
      props: {
        drawingId: 'STR-B1-0044',
        title: '基础平面图 - B节',
        discipline: '结构',
        submitter: '张三',
        dueDate: '今天',
        isUrgent: true
      }
    },
    {
      id: 'sample-drawing-2',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 },
      props: {
        drawingId: 'MEP-L2-0111',
        title: '暖通布局 - 2层',
        discipline: '机械',
        submitter: '李四',
        dueDate: 'Oct 24, 2026',
        isUrgent: false
      }
    }
  ] satisfies CardDefinition[]
};
