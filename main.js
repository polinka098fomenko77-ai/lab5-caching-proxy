import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { Command } from 'commander';

// ---------- Параметри командного рядка ----------
const program = new Command();

program
  .helpOption('--help', 'показати довідку')
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до теки кешу');

program.parse(process.argv);
const options = program.opts();

const port = Number(options.port);
if (options.port.trim() === '' || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Помилка: порт має бути цілим числом від 1 до 65535');
  process.exit(1);
}

const cacheDir = path.resolve(options.cache);

// ---------- Підготовка теки кешу ----------
async function prepareCacheDir() {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
  } catch (error) {
    console.error(`Не вдалося створити теку кешу: ${error.message}`);
    process.exit(1);
  }
}

await prepareCacheDir();

// ---------- Відповідь з повідомленням ----------
function sendMessage(res, status, message, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(message);
}

// ---------- Обробник запитів ----------
const ALLOWED_METHODS = ['GET', 'PUT', 'DELETE'];

async function handleRequest(req, res) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    sendMessage(res, 405, `Метод ${req.method} не дозволено`, { Allow: ALLOWED_METHODS.join(', ') });
    return;
  }

  sendMessage(res, 501, `Метод ${req.method} ще не реалізовано`);
}

// ---------- Запуск сервера ----------
const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    console.error('Необроблена помилка в обробнику запиту:', error);
    if (!res.headersSent) {
      sendMessage(res, 500, 'Внутрішня помилка сервера');
    }
  }
});

try {
  server.listen(port, options.host);
  await once(server, 'listening');
  console.log(`Проксі-сервер запущено: http://${options.host}:${port}/`);
} catch (error) {
  console.error(`Не вдалося запустити сервер: ${error.message}`);
  process.exit(1);
}
