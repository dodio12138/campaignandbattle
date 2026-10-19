/* ================= 战役报告 · 地图：战役示意图（全程进军方向）与每日战况图（逐日回放） =================
   数据来自 camp.stats[].armies / owners（逐日快照，旧存档没有）、camp.battles、camp.events、camp.log */

function snapDays(c){ return c.stats.filter(s=>s.armies); }
/* 回放帧：有逐时段记录（六时段版）就按时段，否则按日 */
function frameList(c){ if(c.frames&&c.frames.length) return c.frames.map(f=>({day:f.d,ph:f.p,weather:f.w,owners:f.o,depots:f.dp,
    armies:f.a.map(x=>({id:x[0],at:x[1],nx:x[2],prog:x[3],gone:!!x[4],mt:x[5],men:x[6],org:x[7],n:x[8],sh:x[9],side:x[10],path:x[11]||[],order:x[12]||null}))}));
  return snapDays(c).map(s=>({...s,ph:null})); }
function armyInfo(c,id){ return c.armies.find(a=>a.id===id)||{gen:{name:"?"},name:id}; }
function dateText(c,day){ const dt=c.hist&&c.hist.startDate?c.dateOf(day):null; return dt?`${dt.y}${dt.mn}月${dt.d}`:""; }
/* 某日的会战、焚粮、火攻、攻占、溃散 → 地图标记 */
function dayMarks(c,day,withLabel,ph=null){ const out=[], L=d=>withLabel?"D"+d:"", inPh=x=>ph==null||x.ph==null||x.ph===ph;
  c.battles.forEach((b,i)=>{ if((day==null||b.day===day)&&inPh(b)) out.push({node:b.node,kind:"battle",label:L(b.day),title:`第 ${b.day} 日 ${b.desc||b.place}`,bi:[i]}); });
  for(const e of c.events){ if(day!=null&&e.day!==day) continue; if(!inPh(e)) continue;
    if(e.type==="fire"&&e.f>0) out.push({node:e.node,kind:"fire",side:e.by,label:L(e.day),title:`第 ${e.day} 日 ${c.sideName(e.by)}火攻${c.nodes[e.node].name}`});
    else if(e.type==="depot"&&e.amount>=Math.max(5,e.before*0.15)) out.push({node:e.node,kind:"fire",side:e.side==="A"?"B":"A",label:L(e.day),title:`第 ${e.day} 日 ${c.nodes[e.node].name}粮仓被焚 ${Math.round(e.amount)}`});
    else if(e.type==="capture") out.push({node:e.node,kind:"capture",side:e.side,label:L(e.day),title:`第 ${e.day} 日 ${c.sideName(e.side)}攻占${c.nodes[e.node].name}`});
    else if(e.type==="collapse"){ const s=snapDays(c).find(x=>x.day===e.day), a=s&&s.armies.find(x=>x.id===e.army); if(a) out.push({node:a.at,kind:"collapse",side:e.side,label:L(e.day),title:`第 ${e.day} 日 ${armyInfo(c,e.army).name}断粮溃散`}); } }
  if(day!=null) return out;
  // 全程示意图：同一据点同一类标记合并为一个，标注日子（多则写首末日与次数）
  const g={}; for(const m of out){ const k=m.node+"|"+m.kind+"|"+(m.side||""); (g[k]=g[k]||{...m,days:[],titles:[],bi:[]}); g[k].days.push(+m.label.slice(1)); g[k].titles.push(m.title); if(m.bi) g[k].bi.push(...m.bi); }
  return Object.values(g).map(m=>{ const d=[...new Set(m.days)].sort((x,y)=>x-y);
    return {...m,label:d.length<=2?d.map(x=>"D"+x).join("·"):`D${d[0]}–${d[d.length-1]} ×${m.days.length}`,title:m.titles.join("\n")}; }); }
function snapFlags(c,s,prev){ const N=c.nodes; if(prev===undefined) prev=snapDays(c).find(x=>x.day===s.day-1)||null;
  return s.armies.filter(a=>!a.gone||(prev||{armies:[]}).armies.some(p=>p.id===a.id&&!p.gone)).map(a=>{ const A=armyInfo(c,a.id), p=armyXY(N,a.at,a.nx,a.prog,a.nx?c.edge(a.at,a.nx).d:1);
  return {...p,side:a.side,gen:A.gen.name,name:A.name,id:a.id,n:a.n,men:a.men,ratio:a.men/(A.men0||a.men||1),org:a.org,shaken:!!a.sh,tag:a.gone?null:MISSION_TAG[a.mt],gone:a.gone}; }); }

/* ---------- 战役示意图 ---------- */
/* 每支军团的全程轨迹按「折返」切成几段，每段一支进军箭头，箭头旁标主将与起止日 */
function campaignLegs(c){ const S=snapDays(c), legs=[];
  for(const A of c.armies){ if(A.ai==="convoy") continue; let leg=null;
    for(const s of S){ const a=s.armies.find(x=>x.id===A.id); if(!a) continue;
      if(!leg){ leg={id:A.id,side:a.side,seq:[a.at],d0:s.day,d1:s.day,rt:0,mv:0}; continue; }
      if(a.at!==leg.seq[leg.seq.length-1]){
        if(leg.seq.includes(a.at)){ if(leg.seq.length>1) legs.push(leg); leg={id:A.id,side:a.side,seq:[leg.seq[leg.seq.length-1],a.at],d0:s.day,d1:s.day,rt:0,mv:0}; }
        else { leg.seq.push(a.at); leg.d1=s.day; }
        leg.mv++; if(a.mt==="retreat") leg.rt++; }
      if(a.gone) break; }
    if(leg&&leg.seq.length>1) legs.push(leg); }
  // 同一军团来回走同一条路：只画一次，日子取并集；每支军团只在最长的一段旁标名
  const g={}; for(const L of legs){ const k=L.id+"|"+L.seq.join(">"), kr=L.id+"|"+L.seq.slice().reverse().join(">"), o=g[k]||g[kr];
    if(o&&g[k]){ o.d0=Math.min(o.d0,L.d0); o.d1=Math.max(o.d1,L.d1); } else g[k]=L; }
  const out=Object.values(g), best={}; for(const L of out) L.retreat=L.rt*2>L.mv;   // 这一段多半日子奉的是撤回之令 → 撤退
  for(const L of out){ const n=L.seq.length; if(!best[L.id]||n>best[L.id].seq.length||(n===best[L.id].seq.length&&L.d1>best[L.id].d1)) best[L.id]=L; }
  for(const L of out){ L.label=best[L.id]===L; const all=out.filter(x=>x.id===L.id); L.D0=Math.min(...all.map(x=>x.d0)); L.D1=Math.max(...all.map(x=>x.d1)); }
  return out; }
function overviewSVG(c){
  const N=c.nodes, S=snapDays(c), last=S[S.length-1];
  let h=mapBaseSVG({sc:c.sc,nodes:N,edges:c.edges,owners:last&&last.owners,depots:last&&last.depots});
  if(!S.length) return h+mapFrameSVG()+`<text x="500" y="400" class="cm-sub" text-anchor="middle">此局为旧存档，没有逐日位置记录；新开一局即可生成示意图</text>`;
  const maxMen=Math.max(1,...c.armies.map(a=>a.men0||0)); let arrows="", labels=""; const boxes=[];
  // 箭头旁的标注：与已放的标注相压时上下挪开
  const place=(x,y,w,anchor)=>{ const x0=anchor==="end"?x-w:x; for(const dy of [0,-15,15,-30,30,-45]){ const b={x0,x1:x0+w,y0:y+dy-12,y1:y+dy+3};
      if(!boxes.some(o=>b.x0<o.x1&&b.x1>o.x0&&b.y0<o.y1&&b.y1>o.y0)){ boxes.push(b); return y+dy; } } return y; };
  for(const L of campaignLegs(c)){ const A=armyInfo(c,L.id), k=0.45+0.55*Math.sqrt((A.men0||0)/maxMen);
    const r=arrowPath(routePts(fillSeq(L.seq,c.edges),N),{w0:2.5*k+1,w1:8*k+1.5,wh:16*k+3,hl:34*k+8,s0:16,e0:18});
    if(!r) continue; const sd=L.side.toLowerCase();
    arrows+=`<path d="${r.d}" class="cp-march ${sd} big${L.retreat?" retreat":""}"><title>${esc(A.name)} 第 ${L.d0}–${L.d1} 日</title></path>`;
    if(!L.label) continue;
    const txt=`D${L.D0}${L.D1!==L.D0?"–"+L.D1:""}`, anc=L.side==="A"?"end":"start", lx=r.hb.x+(L.side==="A"?-10:10), ly=place(lx,r.hb.y-14,A.gen.name.length*13+txt.length*7+6,anc);
    labels+=`<text x="${r1(lx)}" y="${r1(ly)}" text-anchor="${anc}" class="cm-lbl ${sd}">${esc(A.gen.name)} <tspan class="d">${txt}</tspan></text>`; }
  h+=marksSVG(dayMarks(c,null,true),N);
  h+=flagsSVG(snapFlags(c,last));
  h+=`<g class="cp-arrows">${arrows}</g>${labels}`;
  // 标题框、图例、指北
  const d0=dateText(c,1), d1=dateText(c,c.day), res=c.over?(c.over.side?c.sideName(c.over.side)+"胜 · "+c.over.text:c.over.text):`进行中 · 第 ${c.day} 日`;
  h+=`<g transform="translate(26,26)"><rect class="cm-box" width="330" height="70"/><text x="14" y="38" class="cm-title">${esc(c.name.replace(/（.*?）/,""))} · 示意图</text><text x="14" y="58" class="cm-sub">${d0?esc(d0)+" — "+esc(d1)+" · ":""}历时 ${c.day} 日 · ${esc(res)}</text></g>`;
  h+=`<g transform="translate(26,616)"><rect class="cm-box" width="250" height="158"/>
    <path d="${arrowPath([{x:14,y:22},{x:70,y:22}],{w0:2,w1:4,wh:8,hl:12,s0:0,e0:0,min:5}).d}" class="cp-march a"/><text x="80" y="26" class="cm-leg">${esc(c.sideName("A"))}进军</text>
    <path d="${arrowPath([{x:14,y:46},{x:70,y:46}],{w0:2,w1:4,wh:8,hl:12,s0:0,e0:0,min:5}).d}" class="cp-march b"/><text x="80" y="50" class="cm-leg">${esc(c.sideName("B"))}进军</text>
    <path d="${arrowPath([{x:14,y:70},{x:70,y:70}],{w0:2,w1:4,wh:8,hl:12,s0:0,e0:0,min:5}).d}" class="cp-march a retreat"/><text x="80" y="74" class="cm-leg">撤退（空心虚线）</text>
    <g class="mk mk-battle" transform="translate(24,96)"><circle r="9"/><text y="4.5">⚔</text></g><text x="40" y="100" class="cm-leg">会战（D 日）</text>
    <g class="mk mk-fire" transform="translate(140,96)"><circle r="9"/><text y="4.5">火</text></g><text x="156" y="100" class="cm-leg">焚粮 / 火攻</text>
    <g class="mk mk-capture a" transform="translate(22,124)"><path d="M-1 -11V10M-1 -11H12L9 -6L12 -1H-1"/><text y="-3" x="5.5">克</text></g><text x="40" y="128" class="cm-leg">攻占</text>
    <g class="mk mk-collapse" transform="translate(140,122)"><circle r="9"/><text y="4.5">溃</text></g><text x="156" y="126" class="cm-leg">溃散</text>
    <text x="14" y="150" class="cm-sub">兵旗为终局位置；箭头粗细示兵力</text></g>`;
  h+=`<g transform="translate(950,58)"><path d="M0 -26L9 6L0 0L-9 6Z" class="cm-npath"/><text y="22" class="cm-n">北</text></g>`;
  return h+mapFrameSVG(); }

/* ---------- 每日战况图 ---------- */
/* 当日实际行进（实心箭头）：从前一日位置沿道路走到今日位置 */
function dayMoveSeq(c,p,q){ if(!p||!q||q.gone) return null; const ed=(a,b)=>c.edge(a,b)?c.edge(a,b).d:1;
  const f0=p.nx&&p.prog>0?p.prog/ed(p.at,p.nx):0;
  if(q.at===p.at){ if(q.nx&&q.nx===p.nx&&q.prog>p.prog) return {seq:[p.at,q.nx],f0,f1:q.prog/ed(q.at,q.nx)}; return null; }
  let seq; const i=p.path.indexOf(q.at); seq=i>=0?[p.at,...p.path.slice(0,i+1)]:fillSeq([p.at,q.at],c.edges);
  let f1=1; if(q.nx&&q.prog>0){ seq.push(q.nx); f1=q.prog/ed(q.at,q.nx); }
  if(f0>0&&seq[1]!==p.nx) return {seq,f0:0,f1}; return {seq,f0,f1}; }
function dailySVG(c,i){
  const N=c.nodes, S=frameList(c), s=S[i], prev=S[i-1];
  let h=mapBaseSVG({sc:c.sc,nodes:N,edges:c.edges,owners:s.owners,depots:s.depots}), moves="", plans="";
  for(const a of s.armies){ if(a.gone) continue; const sd=a.side.toLowerCase();
    const rt=a.mt==="retreat"?" retreat":"";
    // 示意大箭头：受令时定格的去向（逐时段记录里才有；按日记录退回旧画法）
    if(a.order){ const r=arrowPath(routePts(a.order,N),{w0:2,w1:5,wh:11,hl:20,s0:16,e0:18}); if(r) plans+=`<path d="${r.d}" class="cp-march ${sd}${rt}"/>`; }
    else if(s.ph==null&&a.path.length){ const r=arrowPath(routePts([a.at,...a.path],N,a.nx&&a.prog>0?a.prog/(c.edge(a.at,a.nx)||{d:1}).d:0,1),{w0:2,w1:4.5,wh:10,hl:18,s0:6,e0:18}); if(r) plans+=`<path d="${r.d}" class="cp-plan ${sd}"/>`; }
    // 小尖头：本时段（或当日）实际走的这一段
    const mv=dayMoveSeq(c,prev&&prev.armies.find(x=>x.id===a.id),a);
    if(mv){ const r=arrowPath(routePts(mv.seq,N,mv.f0,mv.f1),{w0:1.4,w1:1.8,wh:5,hl:10,s0:2,e0:2,min:8}); if(r) moves+=`<path d="${r.d}" class="cp-step ${sd}"/>`; } }
  h+=marksSVG(dayMarks(c,s.day,false,s.ph),N)+flagsSVG(snapFlags(c,s,prev||null))+`<g class="cp-arrows">${plans}${moves}</g>`;
  const dt=dateText(c,s.day), P=s.ph!=null?PERIODS[s.ph]:null;
  h+=`<g transform="translate(26,26)"><rect class="cm-box" width="270" height="62"/><text x="14" y="34" class="cm-title" style="font-size:26px">第 ${s.day} 日${P?" · "+P.n:""}</text><text x="14" y="52" class="cm-sub">${dt?esc(dt)+" · ":""}${P?P.t+" · ":""}${esc(s.weather||"")}</text></g>`;
  if(P&&P.night) h+=`<rect width="1000" height="800" class="cm-night" pointer-events="none"/>`;
  h+=`<g transform="translate(26,676)"><rect class="cm-box" width="300" height="98"/>
    <path d="${arrowPath([{x:14,y:20},{x:62,y:20}],{w0:2,w1:4,wh:8,hl:12,s0:0,e0:0,min:5}).d}" class="cp-march a"/><text x="72" y="24" class="cm-leg">受令去向</text>
    <path d="${arrowPath([{x:150,y:20},{x:198,y:20}],{w0:1.4,w1:1.8,wh:5,hl:10,s0:0,e0:0,min:5}).d}" class="cp-step a"/><text x="208" y="24" class="cm-leg">${s.ph!=null?"本时段一步":"当日行进"}</text>
    <path d="${arrowPath([{x:14,y:44},{x:62,y:44}],{w0:2,w1:4,wh:8,hl:12,s0:0,e0:0,min:5}).d}" class="cp-march a retreat"/><text x="72" y="48" class="cm-leg">受令撤退</text>
    <text x="14" y="70" class="cm-sub">兵旗下两条：兵员、组织；虚框为军心动摇</text><text x="14" y="88" class="cm-sub">⚔ 会战 · 火 焚粮 · 克 攻占 · 溃 溃散</text></g>`;
  h+=`<g transform="translate(950,58)"><path d="M0 -26L9 6L0 0L-9 6Z" class="cm-npath"/><text y="22" class="cm-n">北</text></g>`;
  return h+mapFrameSVG(); }

/* ---------- 报告里的两个页签 ---------- */
function reportMapsHTML(c){ const S=frameList(c), byPh=S.length&&S[0].ph!=null;
  return {
    map:`<div class="rmap-bar toolbar"><span class="note">全程进军方向、会战与焚粮地点；兵旗为终局位置</span><span class="sp"></span><button class="btn sm" data-rmdl="rm-over">下载 PNG</button></div><svg id="rm-over" class="cmap rmap" viewBox="0 0 1000 800" role="img" aria-label="战役示意图"></svg>`,
    daily:S.length?`<div class="rmap-bar toolbar">${byPh?`<button class="btn sm" data-rd="-6" aria-label="前一日">«</button>`:""}<button class="btn sm" data-rd="-1" aria-label="${byPh?"前一时段":"前一日"}">◀</button><button class="btn sm primary" id="rd-play">播放</button><button class="btn sm" data-rd="1" aria-label="${byPh?"后一时段":"后一日"}">▶</button>${byPh?`<button class="btn sm" data-rd="6" aria-label="后一日">»</button>`:""}
      <input type="range" id="rd-day" min="0" max="${S.length-1}" value="0" aria-label="日期" style="flex:1;min-width:120px"><b class="mono" id="rd-lbl"></b>
      <select id="rd-spd" aria-label="播放速度"><option value="${byPh?900:1400}">慢</option><option value="${byPh?450:800}" selected>中</option><option value="${byPh?160:350}">快</option></select><button class="btn sm" data-rmdl="rm-day">下载 PNG</button></div>
      <svg id="rm-day" class="cmap rmap" viewBox="0 0 1000 800" role="img" aria-label="每日战况图"></svg><div class="log cp-log rd-log" id="rd-log"></div>`
      :`<p class="note">此局为旧存档，没有逐日位置记录。新开一局即可回放每日战况。</p>`,
    bind(root){ const ov=root.querySelector("#rm-over"); if(ov&&!ov.dataset.done){ ov.innerHTML=overviewSVG(c); ov.dataset.done=1; }
      const dv=root.querySelector("#rm-day"); if(!dv||dv.dataset.done) return; dv.dataset.done=1;
      const sl=root.querySelector("#rd-day"); let timer=null;
      const show=i=>{ i=Math.max(0,Math.min(S.length-1,i)); sl.value=i; dv.innerHTML=dailySVG(c,i); const s=S[i];
        root.querySelector("#rd-lbl").textContent=`第 ${s.day} 日${s.ph!=null?" "+PERIODS[s.ph].n:""} / ${S[S.length-1].day} 日`;
        const rows=c.log.filter(l=>l.day===s.day&&(s.ph==null||l.ph==null||l.ph===s.ph)).slice().reverse();
        root.querySelector("#rd-log").innerHTML=`<table><tbody>${rows.map(l=>`<tr class="${l.kind==="hist"?"shi":l.kind}"><td>D${l.day}${l.ph!=null?"·"+PERIODS[l.ph].n:""}</td><td>${l.t}</td></tr>`).join("")||`<tr><td></td><td class="note">${s.ph!=null?"此时段":"本日"}无事</td></tr>`}</tbody></table>`;
        sl.style.setProperty("--fill",(S.length>1?i/(S.length-1)*100:100)+"%"); };
      const stop=()=>{ clearInterval(timer); timer=null; root.querySelector("#rd-play").textContent="播放"; };
      sl.oninput=()=>{ stop(); show(+sl.value); };
      root.querySelectorAll("[data-rd]").forEach(b=>b.onclick=()=>{ stop(); show(+sl.value+(+b.dataset.rd)); });
      root.querySelector("#rd-play").onclick=()=>{ if(timer){ stop(); return; } if(+sl.value>=S.length-1) show(0);
        root.querySelector("#rd-play").textContent="暂停"; timer=setInterval(()=>{ if(+sl.value>=S.length-1||!dv.isConnected){ stop(); return; } show(+sl.value+1); },+root.querySelector("#rd-spd").value); };
      root.querySelector("#rd-spd").onchange=()=>{ if(timer){ stop(); root.querySelector("#rd-play").click(); } };
      show(0); },
  }; }

/* 下载地图为 PNG：把 .cmap 相关样式里的 var(--x) 换成当前计算值，内联进 SVG，再画到画布 */
function downloadMapPNG(svg,name){
  const cs=getComputedStyle(svg), rv=t=>t.replace(/var\((--[\w-]+)(?:,([^()]*(?:\([^()]*\))?[^()]*))?\)/g,(m,v,fb)=>cs.getPropertyValue(v).trim()||(fb||"").trim()||m);   // 局部变量（如兵旗的 --sd）留给 SVG 内部样式自己解析
  let css=""; for(const sh of document.styleSheets){ let rules; try{ rules=sh.cssRules; }catch(e){ continue; } for(const r of rules) if(r.cssText.includes(".cmap")) css+=rv(rv(r.cssText))+"\n"; }
  const cl=svg.cloneNode(true); cl.setAttribute("xmlns","http://www.w3.org/2000/svg"); cl.setAttribute("width",2000); cl.setAttribute("height",1600);
  cl.innerHTML=`<style>${css.replace(/\.cmap /g,"")}</style>`+rv(cl.innerHTML);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(cl)],{type:"image/svg+xml"})), img=new Image();
  img.onload=()=>{ const cv=document.createElement("canvas"); cv.width=2000; cv.height=1600; const g=cv.getContext("2d"); g.drawImage(img,0,0); URL.revokeObjectURL(url);
    const a=document.createElement("a"); a.download=name+".png"; a.href=cv.toDataURL("image/png"); a.click(); };
  img.src=url; }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-rmdl]"); if(!b) return; const svg=document.getElementById(b.dataset.rmdl); if(!svg) return;
  const day=b.dataset.rmdl==="rm-day"?"_"+($("#rd-lbl")?$("#rd-lbl").textContent.split(" /")[0].replace(/\s/g,""):""):"_示意图"; downloadMapPNG(svg,(camp?camp.name:"战役")+day); });

/* ---------- 回顾：点会战图标（或会战一览中的一行）弹出战果卡 ---------- */
function battleCardHTML(c,b){ const nm=s=>esc(c.sideName(s)), sides=[b.att,b.def], P0=b.ph!=null?PERIODS[b.ph]:null;
  const when=`第 ${b.day} 日${P0?" · "+(b.span>1?`${P0.n}至${b.ph+b.span-1>=6?"次日":""}${PERIODS[(b.ph+b.span-1)%6].n}`:P0.n):""}`;
  const res=b.raidOk?`${nm(b.raidOk)}奇袭得手（焚辎重 ${Math.round((b.burnt||0)*100)}%）`:b.winner?`${nm(b.winner)}胜 · ${esc(b.reason||"")}`:`相持 · ${esc(b.reason||"各自收兵")}`;
  const side=s=>{ const m=b.men&&b.men[s], loss=b.lossPct&&b.lossPct[s], ty=b.types&&b.types[s];
    const tl=ty?Object.entries(ty).filter(([,v])=>v>0.005).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`${esc(k)} ${Math.round(v*100)}%`).join(" · "):"";
    return `<div class="vs-side ${s.toLowerCase()}"><b>${nm(s)} · ${s===b.att?"攻":"守"}</b><span>${(b.armies[s]||[]).map(x=>esc(x.split(" · ")[0])).join("、")}</span>
      ${m?`<span class="mono">${(m[0]/10000).toFixed(2)} 万 → ${(m[1]/10000).toFixed(2)} 万</span>`:""}<span class="note">损 ${Math.round((loss||0)*100)}%${b.withdrew===s?" · 撤出":""}${b.winner===s?" · 胜":""}</span>${tl?`<span class="note">${tl}</span>`:""}</div>`; };
  return `<div class="bt-card"><div class="bt-h"><b>${esc(b.place)}之战</b><span class="note">${when} · ${esc(b.mode)}${b.night?" · 夜":""}${b.weather&&b.weather!=="晴"?" · "+esc(b.weather):""}</span></div>
    <div class="bt-res ${(b.raidOk||b.winner||"").toLowerCase()}">${res}</div>
    <div class="vs">${side(sides[0])}<span class="vs-x">對</span>${side(sides[1])}</div>
    <dl class="kv">${b.rounds?`<dt>回合 · 时段</dt><dd>${b.rounds} · ${b.span||1}</dd>`:""}${b.burnt>0.01?`<dt>焚辎重</dt><dd>${Math.round(b.burnt*100)}%</dd>`:""}${b.pursuit?`<dt>追击损失系数</dt><dd>${Math.round(b.pursuit*100)}%</dd>`:""}</dl>
    ${b.men?"":`<div class="note">此局为旧存档，只记了战报一行：${esc(b.desc||"")}</div>`}</div>`; }
function openBattlePop(list,x,y){ let el=document.getElementById("bt-pop"); if(!el){ el=document.createElement("div"); el.id="bt-pop"; el.setAttribute("role","dialog"); document.body.appendChild(el); }
  el.innerHTML=`<div class="bt-pop-h"><span class="lbl">战果 · ${list.length} 战</span><button type="button" class="btn sm" data-btclose aria-label="关闭">×</button></div><div class="bt-pop-b">${list.map(b=>battleCardHTML(camp,b)).join("")}</div>`;
  el.hidden=false; const w=Math.min(380,innerWidth-24), h=el.offsetHeight; el.style.width=w+"px";
  el.style.left=Math.max(12,Math.min(innerWidth-w-12,x+14))+"px"; el.style.top=Math.max(12,Math.min(innerHeight-Math.min(h,innerHeight*0.7)-12,y-20))+"px"; el.querySelector("[data-btclose]").focus(); }
function closeBattlePop(){ const el=document.getElementById("bt-pop"); if(el) el.hidden=true; }
document.addEventListener("click",e=>{ const t=e.target;
  if(t.closest("[data-btclose]")){ closeBattlePop(); return; }
  const m=t.closest("[data-bi]"); if(m&&camp){ const list=m.dataset.bi.split(",").map(Number).map(i=>camp.battles[i]).filter(Boolean); if(list.length){ e.stopPropagation(); openBattlePop(list,e.clientX,e.clientY); } return; }
  if(!t.closest("#bt-pop")) closeBattlePop(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeBattlePop();
  if((e.key==="Enter"||e.key===" ")&&e.target.closest&&e.target.closest("[data-bi]")){ e.preventDefault(); const r=e.target.getBoundingClientRect(); e.target.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:r.right,clientY:r.top})); } });
