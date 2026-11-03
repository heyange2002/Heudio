import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest('hex');
const response = (body,status=200,headers={}) => Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
const tokenOf = request => (request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('soundisle_session='))?.slice(18);
export class AuthStore {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(request){
    const key=this.env.APP_ACCESS_KEY;
    if(!key||key.length<32)return response({error:'服务尚未配置访问 Key'},503);
    const store=this.ctx.storage,now=Date.now(),fingerprint=digest(key);
    const token=tokenOf(request),record=token?await store.get('session:'+digest(token)):null;
    const authenticated=!!(record&&record.expires>now&&record.fingerprint===fingerprint);
    if(request.method==='GET')return response({authenticated});
    if(request.method==='DELETE'){
      if(token)await store.delete('session:'+digest(token));
      return response({authenticated:false},200,{'Set-Cookie':'soundisle_session=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0'});
    }
    if(request.method!=='POST')return response({error:'方法不支持'},405);
    const ip=digest(request.headers.get('CF-Connecting-IP')||'local');
    const allowed=await store.transaction(async tx=>{
      let limit=await tx.get('attempt:'+ip);
      if(!limit||limit.until<=now)limit={count:0,until:now+60000};
      limit.count++;await tx.put('attempt:'+ip,limit);return limit.count<=5;
    });
    await store.setAlarm(now+3600000);
    if(!allowed)return response({error:'尝试次数过多，请一分钟后重试'},429);
    const body=await request.json();
    if(typeof body.key!=='string'||body.key.length>4096||!timingSafeEqual(Buffer.from(digest(body.key),'hex'),Buffer.from(fingerprint,'hex')))return response({error:'访问 Key 不正确'},401);
    if(token)await store.delete('session:'+digest(token));
    const fresh=randomBytes(32).toString('hex');await store.put('session:'+digest(fresh),{expires:now+3600000,fingerprint});
    return response({authenticated:true},200,{'Set-Cookie':`soundisle_session=${fresh}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=3600`});
  }
  async alarm(){
    const now=Date.now();
    // Storage is private to this namespace; delete expired session/rate-limit records.
    let cursor;
    do{
      const records=await this.ctx.storage.list({limit:500,...(cursor?{startAfter:cursor}:{})});
      if(!records.size)break;
      const stale=[...records].filter(([,v])=>(v.expires||v.until)<=now).map(([k])=>k);
      if(stale.length)await this.ctx.storage.delete(stale);
      cursor=[...records.keys()].at(-1);if(records.size<500)break;
    }while(true);
    if((await this.ctx.storage.list({limit:1})).size)await this.ctx.storage.setAlarm(now+3600000);
  }
}
