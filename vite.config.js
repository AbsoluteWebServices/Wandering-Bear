import { defineConfig, loadEnv } from 'vite'
import shopify from 'vite-plugin-shopify'
import tailwindcss from '@tailwindcss/vite'
import { unlink } from 'node:fs/promises'
import { glob } from 'glob'
import { prefix } from './package.json'

const PACKAGE_PREFIX = prefix

const cleanOldAssets = () => ({
  name: 'clean-old-assets',
  buildStart: async () => {
    try {
      const files = glob.sync(`assets/**/${PACKAGE_PREFIX}-*.{css,js,svg}`)

      for (const file of files) {
        await unlink(file)
        console.log(`Deleted ${file}`)
      }

      console.log('Cleaned up assets folder')
    } catch (error) {
      console.error(`Error: ${error}`)
    }
  },
})

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      shopify({
        sourceCodeDir: 'frontend',
        entrypointsDir: 'frontend/entrypoints',
        snippetFile: 'vite-tag.liquid',
      }),
      tailwindcss(),
      cleanOldAssets(),
    ],
    server: {
      cors: true,
    },
    build: {
      emptyOutDir: false,
      rollupOptions: {
        output: {
          entryFileNames: `${PACKAGE_PREFIX}-[name].[hash].js`,
          chunkFileNames: `${PACKAGE_PREFIX}-[name].[hash].js`,
          assetFileNames: `${PACKAGE_PREFIX}-[name].[hash][extname]`,
        },
      },
    },
  }
})
