import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': here('./src/engine'),
      '@modules': here('./src/modules'),
      '@components': here('./src/components'),
      '@hooks': here('./src/hooks'),
      '@data': here('./src/data')
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
