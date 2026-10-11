import {readFileSync,writeFileSync} from 'node:fs';
import {MEMES} from './memes.js';
import {CONTEXT_PROMPTS} from './context.js';
import {SPY_CATEGORIES,SPY_LOCATIONS,spyPool} from './spy-bank.js';
const read=f=>readFileSync(new URL('./'+f,import.meta.url),'utf8');
const inline=f=>read(f).replace(/^import .*;\n/gm,'').replaceAll('export const','const').replaceAll('export function','function');
const bank=MEMES.map(({id,path,width,height})=>({id,path,width,height}));
const assets={'index.html':{redirect:'https://kittler777.github.io/peremena-quiz/',body:'',type:'text/html'}};
const code=`// Generated API for existing Railway service. UI and assets remain on Pages.
import { Database } from 'bun:sqlite';
const MEMES=${JSON.stringify(bank)};
const CONTEXT_PROMPTS=${JSON.stringify(CONTEXT_PROMPTS)};
${read('spy-bank.js').replaceAll('export const','const')}
${inline('secret-games.js')}
${inline('core.js')}
${inline('transport.js')}
const assets=${JSON.stringify(assets)};
const mount=Bun.env.RAILWAY_VOLUME_MOUNT_PATH;
const db=new Database(mount?mount+'/memes.sqlite':':memory:');
db.exec('PRAGMA journal_mode=WAL;');
const handle=createTransport(createGame(db,MEMES),assets,Bun.env.PUBLIC_ORIGIN);
Bun.serve({port:Number(Bun.env.PORT)||3000,hostname:'0.0.0.0',maxRequestBodySize:8192,fetch(request,server){return handle(request,server.requestIP(request)?.address||'unknown')}});
`;
writeFileSync(new URL('./railway.ts',import.meta.url),code);console.log('Railway API built: '+Buffer.byteLength(code)+' bytes');
