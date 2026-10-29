import http from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../frontend/public/', import.meta.url));
const port = Number(process.env.FRONTEND_PORT || 5173), target = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:3001');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.wav':'audio/wav' };
const server = http.createServer(async(req,res) => {
  if (req.url.startsWith('/api/')) {
    const proxy = http.request(new URL(req.url, target), { method:req.method, headers:{...req.headers,host:target.host} }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); res.on('close',()=>upstream.destroy());
    });
    proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'BACKEND_OFFLINE',message:'应用后端尚未启动'}}))});
    req.pipe(proxy); return;
  }
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname), path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(root.replace(/\/$/,'')+sep)||!['GET','HEAD'].includes(req.method))throw Error();
    const info=await stat(path);if(!info.isFile())throw Error();
    const data=await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found')}
});
server.listen(port,'127.0.0.1',()=>console.log(`Heudio frontend: http://127.0.0.1:${port}`));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(()=>process.exit(0)));
