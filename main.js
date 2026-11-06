import fs from 'node:fs/promises';
import path from 'node:path';
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
console.log(`Тека кешу готова: ${cacheDir}`);
