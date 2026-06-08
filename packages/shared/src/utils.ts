/**
 * 通用工具函数，供考勤打卡、离线文档等模块复用。
 */

import type { DocumentFileType } from './offline-docs/types';

/**
 * 格式化字节数为人类可读字符串。
 * @example formatBytes(1024) => "1 KB"
 */
export function formatBytes(bytes?: number): string {
	if (!bytes || bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 将任意错误对象标准化为可读字符串。
 */
export function normalizeError(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return '操作失败，请稍后重试';
}

/**
 * 安全地打开外部链接（新标签页）。
 */
export function openExternalLink(url: string): void {
	window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * 为 Promise 添加超时保护。
 * @param promise   原始 Promise
 * @param timeout   超时毫秒数
 * @param message   超时错误消息
 */
export function withTimeout<T>(
	promise: Promise<T>,
	timeout: number,
	message: string,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error(message)), timeout);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				window.clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/**
 * 安全解析数字字符串，解析失败返回 undefined。
 */
export function parseNumber(value: string | null | undefined): number | undefined {
	if (!value) return undefined;
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

/**
 * 安全清理文件名中的非法字符。
 */
export function sanitizeFileName(value: string): string {
	return value.replace(/[^a-z0-9._-]/gi, '_');
}

/**
 * 从 URL 中提取文件扩展名。
 */
export function getFileExtension(urlText: string): string | undefined {
	try {
		const pathname = new URL(urlText, 'http://localhost').pathname;
		const match = pathname.match(/\.([a-z0-9]+)$/i);
		return match?.[1]?.toLowerCase();
	} catch {
		return undefined;
	}
}

/**
 * 从 MIME 类型推导文件类型。
 * @example deriveFileType('application/pdf') => 'pdf'
 */
export function deriveFileType(mimeType: string): DocumentFileType {
	const mime = mimeType.toLowerCase();
	if (mime.startsWith('image/')) return 'image';
	if (mime === 'application/pdf') return 'pdf';
	if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'docx';
	if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'xlsx';
	// 从 MIME 子类型中提取最后一段作为兜底
	const parts = mime.split('/');
	return parts[1]?.split('.').pop() ?? 'unknown';
}
