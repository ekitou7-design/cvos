import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import { emptyState,stateSchema } from './domain.js';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.env.CVOS_DATA_DIR;
export const dataDir=path.resolve(requested || path.join(root,'..','private-data'));
fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
const realData=fs.realpathSync(dataDir),realRoot=fs.realpathSync(root);
if(realData===realRoot||realData.startsWith(realRoot+path.sep)||realRoot.startsWith(realData+path.sep))throw new Error('CVOS_DATA_DIR 必须在代码仓库之外。');
process.umask(0o077);
export const db=new DatabaseSync(path.join(dataDir,'cvos.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);');
db.prepare('INSERT OR IGNORE INTO state VALUES(1,0,?)').run(JSON.stringify(emptyState()));
const keyPath=path.join(dataDir,'secrets.key');
if(!fs.existsSync(keyPath))fs.writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});
const key=fs.readFileSync(keyPath);
export function encrypt(s){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([c.update(s,'utf8'),c.final()]);return [iv,c.getAuthTag(),body].map(b=>b.toString('base64')).join('.');}
export function decrypt(s){const [iv,tag,body]=s.split('.').map(x=>Buffer.from(x,'base64'));const d=createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);return Buffer.concat([d.update(body),d.final()]).toString('utf8');}
export function readState(){const r=db.prepare('SELECT * FROM state WHERE id=1').get();return {revision:r.revision,state:JSON.parse(r.body)};}
export function saveState(state,revision){const valid=stateSchema.parse(state);const result=db.prepare('UPDATE state SET body=?,revision=revision+1 WHERE id=1 AND revision=?').run(JSON.stringify(valid),revision);if(!result.changes){const e=new Error('资料已被另一个窗口修改，请刷新后重试。');e.status=409;throw e;}return readState();}
export function settings(){return JSON.parse(db.prepare('SELECT body FROM settings WHERE id=1').get()?.body||'{"activeId":"","providers":[]}');}
export function writeSettings(s){db.prepare('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(JSON.stringify(s));}
export function publicSettings(){const s=settings();return {...s,providers:s.providers.map(({secret,...p})=>({...p,hasKey:!!secret}))};}
