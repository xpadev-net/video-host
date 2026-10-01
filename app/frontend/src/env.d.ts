/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ENDPOINT: string;
  readonly VITE_SITE_NAME?: string;
  readonly VITE_ENABLE_COMMENTS?: string;
  readonly VITE_REQUIRE_SIGNUP_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
