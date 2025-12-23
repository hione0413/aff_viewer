/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_DATA_URL?: string
  readonly VITE_CDN_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
