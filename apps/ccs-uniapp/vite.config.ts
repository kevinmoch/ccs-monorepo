import { defineConfig } from 'vite';
import uniPlugin from '@dcloudio/vite-plugin-uni';

type UniPluginFactory = () => ReturnType<typeof uniPlugin>;
const maybeWrappedUniPlugin = uniPlugin as unknown as UniPluginFactory | { default: UniPluginFactory };
const uni = typeof maybeWrappedUniPlugin === 'function' ? maybeWrappedUniPlugin : maybeWrappedUniPlugin.default;

export default defineConfig({ plugins: [uni()] });
