/* ================= 地图绘制：战役地图、战役报告（示意图、每日战况）共用 =================
   只拼 SVG 字符串，不碰 DOM；样式见 styles.css 的 .cmap 段落。坐标系固定 1000×800。 */

/* ---------- 道路曲线：每条路按两端据点 id 固定弯法（弧形或 S 形） ---------- */
function roadCurve(ia,a,ib,b){ const fw=ia<ib, p=fw?a:b, q=fw?b:a, key=fw?ia+"|"+ib:ib+"|"+ia;
  let h=7; for(const ch of key) h=(h*31+ch.charCodeAt(0))>>>0;
  const dx=q.x-p.x, dy=q.y-p.y, L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L;
  const k1=Math.min(46,L*(0.07+(h>>>4)%5*0.018))*(h&1?1:-1), k2=h&2?k1*0.55:-k1*0.75;   // 同向为弧，反向为 S
  return {fw,p,q,c1:{x:p.x+dx/3+nx*k1,y:p.y+dy/3+ny*k1},c2:{x:p.x+dx*2/3+nx*k2,y:p.y+dy*2/3+ny*k2}}; }
function bezAt(c,t){ const u=1-t, A=u*u*u, B=3*u*u*t, C=3*u*t*t, D=t*t*t;
  return {x:A*c.p.x+B*c.c1.x+C*c.c2.x+D*c.q.x, y:A*c.p.y+B*c.c1.y+C*c.c2.y+D*c.q.y}; }
const r1=v=>Math.round(v*10)/10;
/* 从 a 走到 b 的一段 C 指令（不含起点 M） */
function roadSeg(ia,a,ib,b){ const c=roadCurve(ia,a,ib,b), [c1,c2,e]=c.fw?[c.c1,c.c2,c.q]:[c.c2,c.c1,c.p]; return `C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(e.x)} ${r1(e.y)}`; }
function roadD(ia,a,ib,b){ return `M${a.x} ${a.y} `+roadSeg(ia,a,ib,b); }
/* 从 a 往 b 走了 t（0–1）时所在的点 */
function roadAt(ia,a,ib,b,t){ const c=roadCurve(ia,a,ib,b); return bezAt(c,c.fw?t:1-t); }

/* ---------- 进军箭头：作战示意图画法——尖尾、渐粗、倒钩箭头；整条只弯一次 ---------- */
/* 不逐段贴着道路走：取起点、终点，以及路线上离两端连线最远的一个据点，拟成一条二次曲线（至多一个弯）。
   f0 / f1：起点、终点落在首段 / 末段道路上的比例（每日战况里走了一半的路） */
function routePts(seq,N,f0=0,f1=1){ const n=seq.length; if(n<2) return [];
  const p0=f0>0?roadAt(seq[0],N[seq[0]],seq[1],N[seq[1]],f0):{x:N[seq[0]].x,y:N[seq[0]].y};
  const pn=f1<1?roadAt(seq[n-2],N[seq[n-2]],seq[n-1],N[seq[n-1]],f1):{x:N[seq[n-1]].x,y:N[seq[n-1]].y};
  const dx=pn.x-p0.x, dy=pn.y-p0.y, L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L, mx=(p0.x+pn.x)/2, my=(p0.y+pn.y)/2;
  const off=q=>(q.x-p0.x)*nx+(q.y-p0.y)*ny;
  let far=null, fd=0; for(let i=1;i<n-1;i++){ const q=N[seq[i]], d=off(q); if(Math.abs(d)>Math.abs(fd)){ fd=d; far=q; } }
  let T;   // 曲线在 t=0.5 时经过的点
  if(far&&Math.abs(fd)>L*0.12) T={x:mx+(far.x-mx)*0.75, y:my+(far.y-my)*0.75};      // 绕道：向拐点弯过去，但不贴死
  else { const side=n===2?Math.sign(off(roadAt(seq[0],N[seq[0]],seq[1],N[seq[1]],0.5)))||1:Math.sign(fd)||1;   // 直去：顺着道路那一侧微弓
    const bow=side*Math.min(36,L*0.09); T={x:mx+nx*bow, y:my+ny*bow}; }
  const C={x:2*T.x-mx, y:2*T.y-my}, pts=[];
  for(let k=0;k<=40;k++){ const t=k/40, u=1-t; pts.push({x:u*u*p0.x+2*u*t*C.x+t*t*pn.x, y:u*u*p0.y+2*u*t*C.y+t*t*pn.y}); }
  return pts; }
/* 箭形：尾端收尖，向前渐粗（先快后缓），箭头两翼向后掠出倒钩 */
function arrowPath(pts,o={}){
  if(pts.length<2) return "";
  const cum=[0]; for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
  const L=cum[cum.length-1]; if(L<(o.min??30)) return "";
  const at=d=>{ d=Math.max(0,Math.min(L,d)); let i=1; while(i<cum.length-1&&cum[i]<d) i++; const f=(d-cum[i-1])/((cum[i]-cum[i-1])||1), a=pts[i-1], b=pts[i];
    const tx=b.x-a.x, ty=b.y-a.y, tl=Math.hypot(tx,ty)||1; return {x:a.x+tx*f, y:a.y+ty*f, tx:tx/tl, ty:ty/tl}; };
  const s0=Math.min(o.s0??20,L*0.18), e0=Math.min(o.e0??20,L*0.15), hl=Math.min(o.hl??30,L*0.32), body=L-e0-hl;
  const w0=(o.w0??3)*0.35, w1=o.w1??6.5, wh=o.wh??13, n=Math.max(6,Math.round((body-s0)/8)), Lp=[], Rp=[];
  for(let i=1;i<=n;i++){ const f=i/n, d=s0+(body-s0)*f, p=at(d), w=w0+(w1-w0)*Math.sqrt(f); Lp.push([p.x-p.ty*w,p.y+p.tx*w]); Rp.push([p.x+p.ty*w,p.y-p.tx*w]); }
  const t0=at(s0), hb=at(body), tip=at(L-e0), bk=at(body-hl*0.28);   // bk：倒钩向后掠到的位置
  const barbL=[bk.x-bk.ty*wh,bk.y+bk.tx*wh], barbR=[bk.x+bk.ty*wh,bk.y-bk.tx*wh];
  const all=[[t0.x,t0.y],...Lp,barbL,[tip.x,tip.y],barbR,...Rp.reverse()];
  return {d:"M"+all.map(([x,y])=>r1(x)+" "+r1(y)).join("L")+"Z", tip, hb}; }
/* 小尖头：自军团当下所在，沿道路指向下一站（只画这一步，逐时段更新） */
function stepArrow(c,at,nx,prog){ if(!nx) return ""; const N=c.nodes, e=c.edge(at,nx); if(!e) return ""; const f0=Math.min(0.9,(prog||0)/e.d), pts=[];
  for(let k=0;k<=12;k++) pts.push(roadAt(at,N[at],nx,N[nx],f0+(1-f0)*k/12));
  const r=arrowPath(pts,{w0:1.4,w1:1.8,wh:5,hl:10,s0:Math.min(10,4),e0:16,min:16}); return r?r.d:""; }
function marchArrow(seq,N,o){ const r=arrowPath(routePts(seq,N),o); return r?r.d:""; }
/* 补全据点序列：相邻两点之间若无直连道路，按道路最短跳数补上中间据点 */
function fillSeq(seq,edges){ const adj={}; for(const e of edges){ (adj[e.a]=adj[e.a]||[]).push(e.b); (adj[e.b]=adj[e.b]||[]).push(e.a); }
  const out=[seq[0]]; for(let i=1;i<seq.length;i++){ const a=out[out.length-1], b=seq[i]; if(a===b) continue;
    if((adj[a]||[]).includes(b)){ out.push(b); continue; }
    const prev={[a]:null}, q=[a]; while(q.length&&!(b in prev)){ const x=q.shift(); for(const y of adj[x]||[]) if(!(y in prev)){ prev[y]=x; q.push(y); } }
    if(!(b in prev)){ out.push(b); continue; } const mid=[]; for(let x=b;x!==a;x=prev[x]) mid.unshift(x); out.push(...mid); }
  return out; }

/* ---------- 底图：纸面、河流、道路、据点 ---------- */
/* o: {sc, nodes, edges, owners?, depots?, interactive?, pick?, paper?} —— owners / depots 覆盖据点当时的归属与存粮 */
function mapBaseSVG(o){
  const N=o.nodes, mp=(o.sc&&o.sc.map)||(Object.values(CAMP_SCENARIOS).find(s=>o.sc&&s.name===o.sc.name)||{}).map||{};
  let h=`<defs><pattern id="cpg" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="var(--map-line,rgba(0,0,0,.06))" stroke-width="1"/></pattern>
    <radialGradient id="cpv" cx="50%" cy="50%" r="72%"><stop offset="60%" stop-color="#5a4320" stop-opacity="0"/><stop offset="100%" stop-color="#5a4320" stop-opacity=".22"/></radialGradient></defs>
    <rect width="1000" height="800" class="cm-paper"/><rect width="1000" height="800" fill="url(#cpg)"/>`;
  for(const r of mp.rivers||[]) h+=`<path d="${r.d}" class="cm-river"/>${r.label?`<text x="${r.lx}" y="${r.ly}" class="cp-rl">${r.label}</text>`:""}`;
  for(const e of o.edges){ const a=N[e.a], b=N[e.b]; if(!a||!b) continue; const d=roadD(e.a,a,e.b,b), m=roadAt(e.a,a,e.b,b,0.5); h+=`<path d="${d}" class="cp-road-bed"/><path d="${d}" class="cp-road"/><text x="${r1(m.x)}" y="${r1(m.y-6)}" class="cp-days">${e.d}</text>`; }
  for(const n of Object.values(N)){ const ow=o.owners&&n.id in o.owners?o.owners[n.id]:n.owner, own=ow?ow.toLowerCase():"n";
    let shape=""; if(n.type==="city") shape=`<rect x="-15" y="-15" width="30" height="30" class="cp-node ${own}"/><rect x="-9" y="-9" width="18" height="18" class="cp-node-in ${own}"/>`;
    else if(n.type==="camp") shape=`<rect x="-14" y="-14" width="28" height="28" class="cp-node camp ${own}"/>`;
    else if(n.type==="depot") shape=`<circle r="15" class="cp-node ${own}"/><text y="5" class="cp-gl">粮</text>`;
    else if(n.type==="ford") shape=`<path d="M0 -13L13 0L0 13L-13 0z" class="cp-node ${own}"/>`;
    else shape=`<circle r="6" class="cp-node ${own}"/>`;
    const food=n.depot?(o.depots&&n.id in o.depots?o.depots[n.id]:n.depot.food):0, food0=n.depot?Math.max(1,n.depot.food0||n.depot.food||1):1;
    const dep=n.depot?`<rect x="-20" y="20" width="40" height="5" class="cp-dbar"/><rect x="-20" y="20" width="${r1(40*Math.min(1,food/food0))}" height="5" class="cp-dfill"/>`:"";
    const fortT=n.fort?` 垒${typeof n.fort==="number"?Math.round(n.fort*10)/10:n.fort}`:(n.wall!=null?` 墙${Math.round(n.wall*100)}%`:"");
    const cov=n.cover==="林"?`<g class="cp-tree" aria-hidden="true"><path d="M-27 -6l6 -11l6 11z"/><path d="M-22 2l6 -11l6 11z"/></g>`:"";
    const act=o.interactive?` data-node="${n.id}" tabindex="0" role="button" aria-label="${n.name}${n.cover==="林"?"（林木）":""}"`:"";
    h+=`<g class="cp-n${o.pick?" pick":""}"${act} transform="translate(${n.x},${n.y})">${cov}${shape}${dep}<text y="${n.depot?40:30}" class="cp-name">${n.name}</text><text y="${n.depot?53:43}" class="cp-sub">${o.interactive?fortT:""}${n.depot?" 粮"+Math.round(food):""}</text></g>`; }
  return h; }
/* 纸面做旧：四角暗角 + 双线图框（报告用） */
function mapFrameSVG(){ return `<rect width="1000" height="800" fill="url(#cpv)" pointer-events="none"/><rect x="6" y="6" width="988" height="788" class="cm-frame"/><rect x="12" y="12" width="976" height="776" class="cm-frame thin"/>`; }

/* ---------- 兵旗卡片 ---------- */
const MISSION_TAG={fire:"火攻",raid:"截粮",escort:"运粮",delay:"阻击",attack:"进攻",reinforce:"增援",retreat:"撤回"};
/* 军团所在点：在据点上，或在 at→nx 道路上走了 prog/d */
function armyXY(N,at,nx,prog,d){ if(nx&&prog>0&&N[nx]) return roadAt(at,N[at],nx,N[nx],Math.min(0.9,prog/(d||1))); return {x:N[at].x,y:N[at].y}; }
/* list: [{x,y,side,gen,name,n,men,ratio,org,shaken,tag,cargo,id,on,moving,gone}]；同一点叠放 */
function flagsSVG(list,o={}){ const stack={}; let h="";
  for(const f of list){ const key=Math.round(f.x)+","+Math.round(f.y), k=stack[key]=(stack[key]||0)+1;
    const W=88, H=30, dy=-40-(k-1)*(H+5), dx=f.side==="A"?-W-6:6, sd=f.side.toLowerCase();
    const sur=esc((f.gen||"?")[0]), title=`${f.name} · ${f.gone?"已溃散":`${f.n} 部 · ${(f.men/10000).toFixed(1)} 万 · 组织 ${Math.round(f.org*100)}%${f.shaken?" · 军心动摇":""}`}`;
    const act=o.interactive?` data-army="${f.id}" tabindex="0" role="button" aria-label="${esc(title)}"`:"";
    h+=`<g class="cp-army ${sd}${f.on?" on":""}${f.shaken?" shaken":""}${f.gone?" gone":""}"${act} transform="translate(${r1(f.x+dx)},${r1(f.y+dy)})">
      <title>${esc(title)}</title>
      <rect class="ca-card" x="0" y="0" width="${W}" height="${H}"/>
      <path class="ca-flag" d="M0 0H26L22 ${H/2}L26 ${H}H0Z"/>
      <text class="ca-sur" x="11.5" y="${H/2+6}">${sur}</text>
      <text class="ca-nm" x="30" y="13">${esc(f.gen)}</text>
      <text class="ca-ct" x="${W-4}" y="13">${f.gone?"溃":f.n+"部"}${f.cargo?"·粮":""}</text>
      <rect class="ca-bar" x="30" y="19" width="${W-34}" height="3"/><rect class="ca-men" x="30" y="19" width="${r1((W-34)*Math.max(0,Math.min(1,f.ratio)))}" height="3"/>
      <rect class="ca-bar" x="30" y="24" width="${W-34}" height="2"/><rect class="ca-org" x="30" y="24" width="${r1((W-34)*Math.max(0,Math.min(1,f.org)))}" height="2"/>
      ${f.tag?`<g class="ca-tag" transform="translate(${f.side==="A"?-31:W+3},${(H-13)/2})"><rect width="28" height="13"/><text x="14" y="10">${f.tag}</text></g>`:""}
      ${f.gone?`<path class="ca-x" d="M2 2L${W-2} ${H-2}M${W-2} 2L2 ${H-2}"/>`:""}
    </g>`; }
  return h; }

/* ---------- 标记：会战、焚粮 / 火攻、攻占 ---------- */
/* marks: [{node,kind:"battle"|"fire"|"capture"|"collapse",side?,label?,title?}]；同一据点多个标记横向排开 */
function marksSVG(marks,N){ const cnt={}; let h="";
  for(const m of marks){ const n=N[m.node]; if(!n) continue; const k=cnt[m.node]=(cnt[m.node]||0)+1, x=n.x+20+(k-1)*24, y=n.y+16, sd=(m.side||"").toLowerCase();
    const glyph={battle:"⚔",fire:"火",capture:"克",collapse:"溃"}[m.kind]||"·";
    h+=`<g class="mk mk-${m.kind} ${sd}" transform="translate(${x},${y})"><title>${esc(m.title||"")}</title>${m.kind==="capture"?`<path d="M-1 -11V10M-1 -11H12L9 -6L12 -1H-1"/>`:`<circle r="10"/>`}<text y="${m.kind==="capture"?-3:4.5}" x="${m.kind==="capture"?5.5:0}">${glyph}</text>${m.label?`<text class="mk-l" y="${k%2?22:34}">${esc(m.label)}</text>`:""}</g>`; }
  return h; }
