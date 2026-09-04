import { defineConfig } from 'vitest/config';

// Vitest 4 已移除 vitest.workspace.ts（defineWorkspace 不复存在，旧文件被静默忽略，
// 测试会退化成根项目按默认 include 扫全仓库——apps/**/e2e 的 playwright spec 都会被误收）。
// projects 是唯一入口；根配置不当测试项目用，include 置空，测试一律归属下面的项目。
export default defineConfig({
  test: {
    include: [],
    projects: ['packages/shared/vitest.config.ts', 'packages/cli/vitest.config.ts', 'extensions/ccs-ai-assistant/vitest.config.ts']
  }
});
