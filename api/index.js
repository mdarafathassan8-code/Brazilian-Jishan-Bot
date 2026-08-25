const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function init(){
  await db.batch([
    {sql:`CREATE TABLE IF NOT EXISTS purchases(id INTEGER PRIMARY KEY AUTOINCREMENT,reference TEXT,proof TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',access_id TEXT,password_hash TEXT,created_at INTEGER NOT NULL,approved_at INTEGER,expires_at INTEGER,payment_method TEXT,payment_account TEXT)`},
    {sql:`CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,access_id TEXT NOT NULL,device_id TEXT NOT NULL,created_at INTEGER NOT NULL)`},
  ],{transaction:true});
  try{await db.execute(`ALTER TABLE purchases ADD COLUMN payment_method TEXT`)}catch{}
  try{await db.execute(`ALTER TABLE purchases ADD COLUMN payment_account TEXT`)}catch{}
}
const json=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))};
const body=async req=>{let s='';for await(const c of req)s+=c;try{return s?JSON.parse(s):{}}catch{throw new Error('Invalid JSON request.')}};
const auth=async req=>{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;const r=await db.execute({sql:'SELECT s.*,p.expires_at FROM sessions s JOIN purchases p ON p.access_id=s.access_id WHERE s.token=? AND p.status=\'approved\'',args:[h.slice(7)]});return r.rows[0]||null};

async function handler(req,res){
  try{
    await init();
    const path=new URL(req.url,'http://localhost').pathname;
    if(req.method==='POST'&&path==='/api/purchase'){
      const b=await body(req);
      if(!b.proof||typeof b.proof!=='string'||b.proof.length>2_400_000)return json(res,400,{error:'Payment screenshot is too large. Please choose a smaller screenshot.'});
      await db.execute({sql:'INSERT INTO purchases(reference,proof,payment_method,payment_account,created_at) VALUES(?,?,?,?,?)',args:[String(b.reference||'').slice(0,80),b.proof,String(b.payment_method||'BINANCE').slice(0,30),String(b.payment_account||'853973504').slice(0,80),Date.now()]});
      return json(res,201,{ok:true});
    }
    if(req.method==='POST'&&path==='/api/login'){
      const b=await body(req);const r=await db.execute({sql:'SELECT * FROM purchases WHERE access_id=? AND status=\'approved\' LIMIT 1',args:[String(b.id||'').trim()]});const p=r.rows[0];
      if(!p)return json(res,401,{error:'Invalid ID or password.'});
      if(p.expires_at&&Date.now()>p.expires_at)return json(res,403,{error:'Access has expired.'});
      const ok=await bcrypt.compare(String(b.password||''),p.password_hash);if(!ok)return json(res,401,{error:'Invalid ID or password.'});
      const old=await db.execute({sql:'SELECT * FROM sessions WHERE access_id=? LIMIT 1',args:[p.access_id]});
      if(old.rows.length&&old.rows[0].device_id!==String(b.device_id||''))return json(res,409,{error:'This account is already being used on another device.'});
      const token=crypto.randomBytes(32).toString('hex');
      if(old.rows.length)await db.execute({sql:'UPDATE sessions SET token=?,device_id=?,created_at=? WHERE access_id=?',args:[token,String(b.device_id||''),Date.now(),p.access_id]});
      else await db.execute({sql:'INSERT INTO sessions(token,access_id,device_id,created_at) VALUES(?,?,?,?)',args:[token,p.access_id,String(b.device_id||''),Date.now()]});
      return json(res,200,{session:token});
    }
    if(req.method==='GET'&&path==='/api/markets'){
      if(!await auth(req))return json(res,401,{error:'Login required.'});
      const markets=await liveMarkets();return json(res,200,{markets});
    }
    if(req.method==='POST'&&path==='/api/signal'){
      if(!await auth(req))return json(res,401,{error:'Login required.'});
      const b=await body(req);if(!b.market||!b.timeframe)return json(res,400,{error:'Market and timeframe are required.'});
      const allowed=b.otc?['5 SEC','10 SEC','15 SEC','30 SEC','1 MINUTE','5 MINUTE']:['1 MINUTE','5 MINUTE'];
      if(!allowed.includes(b.timeframe))return json(res,400,{error:'Invalid timeframe for this market.'});
      const direction=Math.random()<.5?'UP':'DOWN';return json(res,200,{direction,generated_at:Date.now(),mode:'generated/demo'});
    }
    if(req.method==='GET'&&path==='/api/admin/purchases'){
      if(req.headers['x-admin-key']!==process.env.ADMIN_KEY)return json(res,401,{error:'Unauthorized'});
      const r=await db.execute('SELECT id,reference,payment_method,payment_account,status,created_at,approved_at,expires_at FROM purchases ORDER BY id DESC');return json(res,200,{items:r.rows});
    }
    if(req.method==='POST'&&path==='/api/admin/approve'){
      if(req.headers['x-admin-key']!==process.env.ADMIN_KEY)return json(res,401,{error:'Unauthorized'});
      const b=await body(req);const id=Number(b.purchase_id);if(!id)return json(res,400,{error:'purchase_id required'});
      const accessId='BJB-'+crypto.randomBytes(4).toString('hex').toUpperCase();const password=String(Math.floor(10000000+Math.random()*90000000));const hash=await bcrypt.hash(password,12);const now=Date.now();
      await db.execute({sql:'UPDATE purchases SET status=\'approved\',access_id=?,password_hash=?,approved_at=?,expires_at=? WHERE id=? AND status=\'pending\'',args:[accessId,hash,now,now+30*24*60*60*1000,id]});return json(res,200,{ok:true,access_id:accessId,password});
    }
    if(req.method==='POST'&&path==='/api/admin/reject'){
      if(req.headers['x-admin-key']!==process.env.ADMIN_KEY)return json(res,401,{error:'Unauthorized'});const b=await body(req);await db.execute({sql:'UPDATE purchases SET status=\'rejected\' WHERE id=? AND status=\'pending\'',args:[Number(b.purchase_id)]});return json(res,200,{ok:true});
    }
    return json(res,404,{error:'Not found'});
  }catch(err){console.error(err);return json(res,500,{error:process.env.NODE_ENV==='production'?'Server configuration error. Check Vercel environment variables.':(err?.message||'Server error.')});}
}

async function liveMarkets(){
  const raw=process.env.QUOTEX_MARKETS_JSON;
  if(raw){try{return JSON.parse(raw)}catch{return []}}
  return [{name:'EURUSD OTC',otc:true},{name:'GBPUSD OTC',otc:true},{name:'USDJPY',otc:false}];
}
module.exports=handler;
