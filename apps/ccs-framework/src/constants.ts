import { MOCK_PROJECTS } from './data/projects';
export { MOCK_PROJECTS };

export interface ProjectInfo {
  id: string;
  name: string;
  code?: string;
}

export interface UserInfo {
  id: string;
  name: {
    zh: string;
    en: string;
  };
  notifications: Notification[];
  projects: ProjectInfo[];
}

export interface Notification {
  id: string;
  title: {
    zh: string;
    en: string;
  };
  content: {
    zh: string;
    en: string;
  };
  timestamp: string;
  isRead: boolean;
}

export const fetchUserInfo = async (): Promise<UserInfo> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: 'user-001',
        name: { zh: '基小建', en: 'Little Jijian' },
        notifications: [
          {
            id: 'n1',
            title: { zh: '新图纸分配', en: 'New Drawing Assigned' },
            content: { zh: '您有一份新的基础平面图待审查。', en: 'You have a new foundation plan pending review.' },
            timestamp: '10m ago',
            isRead: false
          },
          {
            id: 'n2',
            title: { zh: '系统更新', en: 'System Update' },
            content: { zh: 'CCS 系统已更新至 v2.4 版本。', en: 'CCS system updated to v2.4.' },
            timestamp: '2h ago',
            isRead: false
          }
        ],
        projects: MOCK_PROJECTS
      });
    }, 400);
  });
};
