/**
 * 离线拍照上传服务 —— 演示用最小 Node.js 接收端。
 *
 * - 端点：POST /upload（multipart/form-data）
 * - 字段：file（图片）、id、capturedAt —— 与 packages/shared/src/offline-photos 的
 *   uploadPhoto() 发送的表单字段保持一致。
 * - 行为：把图片落盘到 uploads/ 并写一个同名 .json 元数据，返回 JSON 结果。
 *
 * 启动：pnpm upload:server（HTTP） / pnpm upload:ssl（HTTPS）
 * 可选环境变量：
 *   UPLOAD_PORT       监听端口（默认 8082）
 *   UPLOAD_HOST       监听地址（默认 0.0.0.0）
 *   UPLOAD_DIR        文件保存目录（默认 packages/upload/uploads）
 *   UPLOAD_TLS_CERT   PEM 证书路径（与 UPLOAD_TLS_KEY 同时提供时启用 HTTPS）
 *   UPLOAD_TLS_KEY    PEM 私钥路径
 */

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Busboy } from '@fastify/busboy';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');

const PORT = Number(process.env.UPLOAD_PORT ?? 8082);
const HOST = process.env.UPLOAD_HOST ?? '0.0.0.0';
const UPLOAD_DIR = process.env.UPLOAD_DIR
	? resolve(process.env.UPLOAD_DIR)
	: resolve(PACKAGE_ROOT, '../../documents');
const TLS_CERT = process.env.UPLOAD_TLS_CERT;
const TLS_KEY = process.env.UPLOAD_TLS_KEY;

const MAX_BODY_BYTES = 256 * 1024 * 1024; // 256MB 上限，演示足够

type UploadRecord = {
	ok: true;
	id: string;
	savedAs: string;
	originalName: string;
	mimeType: string;
	sizeBytes: number;
	capturedAt: string | null;
	receivedAt: string;
	latitude?: number;
	longitude?: number;
	locationAccuracy?: number;
	locationProvider?: string;
};

function setCorsHeaders(res: ServerResponse): void {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
	const payload = JSON.stringify(body);
	res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(payload);
}

function sanitizeName(name: string): string {
	const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
	return cleaned || 'photo';
}

function parseFloatOrUndefined(val: string | undefined): number | undefined {
	if (val == null) return undefined;
	const n = Number(val);
	return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// 上传处理（基于 @fastify/busboy 流式解析，不缓冲整个文件）
// ---------------------------------------------------------------------------

async function handleUpload(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const contentType = req.headers['content-type'] ?? '';
	if (!contentType.includes('multipart/form-data')) {
		sendJson(res, 415, { ok: false, message: '需要 multipart/form-data 请求' });
		return;
	}

	// 将事件驱动的 busboy 包装为 Promise，确保 await 等待上传完成再响应
	const UPLOAD_TIMEOUT_MS = 120_000; // 2 分钟超时
	return new Promise<void>((resolve) => {
		const busboy = new Busboy({
			headers: { 'content-type': contentType },
			limits: { fileSize: MAX_BODY_BYTES },
		});

		const fields = new Map<string, string>();
		let filename = '';
		let mimeType = 'application/octet-stream';
		let savedPath = '';
		let fileBytes = 0;
		let fileWriteStream: ReturnType<typeof createWriteStream> | null = null;
		let resolved = false;

		// 超时保护
		const timer = setTimeout(() => {
			if (resolved) return;
			console.error('[upload] 上传超时');
			if (fileWriteStream) {
				fileWriteStream.close();
				import('node:fs/promises').then((fs) =>
					fs.unlink(savedPath).catch(() => undefined),
				);
			}
			req.destroy();
			sendJson(res, 408, { ok: false, message: '上传超时' });
			done();
		}, UPLOAD_TIMEOUT_MS);

		function done() {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			resolve();
		}

		busboy.on(
			'file',
			(
				fieldname: string,
				fileStream: NodeJS.ReadableStream,
				filenameStr: string,
				_encoding: string,
				mimeTypeStr: string,
			) => {
				filename = filenameStr;
				if (!filename) {
					// 无文件名的 part，丢弃数据并继续
					fileStream.resume();
					return;
				}
				mimeType = mimeTypeStr || 'application/octet-stream';
				savedPath = join(UPLOAD_DIR, sanitizeName(filename));
				fileWriteStream = createWriteStream(savedPath);

				fileWriteStream.on('error', (err) => {
					console.error('[upload] 写文件失败:', err.message);
					req.destroy();
					sendJson(res, 500, { ok: false, message: '文件写入失败' });
					done();
				});

				fileStream.on('data', (chunk: Buffer) => {
					fileBytes += chunk.length;
				});

				fileStream.pipe(fileWriteStream);
			},
		);

		busboy.on('field', (fieldname: string, val: string) => {
			fields.set(fieldname, val);
		});

		busboy.on('finish', () => {
			if (resolved) return;

			if (!filename) {
				sendJson(res, 400, { ok: false, message: '缺少 file 字段' });
				done();
				return;
			}

			const id = fields.get('id') ?? '';
			const capturedAt = fields.get('capturedAt') ?? null;
			const receivedAt = new Date().toISOString();

			const record: UploadRecord = {
				ok: true,
				id,
				savedAs: filename,
				originalName: filename,
				mimeType,
				sizeBytes: fileBytes,
				capturedAt,
				receivedAt,
				latitude: parseFloatOrUndefined(fields.get('latitude')),
				longitude: parseFloatOrUndefined(fields.get('longitude')),
				locationAccuracy: parseFloatOrUndefined(fields.get('locationAccuracy')),
				locationProvider: fields.get('locationProvider') || undefined,
			};

			writeFile(`${savedPath}.json`, JSON.stringify(record, null, 2))
				.then(() => {
					console.log(
						`[upload] 已接收 ${record.originalName} (${record.sizeBytes} bytes) -> ${filename}`,
					);
					sendJson(res, 200, record);
					done();
				})
				.catch((err) => {
					console.error('[upload] 写元数据失败:', err);
					sendJson(res, 500, { ok: false, message: '元数据写入失败' });
					done();
				});
		});

		busboy.on('error', (err: Error) => {
			if (resolved) return;
			console.error('[upload] busboy 解析失败:', err.message);
			if (fileWriteStream) {
				fileWriteStream.close();
				import('node:fs/promises').then((fs) =>
					fs.unlink(savedPath).catch(() => undefined),
				);
			}
			sendJson(res, 400, { ok: false, message: err.message });
			req.destroy();
			done();
		});

		req.pipe(busboy);
	});
}



async function handler(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	setCorsHeaders(res);

	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
	const method = req.method ?? 'GET';

	if (method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}

	if (url.pathname === '/upload' && method === 'POST') {
		try {
			await handleUpload(req, res);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error('[upload] 处理失败:', message);
			sendJson(res, 500, { ok: false, message });
		}
		return;
	}

	if ((url.pathname === '/' || url.pathname === '/upload') && method === 'GET') {
		sendJson(res, 200, {
			ok: true,
			service: '@ccs/upload',
			endpoint: '/upload',
			method: 'POST multipart/form-data (file, id, capturedAt)',
			uploadDir: UPLOAD_DIR,
		});
		return;
	}

	sendJson(res, 404, { ok: false, message: '未找到资源' });
}

function listLanIps(): string[] {
	const ips: string[] = [];
	const interfaces = networkInterfaces();
	for (const list of Object.values(interfaces)) {
		for (const info of list ?? []) {
			if (info.family === 'IPv4' && !info.internal) ips.push(info.address);
		}
	}
	return ips;
}

async function start(): Promise<void> {
	await mkdir(UPLOAD_DIR, { recursive: true });

	let server;
	let scheme = 'http';
	if (TLS_CERT && TLS_KEY) {
		const [cert, key] = await Promise.all([
			readFile(resolve(TLS_CERT)),
			readFile(resolve(TLS_KEY)),
		]);
		server = createHttpsServer({ cert, key }, handler);
		scheme = 'https';
	} else {
		server = createHttpServer(handler);
	}

	server.listen(PORT, HOST, () => {
		console.log('[upload] 离线拍照上传服务已启动');
		console.log(`[upload] 保存目录: ${UPLOAD_DIR}`);
		console.log(`[upload] 本机: ${scheme}://localhost:${PORT}/upload`);
		for (const ip of listLanIps()) {
			console.log(`[upload] 局域网: ${scheme}://${ip}:${PORT}/upload`);
		}
		if (scheme === 'http') {
			console.log(
				'[upload] 提示: 当前为 HTTP，请把前端上传地址改为 http://<ip>:'
					+ `${PORT}/upload；如需 HTTPS，设置 UPLOAD_TLS_CERT/UPLOAD_TLS_KEY。`,
			);
		}
	});
}

start().catch((error) => {
	console.error('[upload] 启动失败:', error);
	process.exit(1);
});
