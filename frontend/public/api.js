(function(global){
  'use strict';
  const storageKey='sonora:backend';
  let saved='';try{saved=JSON.parse(localStorage.getItem(storageKey))||''}catch{}
  function validate(value){
    if(value==='/api/v1'||!value)return '/api/v1';
    const u=new URL(value);
    const local=['127.0.0.1','localhost','[::1]'].includes(u.hostname);
    if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local&&location.protocol==='http:'))throw Error('请输入 HTTPS 后端地址；本机开发可使用 HTTP');
    if(u.username||u.password||u.search||u.hash)throw Error('地址中不能包含账号、查询参数或密钥');
    return u.href.replace(/\/$/,'');
  }
  let base;try{base=validate(saved||global.HEUDIO_CONFIG?.apiBase||'/api/v1')}catch{base='/api/v1'}
  function url(path){return new URL(base+path,location.href).href}
  async function request(path,options={}){
    let r;
    try{r=await fetch(url(path),{method:options.method||'GET',credentials:'include',headers:{'X-Heudio-Client':'web',...(options.body?{'Content-Type':'application/json'}:{})},...(options.body?{body:JSON.stringify(options.body)}:{}),signal:AbortSignal.timeout(options.timeout||45000)})}catch{throw Error('无法连接应用后端，请检查服务地址与网络')}
    let d;try{d=await r.json()}catch{throw Error('应用后端尚未连接或地址不正确（HTTP '+r.status+'）')}
    if(!r.ok||d.error)throw Error(d.error?.message||'后端请求未成功（HTTP '+r.status+'）');
    return d.data;
  }
  global.HeudioAPI={request,url,get base(){return base},configure(raw){base=validate(raw.trim());localStorage.setItem(storageKey,JSON.stringify(base));return base}};
})(window);
