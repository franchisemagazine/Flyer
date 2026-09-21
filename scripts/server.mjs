import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import health from '../api/health.js';
import productImage from '../api/product-image.js';
import generate from '../api/generate.js';
const root=resolve('dist'),port=Number(process.env.PORT||4173),routes={'/api/health':health,'/api/product-image':productImage,'/api/generate':generate};
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(routes[pathname])return await routes[pathname](req,res);if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}const path=resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));if(!path.startsWith(root+'/')){res.writeHead(403);return res.end();}if(!(await stat(path)).isFile())throw new Error('Not found');res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:await readFile(path));}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'0.0.0.0',()=>console.log(`Flyers development server: http://localhost:${port}`));
