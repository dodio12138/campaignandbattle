/* ================= 编辑器 · 战役沙盘：按当前剧本重建一局 AI 对 AI，逐时段推进、点选军团或据点直接改状态、快速批量 =================
   沙盘与玩家的战役进度互不相干（不存档）。改剧本即自动重建。 */
let sb=null, sbSel=null, sbNode=null, sbSeed="", sbHist=false, sbN=20, sbBatch=null, sbT=null;
window.sbDirty=()=>{ clearTimeout(sbT); sbT=setTimeout(sbBuild,250); };
function sbBuild(){ const sc=curSc(); sbSel=null; sbNode=null;
  sb=sc&&!scValidate(sc).length?new Campaign(sc,{control:{A:"ai",B:"ai"},seed:sbSeed===""?undefined:+sbSeed,history:sbHist&&!!sc.history,tendency:+campCfg.tendency}):null;
  sbRender(); }
/* 推进：一时段一段地走，交战一律速决；until() 为真即停 */
function sbStep(until){ if(!sb||sb.over) return; let n=0;
  do{ for(const e of sb.beginPeriod()) if(!e.done) sb.resolveAuto(e); sb.endPeriod(); } while(!sb.over&&until&&!until()&&n++<6*120);
  sbRender(); }
function sbRender(){ const svg=$("#sb-svg"); if(!svg) return;
  if(!sb){ const er=curSc()?scValidate(curSc()):["未选剧本"]; svg.innerHTML=`<rect width="1000" height="800" class="cm-paper"/><text x="500" y="400" text-anchor="middle" class="cm-sub">剧本有误，修正后自动重建：${esc(er.slice(0,2).join("；"))}</text>`; $("#sb-log").innerHTML=""; $("#sb-time").textContent=""; sbPanel(); return; }
  const c=sb; let h=mapBaseSVG({sc:c.sc,nodes:c.nodes,edges:c.edges,interactive:true});
  if(sbNode&&c.nodes[sbNode]){ const n=c.nodes[sbNode]; h+=`<circle cx="${n.x}" cy="${n.y}" r="24" class="sb-pick"/>`; }
  h+=marksSVG(c.battles.filter(b=>b.day===c.day||(b.day===c.day-1&&c.ph===0)).map(b=>({node:b.node,kind:"battle",title:b.desc})),c.nodes);
  svg.innerHTML=h+armyLayers(c,sbSel,null);
  $("#sb-time").textContent=c.over?`已结束 · 第 ${c.day} 日 · ${c.over.side?c.sideName(c.over.side)+"胜：":""}${c.over.text}`:`第 ${c.day} 日 · ${PERIODS[c.ph].n}（下一时段）· 天气 ${c.weather} · 种子 ${c.seed}`;
  $("#sb-log").innerHTML=`<table><tbody>${c.log.slice().reverse().slice(0,80).map(l=>`<tr class="${l.kind==="hist"?"shi":l.kind}"><td>D${l.day}${l.ph!=null?"·"+PERIODS[l.ph].n:""}</td><td>${l.t}</td></tr>`).join("")}</tbody></table>`;
  sbPanel(); }
/* 右栏：种子与模式、推进、选中军团 / 据点的即时修改、快速批量 */
function sbPanel(){ const el=$("#sb-dbg"); if(!el) return; const ae=document.activeElement; if(ae&&el.contains(ae)&&(ae.tagName==="INPUT"||ae.tagName==="SELECT")) return;
  const c=sb, a=c&&sbSel&&c.army(sbSel), n=c&&sbNode&&c.nodes[sbNode];
  const nodeOpts=c?Object.values(c.nodes).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join(""):"";
  const armyHTML=a?(()=>{ const cus=c.combatUnits(a), org=cus.length?cus.reduce((t,u)=>t+Math.max(0,u.org)/UT[u.n].org,0)/cus.length:0, men=cus.reduce((t,u)=>t+u.men,0);
    return `<div class="dbg-unit"><b>${esc(a.name)}</b><span class="note">${c.sideName(a.side)} · 驻 ${esc(c.nodes[a.at].name)} · ${MISSION_NAME[a.mission.type]}${a.mission.target?"："+esc(c.nodes[a.mission.target].name):""} · 战力 ${Math.round(c.power(a))}</span>
      <label class="prow"><span>兵员<small>现 ${Math.round(men)}，按比例增减</small></span><input type="number" data-sa="men" step="5" value="100"></label>
      <label class="prow"><span>组织度 %<small>各部按此设定</small></span><input type="number" data-sa="org" value="${Math.round(org*100)}"></label>
      <label class="prow"><span>随军粮（日）</span><input type="number" data-sa="food" step="0.5" value="${(a.food??0).toFixed(1)}"></label>
      <label class="prow"><span>军心动摇（日）</span><input type="number" data-sa="shaken" value="${a.shaken||0}"></label>
      <div class="form-row"><span class="lbl">改令</span><select data-sa="type">${Object.entries(MISSION_NAME).map(([k,v])=>`<option value="${k}" ${k===a.mission.type?"selected":""}>${v}</option>`).join("")}</select></div>
      <div class="form-row"><span class="lbl">目的地</span><select data-sa="target"><option value="">（原地）</option>${nodeOpts.replace(`value="${a.mission.target}"`,`value="${a.mission.target}" selected`)}</select></div>
      <div class="note">兵员一栏填百分比：100 不变，50 折半。改动只作用于沙盘。</div></div>`; })()
    :n?`<div class="dbg-unit"><b>${esc(n.name)}</b>
      <div class="form-row"><span class="lbl">归属</span><select data-sn="owner"><option value="">无主</option>${["A","B"].map(s=>`<option value="${s}" ${n.owner===s?"selected":""}>${esc(c.sideName(s))}</option>`).join("")}</select></div>
      ${n.depot?`<label class="prow"><span>存粮</span><input type="number" data-sn="food" value="${Math.round(n.depot.food)}"></label>`:""}
      <label class="prow"><span>营垒</span><input type="number" data-sn="fort" step="0.5" value="${n.fort||0}"></label>
      ${n.wall!=null?`<label class="prow"><span>城墙 %</span><input type="number" data-sn="wall" value="${Math.round(n.wall*100)}"></label>`:""}</div>`
    :`<div class="note">点沙盘上的兵旗可改军团（兵员、组织、粮、军心、军令），点据点可改归属、存粮、营垒、城墙。</div>`;
  el.innerHTML=`<h2>沙盘调试 <span class="lbl">LAB</span></h2><div class="body">
    <div class="form-row"><span class="lbl">随机种子</span><input id="sb-seed" class="mono" inputmode="numeric" placeholder="留空则每次随机" value="${esc(sbSeed)}"></div>
    <label class="chk"><input type="checkbox" id="sb-hist" ${sbHist?"checked":""} ${curSc()&&curSc().history?"":"disabled"}> 历史模式（倾向取「历史模式」一节的设置）</label>
    <div class="toolbar"><button class="btn sm" id="sb-rebuild">重建</button>${c?`<span class="note mono">本局 ${c.seed}</span>`:""}</div>
    <div><div class="lbl">推进（AI 对 AI，交战速决）</div><div class="toolbar"><button class="btn sm" data-sb="ph">一时段</button><button class="btn sm" data-sb="day">一日</button><button class="btn sm" data-sb="fight">到下次交战</button><button class="btn sm" data-sb="end">到结束</button></div></div>
    <div><div class="lbl">选中</div>${c?armyHTML:'<div class="note">剧本修正后才能试推。</div>'}</div>
    <div><div class="lbl">快速批量（种子 1–N）</div><div class="toolbar"><select id="sb-n" aria-label="局数">${[10,20,50].map(k=>`<option ${k===sbN?"selected":""}>${k}</option>`).join("")}</select><button class="btn sm primary" id="sb-batch" ${c?"":"disabled"}>${sbBatch&&sbBatch.running?"推演中…":"开始"}</button><div class="progress" style="flex:1;min-width:60px"><i id="sb-prog" style="width:${sbBatch?sbBatch.pct:0}%"></i></div></div>
      <div id="sb-bres">${sbBatch&&sbBatch.html||""}</div></div>
  </div>`; }
function sbRunBatch(){ if(sbBatch&&sbBatch.running) return; const sc=curSc(); if(!sc||scValidate(sc).length) return; const N=sbN, res={}, fid={}; let days=0, f=0, i=0; sbBatch={running:true,pct:0,html:""}; sbPanel();
  const hist=sbHist&&!!sc.history, tick=()=>{ const t0=performance.now();
    while(i<N&&performance.now()-t0<40){ const c=new Campaign(sc,{control:{A:"ai",B:"ai"},seed:++i,history:hist,tendency:+campCfg.tendency});
      for(let d=0;d<(sc.maxDays||60)+5&&!c.over;d++){ for(const e of c.beginDay()) c.resolveAuto(e); c.endDay(); }
      const k=c.over?(c.over.side?c.sideName(c.over.side)+"胜：":"")+c.over.text:"未决"; res[k]=(res[k]||0)+1; days+=c.day;
      if(hist){ const r=c.fidelity(); f+=r.score; for(const o of r.list) fid[o.text]=(fid[o.text]||0)+(o.ok?1:0); } }
    sbBatch.pct=i/N*100; const pr=$("#sb-prog"); if(pr) pr.style.width=sbBatch.pct+"%";
    if(i<N){ setTimeout(tick,0); return; }
    sbBatch={running:false,pct:100,html:`<dl class="kv">${Object.entries(res).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}<dt>平均日数</dt><dd>${(days/N).toFixed(1)}</dd>${hist?`<dt>史实吻合度</dt><dd>${Math.round(f/N*100)}%</dd>`:""}</dl>
      ${hist?`<div class="flags">${Object.entries(fid).map(([k,v])=>`<span class="${v/N>=0.6?"good":"bad"}">${esc(k)} ${Math.round(v/N*100)}%</span>`).join("")}</div>`:""}`};
    sbPanel(); };
  tick(); }
const SBV=$("#v-campedit");
SBV.addEventListener("click",e=>{ const t=e.target;
  if(t.closest("#sb-svg")){ const ab=t.closest("[data-army]"), nd=t.closest("[data-node]");
    if(ab){ sbSel=ab.dataset.army===sbSel?null:ab.dataset.army; sbNode=null; sbRender(); return; }
    if(nd){ sbNode=nd.dataset.node===sbNode?null:nd.dataset.node; sbSel=null; sbRender(); return; } return; }
  if(t.id==="sb-rebuild"){ sbBuild(); return; }
  if(t.id==="sb-batch"){ sbRunBatch(); return; }
  const b=t.closest("[data-sb]"); if(b&&sb){ const k=b.dataset.sb, d0=sb.day, b0=sb.battles.length;
    if(k==="ph") sbStep(null); else if(k==="day") sbStep(()=>sb.day!==d0); else if(k==="fight") sbStep(()=>sb.battles.length!==b0); else sbStep(()=>false); } });
SBV.addEventListener("change",e=>{ const t=e.target;
  if(t.id==="sb-seed"){ const v=t.value.trim(); sbSeed=/^\d+$/.test(v)?v:""; sbBuild(); return; }
  if(t.id==="sb-hist"){ sbHist=t.checked; sbBuild(); return; }
  if(t.id==="sb-n"){ sbN=+t.value; return; }
  if(!sb) return; const a=sbSel&&sb.army(sbSel), n=sbNode&&sb.nodes[sbNode], v=parseFloat(t.value);
  if(a&&t.dataset.sa){ const k=t.dataset.sa;
    if(k==="men"&&isFinite(v)){ for(const u of a.units) if(!u.gone) u.men=Math.max(0,Math.min(u.maxMen,u.men*v/100)); }
    else if(k==="org"&&isFinite(v)){ for(const u of a.units) if(!u.gone) u.org=UT[u.n].org*Math.max(0,Math.min(100,v))/100; }
    else if(k==="food"&&isFinite(v)) a.food=Math.max(0,v);
    else if(k==="shaken"&&isFinite(v)) a.shaken=Math.max(0,Math.round(v));
    else if(k==="type"||k==="target"){ const box=t.closest(".dbg-unit"), ty=box.querySelector('[data-sa="type"]').value, tg=box.querySelector('[data-sa="target"]').value||null; sb.setOrder(a,ty,ty==="hold"?null:tg); sb.note(`〔调试〕令 ${a.name}：${MISSION_NAME[ty]}${tg&&ty!=="hold"?" "+sb.nodes[tg].name:""}`,"order"); }
    t.blur(); sbRender(); return; }
  if(n&&t.dataset.sn){ const k=t.dataset.sn;
    if(k==="owner") n.owner=t.value||null; else if(k==="food"&&n.depot&&isFinite(v)) n.depot.food=Math.max(0,v); else if(k==="fort"&&isFinite(v)) n.fort=Math.max(0,v); else if(k==="wall"&&isFinite(v)) n.wall=Math.max(0,Math.min(1,v/100));
    t.blur(); sbRender(); } });
sbBuild();
