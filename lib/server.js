import { readFileSync } from 'node:fs';
import { createCatalog } from './catalog.js';
export const catalog = createCatalog(JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url))), JSON.parse(readFileSync(new URL('../data/category-overrides.json',import.meta.url))));
export function json(res, status, data) {
  res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(data));
}
export function query(req) {return new URL(req.url,'https://flyers.local').searchParams;}
export async function body(req, limit=3_500_000) {
  if (req.body !== undefined) {
    if (Buffer.byteLength(typeof req.body==='string'?req.body:JSON.stringify(req.body))>limit) throw new Error('Request too large.');
    return typeof req.body==='string'?JSON.parse(req.body):req.body;
  }
  let size=0; const parts=[];
  for await (const part of req) {size+=part.length;if(size>limit) throw new Error('Request too large.');parts.push(part);}
  return JSON.parse(Buffer.concat(parts).toString());
}
