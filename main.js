import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { Command } from 'commander';
import superagent from 'superagent';

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

// ---------- Допоміжні функції ----------

// Відповідь з текстовим повідомленням
function sendMessage(res, status, message, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(message);
}

// Код стану зі шляху: приймаємо лише /ТРИ_ЦИФРИ, інакше null
function parseCode(req) {
  const pathname = req.url.split('?')[0];
  const match = /^\/(\d{3})$/.exec(pathname);
  return match ? match[1] : null;
}

// Шлях до файлу кешу для коду
function cachePath(code) {
  return path.join(cacheDir, `${code}.jpg`);
}

// Тіло запиту цілком (потік шматків склеюємо в один Buffer)
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Картинка з http.cat: Buffer або null, якщо отримати не вдалося
async function fetchFromCat(code) {
  try {
    const response = await superagent
      .get(`https://http.cat/${code}`)
      .buffer(true)
      .parse(superagent.parse.image)
      .timeout({ response: 5000, deadline: 15000 });

    if (Buffer.isBuffer(response.body) && response.body.length > 0) {
      return response.body;
    }
    return null;
  } catch (error) {
    console.error(`Запит до http.cat для ${code} завершився помилкою: ${error.message}`);
    return null;
  }
}

// ---------- Метод GET ----------
async function handleGet(code, res) {
  const filePath = cachePath(code);
  let image;
  let source;

  try {
    image = await fs.readFile(filePath);
    source = 'HIT';
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    image = await fetchFromCat(code);
    if (image === null) {
      sendMessage(res, 404, `Картинку для коду ${code} не знайдено`);
      return;
    }

    await fs.writeFile(filePath, image);
    source = 'MISS';
  }

  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'X-Cache': source });
  res.end(image);
}

// ---------- Метод PUT ----------
async function handlePut(code, req, res) {
  const body = await readBody(req);

  if (body.length === 0) {
    sendMessage(res, 400, 'Тіло запиту порожнє: потрібно передати картинку');
    return;
  }

  await fs.writeFile(cachePath(code), body);
  sendMessage(res, 201, `Картинку для коду ${code} збережено в кеш`);
}

// ---------- Обробник запитів ----------
const ALLOWED_METHODS = ['GET', 'PUT', 'DELETE'];

async function handleRequest(req, res) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    sendMessage(res, 405, `Метод ${req.method} не дозволено`, { Allow: ALLOWED_METHODS.join(', ') });
    return;
  }

  const code = parseCode(req);
  if (code === null) {
    sendMessage(res, 404, 'Некоректний шлях: очікується /<код стану HTTP>, наприклад /200');
    return;
  }

  if (req.method === 'GET') {
    await handleGet(code, res);
    return;
  }

  if (req.method === 'PUT') {
    await handlePut(code, req, res);
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
