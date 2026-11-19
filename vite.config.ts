import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Production-only Content Security Policy: the app may only load its own code and talk to the book services it uses. */
const CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "worker-src 'self' blob:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: blob: https:", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  'connect-src \'self\' https://www.googleapis.com https://openlibrary.org https://inventaire.io https://api.hardcover.app https://api.anthropic.com',
].join('; ')
const cspPlugin = () => ({ name: 'booktopus-csp', apply: 'build' as const, transformIndexHtml: (html: string) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`) })

// base './' keeps every asset path relative, so the same build works on
// https://<user>.github.io/<repo>/ and on a custom domain.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspPlugin()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
