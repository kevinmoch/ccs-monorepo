import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    {
      type: 'title',
      title: { 'zh-CN': '标题栏', 'en-US': 'Title Bar' },
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 2 },
      props: {
        label: { 'zh-CN': '考勤打卡', 'en-US': 'Attendance' }
      }
    },
    {
      type: 'geolocation',
      title: { 'zh-CN': '地理位置', 'en-US': 'Geolocation' },
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 3 },
      props: {
        label: { 'zh-CN': '当前位置', 'en-US': 'Current Location' }
      }
    },
    {
      type: 'stat',
      title: { 'zh-CN': '班次信息', 'en-US': 'Shift Information' },
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 3 },
      props: {
        label: { 'zh-CN': '班次数据', 'en-US': 'Shift Data' }
      }
    },
    {
      type: 'list',
      title: { 'zh-CN': '定位方式', 'en-US': 'Location Method' },
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 2 },
      props: {
        label: { 'zh-CN': '定位方式', 'en-US': 'Location Method' }
      }
    }
  ] satisfies CardDefinition[]
};
