import basicSsl from '@vitejs/plugin-basic-ssl';

/** @type {import('vite').UserConfig} */
export default {
  plugins: [basicSsl()],
  preview: {
    port: parseInt(process.env.CCS_PREVIEW_PORT ?? '3000', 10),
    host: '0.0.0.0',
    strictPort: true,
  },
};
