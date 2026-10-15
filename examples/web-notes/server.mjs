import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Deliberately GUI-only: application state lives in the browser. No task API.
export function startServer(port = 3100) {
  const server = createServer(async (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await readFile(new URL('./index.html', import.meta.url)));
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1]?.endsWith('/server.mjs') || process.argv[1]?.endsWith('\\server.mjs')) {
  const server = await startServer(Number(process.env.PORT ?? 3100));
  console.log(`GUI-only Notes fixture: http://127.0.0.1:${server.address().port}`);
}
