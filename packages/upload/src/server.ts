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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
	return new Promise((resolvePromise, rejectPromise) => {
		const chunks: Buffer[] = [];
		let total = 0;
		req.on('data', (chunk: Buffer) => {
			total += chunk.length;
			if (total > MAX_BODY_BYTES) {
				rejectPromise(new Error('请求体超出大小上限'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolvePromise(Buffer.concat(chunks)));
		req.on('error', rejectPromise);
	});
}

function sanitizeName(name: string): string {
	const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
	return cleaned || 'photo';
}

async function handleUpload(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const contentType = req.headers['content-type'] ?? '';
	if (!contentType.includes('multipart/form-data')) {
		sendJson(res, 415, { ok: false, message: '需要 multipart/form-data 请求' });
		return;
	}

	const bodyBuffer = await readRequestBody(req);

	// 借助 Node 内置的 Request/FormData（基于 undici）解析 multipart，零额外依赖。
	const request = new Request('http://localhost/upload', {
		method: 'POST',
		headers: { 'content-type': contentType },
		body: bodyBuffer,
	});

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) {
		sendJson(res, 400, { ok: false, message: '缺少 file 字段' });
		return;
	}

	const id = typeof form.get('id') === 'string' ? (form.get('id') as string) : '';
	const capturedAtRaw = form.get('capturedAt');
	const capturedAt = typeof capturedAtRaw === 'string' ? capturedAtRaw : null;

	const receivedAt = new Date().toISOString();
	const savedAs = sanitizeName(file.name);
	const targetPath = join(UPLOAD_DIR, savedAs);

	const bytes = Buffer.from(await file.arrayBuffer());
	await writeFile(targetPath, bytes);

	const record: UploadRecord = {
		ok: true,
		id,
		savedAs,
		originalName: file.name,
		mimeType: file.type || 'application/octet-stream',
		sizeBytes: bytes.byteLength,
		capturedAt,
		receivedAt,
	};
	await writeFile(`${targetPath}.json`, JSON.stringify(record, null, 2));

	console.log(
		`[upload] 已接收 ${record.originalName} (${record.sizeBytes} bytes) -> ${savedAs}`,
	);
	sendJson(res, 200, record);
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
