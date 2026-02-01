import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

// Plugin to copy static files after build
const copyStaticFiles = () => ({
    name: 'copy-static-files',
    writeBundle() {
        // Ensure popup directory exists
        const popupDir = resolve(__dirname, 'dist/popup');
        if (!existsSync(popupDir)) {
            mkdirSync(popupDir, { recursive: true });
        }

        // Copy popup HTML and CSS
        copyFileSync(
            resolve(__dirname, 'src/popup/popup.html'),
            resolve(__dirname, 'dist/popup/popup.html')
        );
        copyFileSync(
            resolve(__dirname, 'src/popup/popup.css'),
            resolve(__dirname, 'dist/popup/popup.css')
        );

        // Copy manifest
        copyFileSync(
            resolve(__dirname, 'manifest.json'),
            resolve(__dirname, 'dist/manifest.json')
        );

        // Copy icons
        const iconsDir = resolve(__dirname, 'src/icons');
        const distIconsDir = resolve(__dirname, 'dist/icons');
        if (existsSync(iconsDir)) {
            if (!existsSync(distIconsDir)) {
                mkdirSync(distIconsDir, { recursive: true });
            }
            const icons = readdirSync(iconsDir);
            for (const icon of icons) {
                if (icon.endsWith('.png') || icon.endsWith('.svg')) {
                    copyFileSync(
                        resolve(iconsDir, icon),
                        resolve(distIconsDir, icon)
                    );
                }
            }
        }
    },
});

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                content: resolve(__dirname, 'src/content/index.ts'),
                background: resolve(__dirname, 'src/background/index.ts'),
                'popup/popup': resolve(__dirname, 'src/popup/popup.ts'),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]',
            },
        },
        sourcemap: true,
        minify: false,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    plugins: [copyStaticFiles()],
});

