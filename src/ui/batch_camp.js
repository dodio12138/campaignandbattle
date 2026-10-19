/* ================= 编辑器 · 批量推演：战斗 / 战役 两种 =================
   战役批量：选剧本、局数、自由或历史模式、起始种子，可临时覆盖两军主帅统帅智略；AI 对 AI 逐局推演，
   统计结局分布、胜率、日数、史实吻合度、损失、焚粮、火攻、断粮、军心大震与 AI 决策。逐局明细可在沙盘重演。 */
const CB={key:null,n:50,hist:false,tend:70,seed:1,lords:null,running:null,res:null};
try{ const o=JSON.parse(localStorage.getItem("hm-cbatch-v1")||"null"); if(o) for(const k of ["key","n","hist","tend","seed"]) if(k in o) CB[k]=o[k]; }catch(e){}
function cbSave(){ try{ localStorage.setItem("hm-cbatch-v1",JSON.stringify({key:CB.key,n:CB.n,hist:CB.hist,tend:CB.tend,seed:CB.seed})); }catch(e){} }
function cbScenario(){ if(!CAMP_SCENARIOS[CB.key]) CB.key=campCfg.scenario||"GUANDU"; const sc=JSON.parse(JSON.stringify(CAMP_SCENARIOS[CB.key]));
  if(CB.lords) for(const s of ["A","B"]) Object.assign(sc.sides[s].lord,CB.lords[s]); return sc; }
function cbLordsDefault(){ const sc=CAMP_SCENARIOS[CB.key]; return {A:{cmd:sc.sides.A.lord.cmd,int:sc.sides.A.lord.int},B:{cmd:sc.sides.B.lord.cmd,int:sc.sides.B.lord.int}}; }
/* 一局：AI 对 AI 推到底，取统计 */
function cbPlay(sc,seed){ const c=new Campaign(sc,{control:{A:"ai",B:"ai"},seed,history:CB.hist&&!!sc.history,tendency:CB.tend/100});
  for(let d=0;d<(sc.maxDays||60)+5&&!c.over;d++){ for(const e of c.beginDay()) c.resolveAuto(e); c.endDay(); }
  const last=c.stats[c.stats.length-1]||{men:c.initMen}, S=["A","B"], per={};
  for(const s of S) per[s]={loss:1-last.men[s]/Math.max(1,c.initMen[s]),burnt:c.events.filter(e=>e.type==="depot"&&e.side===s).reduce((t,e)=>t+e.amount,0),
    fire:c.events.filter(e=>e.type==="fire"&&e.by===s&&e.f>0).length,starve:c.events.filter(e=>e.type==="starve"&&e.side===s).length,shock:c.events.filter(e=>e.type==="shock"&&e.side===s).length,
    dec:c.decisions.filter(d=>d.side===s).reduce((o,d)=>(o[d.kind||"other"]=(o[d.kind||"other"]||0)+1,o),{})};
  const f=c.hist.outcomes.length&&c.hist.on?c.fidelity():null;
  return {seed,side:c.over?c.over.side:null,text:c.over?c.over.text:"未决",day:c.day,battles:c.battles.length,per,fid:f?f.score:null,fidList:f?f.list.map(o=>o.ok):null}; }
function cbRun(){ if(CB.running) return; const sc=cbScenario(), N=CB.n, s0=CB.seed, rows=[]; CB.running={i:0}; CB.res=null; cbRender();
  const tick=()=>{ if(!CB.running) return; const t0=performance.now();
    while(CB.running.i<N&&performance.now()-t0<60){ rows.push(cbPlay(sc,s0+CB.running.i)); CB.running.i++; }
    const pr=$("#cb-prog"); if(pr) pr.style.width=(CB.running.i/N*100)+"%"; const pl=$("#cb-plbl"); if(pl) pl.textContent=`${CB.running.i} / ${N}`;
    if(CB.running.i<N){ setTimeout(tick,0); return; }
    CB.running=null; CB.res={rows,sc,hist:CB.hist&&!!sc.history,tend:CB.tend,seed:s0,lords:CB.lords?JSON.parse(JSON.stringify(CB.lords)):null}; cbRender(); };
  tick(); }
function cbStop(){ CB.running=null; cbRender(); }
const DECK={assault:"进逼强攻",fire:"火攻",raid:"奇袭粮仓",intercept:"截击运粮",relieve:"驰援",counter:"围魏救赵",guard:"预设防备",exploit:"乘乱击之",withdraw:"退兵",hesitate:"迟疑"};
function cbResultsHTML(){ const R=CB.res; if(!R) return `<p class="note">选好剧本与方式，点「开始」。每局都由双方战略 AI 指挥、按六时段推到结束；会战按战斗引擎逐回合打。</p>`;
  const rows=R.rows, n=rows.length, sc=R.sc, nm=s=>esc(sc.sides[s].name), pc=v=>Math.round(v*100)+"%", avg=g=>rows.reduce((t,r)=>t+g(r),0)/n;
  const win={A:rows.filter(r=>r.side==="A").length,B:rows.filter(r=>r.side==="B").length}; win.N=n-win.A-win.B;
  const oc={}; for(const r of rows){ const k=(r.side?r.side:"N")+"|"+r.text; oc[k]=(oc[k]||0)+1; }
  const maxD=Math.max(...rows.map(r=>r.day)), bins=Math.min(30,maxD), hist=Array.from({length:bins},()=>({A:0,B:0,N:0}));
  for(const r of rows){ const b=Math.min(bins-1,Math.floor((r.day-1)/maxD*bins)); hist[b][r.side||"N"]++; } const hm=Math.max(1,...hist.map(h=>h.A+h.B+h.N));
  const kinds=[...new Set(rows.flatMap(r=>["A","B"].flatMap(s=>Object.keys(r.per[s].dec))))].filter(k=>DECK[k]);
  const fidHTML=R.hist?`<h3>史实吻合度 <span class="note">倾向 ${R.tend}% · 平均 ${pc(avg(r=>r.fid||0))}</span></h3><div class="cb-bars">${sc.history.outcomes.map((o,i)=>{ const v=rows.filter(r=>r.fidList&&r.fidList[i]).length/n; return `<div class="cb-bar"><span>${esc(o.text)}</span><div class="mbar"><i style="width:${v*100}%"></i></div><b class="mono">${pc(v)}</b></div>`; }).join("")}</div>`:"";
  return `<div class="rtiles">${[[n+" 局","种子 "+R.seed+"–"+(R.seed+n-1)],[avg(r=>r.day).toFixed(1)+" 日","平均历时"],[pc(win.A/n),nm("A")+"胜"],[pc(win.B/n),nm("B")+"胜"],[pc(win.N/n),"罢兵 / 未决"],[avg(r=>r.battles).toFixed(1),"平均会战数"]].concat(R.hist?[[pc(avg(r=>r.fid||0)),"史实吻合度"]]:[]).map(([v,l])=>`<div class="rtile"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    ${R.lords?`<p class="note">主帅覆盖：${nm("A")} 统 ${R.lords.A.cmd} / 智 ${R.lords.A.int}，${nm("B")} 统 ${R.lords.B.cmd} / 智 ${R.lords.B.int}</p>`:""}
    <div class="stack">${[["A",win.A],["N",win.N],["B",win.B]].filter(x=>x[1]).map(([k,v])=>`<div style="width:${v/n*100}%;background:${k==="A"?"var(--a)":k==="B"?"var(--b)":"var(--ink-2)"}">${Math.round(v/n*100)}%</div>`).join("")}</div>
    <h3>结局分布</h3><div class="cb-bars">${Object.entries(oc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{ const [s,t]=k.split("|"); return `<div class="cb-bar ${s.toLowerCase()}"><span>${s==="N"?"":nm(s)+"胜："}${esc(t)}</span><div class="meter" style="--side:${s==="A"?"var(--a)":s==="B"?"var(--b)":"var(--ink-2)"}"><i style="width:${v/n*100}%"></i></div><b class="mono">${v}</b></div>`; }).join("")}</div>
    <h3>结束日数分布</h3><div class="hist">${hist.map(h=>`<div title="${h.A+h.B+h.N} 局" style="height:${(h.A+h.B+h.N)/hm*100}%;background:linear-gradient(to top,var(--a) 0 ${h.A/Math.max(1,h.A+h.B+h.N)*100}%,var(--ink-2) 0 ${(h.A+h.N)/Math.max(1,h.A+h.B+h.N)*100}%,var(--b) 0)"></div>`).join("")}</div><div class="hist-axis"><span>1 日</span><span>${maxD} 日</span></div>
    ${fidHTML}
    <h3>双方统计 <span class="note">每局平均</span></h3><div class="tbl-wrap"><table class="rtab"><thead><tr><th></th><th class="a">${nm("A")}</th><th class="b" style="color:var(--chart-b)">${nm("B")}</th></tr></thead><tbody>
      ${[["兵员损失",s=>pc(avg(r=>r.per[s].loss))],["被焚存粮",s=>avg(r=>r.per[s].burnt).toFixed(1)],["火攻得手（次）",s=>avg(r=>r.per[s].fire).toFixed(2)],["断粮（军·日）",s=>avg(r=>r.per[s].starve).toFixed(2)],["军心大震（次）",s=>avg(r=>r.per[s].shock).toFixed(2)]]
        .concat(kinds.map(k=>[`决策：${DECK[k]}`,s=>avg(r=>r.per[s].dec[k]||0).toFixed(2)])).map(([l,g])=>`<tr><td>${l}</td><td class="mono">${g("A")}</td><td class="mono">${g("B")}</td></tr>`).join("")}</tbody></table></div>
    <h3>逐局明细 <span class="note">${R.lords?"有主帅覆盖时不能在沙盘重演":"点「重演」在战役编辑的沙盘里按同一种子再推一遍"}</span></h3><div class="tbl-wrap cb-rows"><table class="rtab"><thead><tr><th>种子</th><th>结局</th><th>日数</th><th>会战</th>${R.hist?"<th>吻合度</th>":""}<th></th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td class="mono">${r.seed}</td><td class="${(r.side||"").toLowerCase()}">${r.side?nm(r.side)+"胜：":""}${esc(r.text)}</td><td class="mono">${r.day}</td><td class="mono">${r.battles}</td>${R.hist?`<td class="mono">${pc(r.fid||0)}</td>`:""}<td>${R.lords?"":`<button type="button" class="btn sm" data-cbreplay="${r.seed}">重演</button>`}</td></tr>`).join("")}</tbody></table></div>`; }
function cbRender(){ const el=$("#bk-camp"); if(!el) return; if(!CAMP_SCENARIOS[CB.key]) CB.key=campCfg.scenario||"GUANDU"; const sc=CAMP_SCENARIOS[CB.key]; if(!CB.lords&&false) CB.lords=null;
  const L=CB.lords||cbLordsDefault(), run=CB.running;
  el.innerHTML=`<h2>战役批量推演 <span class="lbl">AI 对 AI · 六时段 · 会战逐回合</span></h2><div class="body">
    <div class="cb-set">
      <div class="form-row"><span class="lbl">剧本</span><select id="cb-sc">${Object.entries(CAMP_SCENARIOS).map(([k,v])=>`<option value="${k}" ${k===CB.key?"selected":""}>${esc(v.name)}</option>`).join("")}</select></div>
      <div class="form-row"><span class="lbl">局数</span><select id="cb-n">${[20,50,100,200].map(k=>`<option ${k===CB.n?"selected":""}>${k}</option>`).join("")}</select></div>
      <div class="form-row"><span class="lbl">起始种子</span><input id="cb-seed" class="mono" inputmode="numeric" value="${CB.seed}"></div>
      <div><div class="lbl">方式</div><div class="seg" id="cb-mode"><button type="button" data-m="free" aria-pressed="${!CB.hist}">自由推演</button><button type="button" data-m="hist" aria-pressed="${CB.hist}" ${sc.history?"":"disabled title=\"此剧本未设史实锚点\""}>历史模式</button></div></div>
      <div class="slider-row" ${CB.hist&&sc.history?"":"hidden"}><span class="lbl">史实倾向</span><input type="range" id="cb-tend" min="0" max="100" step="5" value="${CB.tend}"><output>${CB.tend}%</output></div>
      <details class="cb-lords" ${CB.lords?"open":""}><summary class="lbl">主帅覆盖（试「换个主帅会怎样」）</summary>
        <div class="tbl-wrap"><table class="edit"><thead><tr><th></th><th>统帅</th><th>智略</th></tr></thead><tbody>${["A","B"].map(s=>`<tr><th class="${s.toLowerCase()}">${esc(sc.sides[s].name)} · ${esc(sc.sides[s].lord.name)}</th><td><input type="number" data-cbl="${s}.cmd" value="${L[s].cmd}" class="${CB.lords&&L[s].cmd!==sc.sides[s].lord.cmd?"chg":""}"></td><td><input type="number" data-cbl="${s}.int" value="${L[s].int}"></td></tr>`).join("")}</tbody></table></div>
        <button type="button" class="btn sm" id="cb-lreset" ${CB.lords?"":"disabled"}>恢复剧本主帅</button></details>
    </div>
    <div class="toolbar"><button class="btn primary" id="cb-go" ${run?"disabled":""}>开始</button><button class="btn" id="cb-stop" ${run?"":"disabled"}>停止</button><div class="progress" style="flex:1;min-width:120px"><i id="cb-prog" style="width:${run?run.i/CB.n*100:CB.res?100:0}%"></i></div><span class="note mono" id="cb-plbl">${run?run.i+" / "+CB.n:""}</span></div>
    <div id="cb-res">${cbResultsHTML()}</div>
    <p class="note">命令行同样可跑：<code>npm run sim -- ${CB.key} ${CB.n}${CB.hist?" --history "+(CB.tend/100):""}</code></p>
  </div>`; }
/* 切换战斗 / 战役 */
function cbKind(k){ for(const b of document.querySelectorAll("#bt-kind [data-k]")) b.setAttribute("aria-pressed",b.dataset.k===k);
  $("#bk-camp").hidden=k!=="camp"; $("#bk-battle").hidden=k!=="battle";
  $("#bt-kind-note").textContent=k==="camp"?"战役批量：双方战略 AI 把一个剧本从头推到结束，连推多局看结局分布":"战斗批量：用「战斗编辑」中的当前编成连续打多场会战";
  if(k==="camp") cbRender(); try{ localStorage.setItem("hm-bkind",k); }catch(e){} }
$("#bt-kind").addEventListener("click",e=>{ const b=e.target.closest("[data-k]"); if(b) cbKind(b.dataset.k); });
$("#bk-camp").addEventListener("click",e=>{ const t=e.target;
  if(t.id==="cb-go"){ cbRun(); return; } if(t.id==="cb-stop"){ cbStop(); return; }
  if(t.id==="cb-lreset"){ CB.lords=null; cbRender(); return; }
  const m=t.closest("#cb-mode [data-m]"); if(m&&!m.disabled){ CB.hist=m.dataset.m==="hist"; cbSave(); cbRender(); return; }
  const rp=t.closest("[data-cbreplay]"); if(rp&&CB.res){ campCfg.scenario=CB.key; campCfg.tendency=CB.res.tend/100; if(window.buildCampSetup) buildCampSetup(); sbSeed=rp.dataset.cbreplay; sbHist=CB.res.hist; showView("v-campedit"); sbBuild(); sbStep(()=>false); } });
$("#bk-camp").addEventListener("change",e=>{ const t=e.target;
  if(t.id==="cb-sc"){ CB.key=t.value; CB.lords=null; CB.res=null; if(!CAMP_SCENARIOS[CB.key].history) CB.hist=false; cbSave(); cbRender(); return; }
  if(t.id==="cb-n"){ CB.n=+t.value; cbSave(); return; }
  if(t.id==="cb-seed"){ CB.seed=Math.max(1,parseInt(t.value)||1); cbSave(); return; }
  if(t.id==="cb-tend"){ CB.tend=+t.value; cbSave(); return; }
  if(t.dataset.cbl){ const [s,k]=t.dataset.cbl.split("."), v=parseInt(t.value); if(!isFinite(v)) return; CB.lords=CB.lords||cbLordsDefault(); CB.lords[s][k]=Math.max(1,Math.min(100,v)); cbRender(); } });
$("#bk-camp").addEventListener("input",e=>{ if(e.target.id==="cb-tend") e.target.nextElementSibling.textContent=e.target.value+"%"; });
try{ const k=localStorage.getItem("hm-bkind"); if(k==="camp") cbKind("camp"); }catch(e){}
