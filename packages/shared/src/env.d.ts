/**
 * 为 @ccs/shared 包声明 import.meta.env 类型。
 * 实际值由 Vite 的 define 插件在构建时注入。
 */

interface ImportMetaEnv {
	readonly OFFLINE_DOCS_SERVER?: string;
	readonly OFFLINE_DOCS_ANDROID?: string;
	readonly VITE_CCS_DOCS_BASE_URL?: string;
	readonly VITE_CCS_OFFLINE_DOCS_MANIFEST?: string;
	[key: string]: string | undefined;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
