/* ================= 战役界面 ================= */
let camp=null, campSel=null, campPick=false, savedSpec=null;
const CAMP_KEY="hm-camp-v3", CAMP_CFG_KEY="hm-camp-cfg-v1";
const PAUSE_KINDS=[["contact","接敌交战"],["depot","粮仓、运粮被袭"],["arrive","军团抵达目的地"],["sight","敌军进入视野"],["shaken","军心动摇"],["hist","史实之机"]];
let campCfg={scenario:"GUANDU",control:{A:"player",B:"ai"},autoStandoff:true,history:false,tendency:0.7,seed:"",pause:{}};
try{ const c=JSON.parse(localStorage.getItem(CAMP_CFG_KEY)||"null"); if(c) campCfg={...campCfg,...c}; }catch(e){}
try{ const cp=JSON.parse(localStorage.getItem("hm-camp-cp2")||"null"); if(cp) Object.assign(CP,cp); }catch(e){}
const CP_DEFAULT={...CP};
const SC_KEY="hm-camp-sc4";
const CAMP_SC_DEFAULT=JSON.parse(JSON.stringify(CAMP_SCENARIOS));
try{ const ed=JSON.parse(localStorage.getItem(SC_KEY)||"null"); if(ed) for(const k in ed) if(ed[k]&&ed[k].nodes) CAMP_SCENARIOS[k]=ed[k]; }catch(e){}
if(!CAMP_SCENARIOS[campCfg.scenario]) campCfg.scenario="GUANDU";
for(const [k] of PAUSE_KINDS) if(campCfg.pause[k]==null) campCfg.pause[k]=true;
function campSave(){ try{ localStorage.setItem(CAMP_KEY,camp.save()); }catch(e){} }
function campOpts(extra={}){ return {control:{...campCfg.control},history:!!campCfg.history,tendency:+campCfg.tendency,seed:campCfg.seed===""?undefined:+campCfg.seed,...extra}; }
function campNew(extra){ camp=new Campaign(CAMP_SCENARIOS[campCfg.scenario],campOpts(extra)); campSel=null; campSave(); renderCamp(); }
try{ const sv=localStorage.getItem(CAMP_KEY); if(sv) camp=Campaign.load(sv); }catch(e){ camp=null; }
if(!camp) camp=new Campaign(CAMP_SCENARIOS[campCfg.scenario],campOpts());

$("#v-camp").innerHTML=`<div class="camp-grid">
  <section class="card cp-left"><h2><span id="cp-title">战役</span><span class="lbl" id="cp-day"></span></h2><div class="body">
    <div class="note" id="cp-date"></div>
    <div class="cp-wx" id="cp-wx"></div>
    <div class="ph-bar" id="cp-ph" aria-label="时段"></div>
    <div class="toolbar"><button class="btn" id="cp-step" title="推进一个时段（约四个时辰）">一时段</button><button class="btn primary" id="cp-next" title="推进到次日；遇设定的要事暂停">推进一日</button><button class="btn" id="cp-auto" title="自动逐时段推进，遇设定的要事暂停">▶ 自动</button></div>
    <div class="toolbar"><label class="note" title="自动推进速度">速度 <select id="cp-auto-spd" aria-label="自动推进速度"><option value="700">慢</option><option value="260" selected>中</option><option value="60">快</option><option value="0">瞬时</option></select></label><button class="btn" id="cp-report-btn">战役报告</button><button class="btn" id="cp-lobby" title="回到开局：换剧本、换阵营或继续本局">← 开局</button><details class="cp-pausecfg"><summary class="lbl">暂停条件</summary><div class="cp-pausebox">${PAUSE_KINDS.map(([k,l])=>`<label class="chk"><input type="checkbox" data-pause="${k}" ${campCfg.pause[k]!==false?"checked":""}> ${l}</label>`).join("")}<div class="note">只看你指挥的一方；观战时不暂停。</div></div></details></div>
    <div class="cp-pause" id="cp-pause" hidden></div>
    <div id="cp-lords" class="cp-lords"></div>
    <div id="cp-pending"></div>
    <div class="lbl" style="margin-top:4px">军团（点选后下达目标）</div><div id="cp-armies" class="cp-armies"></div>
    <div id="cp-orders"></div></div></section>
  <section class="card cp-mapcard"><div class="cp-map" id="cp-map"><svg id="cp-svg" class="cmap" viewBox="0 0 1000 800" role="img" aria-label="战役地图"></svg></div>
    <div class="legend cp-legend"><span><b class="lg city"></b>城</span><span><b class="lg camp"></b>营垒</span><span><b class="lg depot"></b>粮仓</span><span><b class="lg ford"></b>渡口</span><span>路旁数字：行军日数</span><span>⚔ 当日交战</span><span>大箭头：受令去向（实心进军、空心虚线撤退）</span><span>小尖头：当下一步</span><span>兵旗：主将 · 部数，下两条为兵员与组织</span></div></section>
  <div class="cp-report" id="cp-report" hidden></div>
  <section class="card cp-right"><h2>情报 <span class="lbl">军报</span></h2><div class="body"><div id="cp-info"></div><div class="lbl">战役日志（最新在上）</div><div class="log cp-log" id="cp-log"></div></div></section>
</div>`;

const MS_TO_BATTLE={raid:"焚粮",escort:"护粮",delay:"阻滞",hold:"坚守",attack:"击溃",reinforce:"击溃",retreat:"击溃"};
function armyGlyphs(a){ const c={}; for(const u of a.units) if(!u.gone&&u.men>50) c[u.n]=(c[u.n]||0)+1; return Object.entries(c).map(([n,k])=>`<span class="mini">${GLYPH[n]}</span>${k}`).join(" "); }
function armyStatus(a){ if(a.gone) return "已溃散"; const m=a.mission; const t=m.target?camp.nodes[m.target].name:""; const mv=a.path.length?`→ ${camp.nodes[a.path[a.path.length-1]].name}（${a.path.length} 站）`:`驻 ${camp.nodes[a.at].name}`;
  return `${MISSION_NAME[m.type]||m.type}${t&&m.type!=="hold"?"："+t:""} · ${mv}`; }
function canCommand(a){ return camp.control[a.side]==="player"&&!a.gone; }

function renderCamp(){
  if(!camp) return; const c=camp;
  $("#cp-title").textContent=c.name; const dt=c.hist&&c.hist.startDate?c.dateOf(c.day):null;
  $("#cp-day").textContent=`第 ${c.day} 日 · ${PERIODS[c.ph].n}`;
  $("#cp-ph").innerHTML=PERIODS.map((p,i)=>`<span class="${i<c.ph?"done":i===c.ph?"on":""}${p.night?" night":""}" title="${p.n} ${p.t}${i===c.ph?"（下一时段）":""}">${p.n}</span>`).join("");
  $("#cp-date").innerHTML=`${dt?dt.y+dt.mn+"月"+dt.d:c.season}`+(c.hist&&c.hist.on?` <span class="histbadge" title="历史模式：随机按史实倾向被推向史实；同种子可完全重演">史 · 倾向 ${Math.round(c.hist.tend*100)}% · 种子 ${c.seed}</span>`:` <span class="note" title="随机种子：同种子同设置可重演">种子 ${c.seed}</span>`);
  const wxDesc={晴:"晴：诸事如常",雨:"雨：弓弩减力、不能纵火、行军泥泞",大风:"大风：火势大盛，利于焚粮",雾:"雾：远射难中，计谋易成",雪:"雪：体力大耗、冲击减弱",酷暑:"酷暑：体力大耗"};
  $("#cp-wx").innerHTML=`<span class="wxi">${c.weather}</span><span class="note">${wxDesc[c.weather]||""}</span>`;
  if(c.over) $("#cp-wx").innerHTML+=`<div class="cp-over">${c.over.side?c.sideName(c.over.side)+"胜：":""}${c.over.text}</div>`;
  const busy=!!c.over||c.pending.some(e=>!e.done); for(const id of ["#cp-next","#cp-step","#cp-auto"]) $(id).disabled=busy&&!(id==="#cp-auto"&&campAuto);
  // 交战
  const pend=c.pending; $("#cp-pending").innerHTML=pend.length?`<div class="lbl">${PERIODS[c.ph].n}交战</div>`+pend.map((e,i)=>{ const n=c.nodes[e.node]; const nm=s=>e.armies[s].map(id=>c.army(id).name.split(" · ")[0]).join("、");
    const att=e.att, def=e.def; const playerAtt=c.control[att]==="player";
    return `<div class="cp-eng ${e.done?"done":""}"><div><b>⚔ ${n.name}</b> <span class="note">${e.mode}${e.night?"·夜":""}${c.weather!=="晴"?"·"+c.weather:""}</span></div>
      <div class="note">${c.sideName(att)}（${nm(att)}）攻 ${c.sideName(def)}（${nm(def)}）</div>
      ${e.done?`<div class="note">${e.result||"已结算"}</div>`:(e.standoff?`<div class="note">${c.sideName(att)}按兵对垒，未攻</div><button class="btn" data-eng="${i}" data-act="auto">结算</button>`:
        `<div class="cp-eb">${e.canStandoff&&playerAtt?`<button class="btn" data-eng="${i}" data-act="standoff">对垒不战</button>`:""}<button class="btn primary" data-eng="${i}" data-act="play">亲自指挥</button><button class="btn" data-eng="${i}" data-act="auto">速决</button></div>`)}</div>`; }).join("")+(pend.some(e=>!e.done)?`<button class="btn" id="cp-autoall">其余全部速决</button>`:""):"";
  // 军团列表
  const sides=["A","B"]; $("#cp-armies").innerHTML=sides.map(s=>`<div class="cp-side ${s.toLowerCase()}"><div class="lbl">${c.sideName(s)}${c.control[s]==="player"?"（玩家）":"（AI）"}</div>`+c.armies.filter(a=>a.side===s).map(a=>`<button type="button" class="cp-army ${a.id===campSel?"on":""} ${a.gone?"gone":""}" data-army="${a.id}"><span class="chip">${c.sideInfo[s].short}</span><span class="nm">${a.name}</span><span class="st">${armyStatus(a)}</span><span class="gl">${armyGlyphs(a)} · 粮 ${a.food!=null?a.food.toFixed(1):"—"}${a.cargo>0?" · 载粮 "+Math.round(a.cargo):""}${a.shaken>0&&!a.gone?` · <b class="shaken">军心动摇 ${a.shaken} 日</b>`:""}</span></button>`).join("")+"</div>").join("");
  $("#cp-lords").innerHTML=lordHTML("A")+lordHTML("B");
  renderOrders(); renderCampMap(); renderCampInfo();
  $("#cp-log").innerHTML=`<table><tbody>${c.log.slice().reverse().slice(0,160).map(l=>`<tr class="${l.kind==="hist"?"shi":l.kind}"><td>D${l.day}${l.ph!=null?"·"+PERIODS[l.ph].n:""}</td><td>${l.t}</td></tr>`).join("")}</tbody></table>`;
}
function renderOrders(){
  const el=$("#cp-orders"), a=campSel&&camp.army(campSel); if(!a){ el.innerHTML='<p class="note">点选左侧或地图上的军团查看；己方军团可下达目标：选目标类型，再在地图上点选目的地。</p>'; return; }
  const own=canCommand(a), m=a.mission; const t=m.target||"";
  const nodesOpt=Object.values(camp.nodes).map(n=>`<option value="${n.id}" ${n.id===t?"selected":""}>${n.name}</option>`).join("");
  const route=m.target&&m.target!==a.at?camp.route(a.at,m.target,a.side,m.type==="raid"||m.type==="escort"):null;
  el.innerHTML=`<div class="cp-ord"><h3>${a.name}</h3>
    <div class="note">主将 ${a.gen.name} · 统帅 ${a.gen.cmd} · 智略 ${a.gen.int} · ${a.gen.persona} · 战力 ${Math.round(camp.power(a))} · 行军 ${camp.speed(a)>1?"快（全骑）":camp.speed(a)<1?"慢（带器械）":"常速"}</div>
    ${own?`<label class="cp-f">目标<select id="co-type">${Object.entries(MISSION_NAME).map(([k,v])=>`<option value="${k}" ${k===m.type?"selected":""}>${v}</option>`).join("")}</select></label>
    <label class="cp-f">目的地<select id="co-target"><option value="">（原地）</option>${nodesOpt}</select></label>
    <label class="cp-f" ${m.type==="delay"?"":"hidden"}>坚守日数<input type="number" id="co-hold" min="1" max="20" value="${m.holdDays||2}"></label>
    <label class="cp-f">撤退阈值<span class="slider-row" style="margin:0"><input type="range" id="co-ret" min="0" max="90" step="5" value="${Math.round((m.retreatAt||0)*100)}"><output>${m.retreatAt>0?Math.round(m.retreatAt*100)+"%":"不退"}</output></span></label>
    <div class="note">${{raid:"截粮：直扑敌粮仓或运粮队，入战后以焚毁辎重为第一目标，不恋战；焚够即撤。夜袭、顺风更易得手，雨天难以纵火。",escort:"护粮：护送辎重至目的地，入战后结阵护粮。",delay:"阻击：到达后坚守若干日，期满撤回；战斗中以坚守为目标。",attack:"进攻：前往目的地并击溃敌军；对敌营城可逐日选择强攻或对垒。",reinforce:"增援：赶往目的地，与当地友军合兵作战。",hold:"驻守：原地防守。",retreat:"撤回：退往目的地（默认本营）。"}[m.type]||""}</div>
    ${route?`<div class="note">路线：${[a.at,...route.path].map(x=>camp.nodes[x].name).join(" → ")}，约 ${Math.ceil(route.days/camp.speed(a))} 日</div>`:""}
    <div class="controls" style="padding:0;gap:6px"><button class="btn primary" id="co-apply">下达</button><button class="btn ${campPick?"primary":""}" id="co-pick">${campPick?"在地图上点目的地…":"地图选点"}</button></div>`:`<div class="note">${armyStatus(a)}（${camp.control[a.side]==="ai"?"AI 指挥":"不可指挥"}）</div>`}
  </div>`;
  if(!own) return;
  const sync=()=>{ $("#co-hold").closest("label").hidden=$("#co-type").value!=="delay"; };
  $("#co-type").onchange=sync;
  $("#co-ret").oninput=e=>{ e.target.nextElementSibling.textContent=e.target.value>0?e.target.value+"%":"不退"; };
  $("#co-pick").onclick=()=>{ campPick=!campPick; renderOrders(); };
  $("#co-apply").onclick=()=>{ const ty=$("#co-type").value, tg=$("#co-target").value||null;
    camp.setOrder(a,ty,ty==="hold"?null:tg,{holdDays:+$("#co-hold").value||2,retreatAt:+$("#co-ret").value/100});
    camp.note(`令 ${a.name}：${MISSION_NAME[ty]}${tg&&ty!=="hold"?" "+camp.nodes[tg].name:""}`,"order"); campPick=false; campSave(); renderCamp(); };
}
function renderCampInfo(){
  const c=camp; const deps=Object.values(c.nodes).filter(n=>n.depot);
  $("#cp-info").innerHTML=`<div class="lbl">粮仓</div>${deps.map(n=>`<div class="cp-dep"><span class="${n.owner?n.owner.toLowerCase():""}">${n.name}</span><div class="mbar"><i style="width:${Math.min(100,n.depot.food/Math.max(1,n.depot.food0||n.depot.food)*100)}%"></i></div><span class="mono">${Math.round(n.depot.food)}</span></div>`).join("")}
    <div class="lbl" style="margin-top:6px">每日军粮消耗</div>${["A","B"].map(s=>`<div class="note">${c.sideName(s)}：${c.armies.filter(a=>a.side===s&&!a.gone).reduce((t,a)=>t+c.eat(a),0).toFixed(1)} / 日</div>`).join("")}
    <div class="lbl" style="margin-top:6px">胜负条件</div>${c.sc.victory.map(v=>`<div class="note">${c.sideName(v.side)}胜：${v.text}</div>`).join("")}`;
}
/* 地图（绘制函数见 map_svg.js） */
function renderCampMap(){
  const c=camp, N=c.nodes; let h=mapBaseSVG({sc:c.sc,nodes:N,edges:c.edges,interactive:true,pick:campPick});
  for(const e of c.pending) if(!e.done){ const n=N[e.node]; h+=`<text x="${n.x+18}" y="${n.y-16}" class="cp-x">⚔</text>`; }
  // 进军箭头：画在最上层（玩家扮演甲方时，不显示乙方未被选中的路线）
  let arrows="", steps="";
  for(const a of c.armies){ if(a.gone||!a.path.length) continue; if(c.control[a.side]!=="player"&&a.side!==(campSel&&c.army(campSel)?c.army(campSel).side:"")&&c.control.A==="player"&&a.side==="B") continue;
    const sd=a.side.toLowerCase(), rt=a.mission.type==="retreat"?" retreat":"";
    if(a.order&&a.order.seq.length>1){ const d=marchArrow(a.order.seq,N); if(d) arrows+=`<path d="${d}" class="cp-march ${sd}${rt} ${a.id===campSel?"on":""}"><title>${esc(a.name)}：第 ${a.order.day} 日${PERIODS[a.order.ph].n}受令</title></path>`; }   // 示意大箭头：下令时定格
    const st=stepArrow(c,a.at,a.path[0],a.prog); if(st) steps+=`<path d="${st}" class="cp-step ${sd}"/>`; }   // 小尖头：当下这一步，逐时段更新
  const flags=c.armies.filter(a=>!a.gone).map(a=>{ const cus=c.combatUnits(a), men=cus.reduce((t,u)=>t+u.men,0), p=armyXY(N,a.at,a.path[0],a.prog,a.path[0]?c.edge(a.at,a.path[0]).d:1);
    return {...p,side:a.side,gen:a.gen.name,name:a.name,id:a.id,n:cus.length,men,ratio:men/(a.men0||men||1),org:cus.length?cus.reduce((t,u)=>t+Math.max(0,u.org)/UT[u.n].org,0)/cus.length:0,
      shaken:a.shaken>0,tag:MISSION_TAG[a.mission.type],cargo:a.cargo>0,on:a.id===campSel}; });
  h+=flagsSVG(flags,{interactive:true})+`<g class="cp-arrows" aria-hidden="true">${arrows}${steps}</g>`;
  $("#cp-svg").innerHTML=h;
}
/* 交互 */
$("#v-camp").addEventListener("click",e=>{
  const ab=e.target.closest("[data-army]"); if(ab){ campSel=ab.dataset.army===campSel?null:ab.dataset.army; campPick=false; renderCamp(); return; }
  const nd=e.target.closest("[data-node]"); if(nd){ const a=campSel&&camp.army(campSel); if(a&&canCommand(a)&&(campPick||true)&&$("#co-target")){ $("#co-target").value=nd.dataset.node;
      if(campPick){ $("#co-apply").click(); } else { const ty=$("#co-type").value; const n=camp.nodes[nd.dataset.node]; if(ty==="hold"){ $("#co-type").value=n.owner&&n.owner!==a.side?(n.depot?"raid":"attack"):"reinforce"; $("#co-type").dispatchEvent(new Event("change")); } } }
    return; }
  const eb=e.target.closest("[data-eng]"); if(eb){ const eg=camp.pending[+eb.dataset.eng]; const act=eb.dataset.act;
    if(act==="auto"){ camp.resolveAuto(eg); afterEngagement(); } else if(act==="standoff"){ camp.standoffDay(eg); afterEngagement(); } else if(act==="play") playEngagement(eg); return; }
  if(e.target.id==="cp-autoall"){ for(const eg of camp.pending) if(!eg.done) camp.resolveAuto(eg); afterEngagement(); return; }
  if(e.target.id==="cp-next"){ campAutoStop(); campAdvance("day"); return; }
  if(e.target.id==="cp-step"){ campAutoStop(); campAdvance("period"); return; }
  if(e.target.closest("#cp-auto")){ if(campAuto) campAutoStop(); else campAutoStart(); return; }
  if(e.target.id==="cp-lobby"){ campAutoStop(); window.PLAY&&(PLAY.campIn=false); showView("v-camp"); return; }
  if(e.target.id==="cp-restart"){ campAutoStop(); $("#cp-report").hidden=true; campNew({control:{...camp.control}}); return; }
  if(e.target.id==="cp-replay"){ campAutoStop(); $("#cp-report").hidden=true; const o=camp; camp=new Campaign(o.sc,{control:{...o.control},history:o.hist.on,tendency:o.hist.tend,seed:o.seed,anchors:o.hist.anchors}); campSel=null; campSave(); renderCamp(); return; }
  if(e.target.id==="cp-report-btn"){ openReport(); return; }
  const ha=e.target.closest("[data-histadopt]"); if(ha){ const a=camp.hist.anchors.find(x=>x.id===ha.dataset.histadopt); const ar=a&&camp.army(a.army); if(ar){ camp.histDone[a.id]="fired"; camp.histFired.push({day:camp.day,id:a.id,text:a.text}); camp.note(`〔史〕${a.text}`,"hist");
      camp.setOrder(ar,a.mission,a.target,{retreatAt:a.retreatAt??ar.mission.retreatAt}); if(a.mission==="raid") ar.task="raid";
      if(a.holdOthers) for(const [id,nd] of Object.entries(a.holdOthers)){ const o=camp.army(id); if(o&&!o.gone&&o.side===ar.side){ if(o.at!==nd) camp.setOrder(o,"reinforce",nd,{retreatAt:0.3}); else camp.setOrder(o,"hold",nd); } }
      camp.note(`${ar.name}：${MISSION_NAME[a.mission]}${a.target?camp.nodes[a.target].name:""}（从史）`,"order"); campSave(); renderCamp(); } return; }
  const ad=e.target.closest("[data-adopt]"); if(ad){ const [s,i]=ad.dataset.adopt.split(":"); const st=camp.strat[s]; const o=st.adv&&st.adv.list[+i]; if(o){ st.exec(o); st.intent=o.text; st.intentSet=true; st.adv=null; campSave(); renderCamp(); } return; }
});
$("#v-camp").addEventListener("change",e=>{ const k=e.target.dataset&&e.target.dataset.pause; if(!k) return; campCfg.pause[k]=e.target.checked; try{ localStorage.setItem(CAMP_CFG_KEY,JSON.stringify(campCfg)); }catch(x){} });
$("#v-camp").addEventListener("keydown",e=>{ if(e.key==="Enter"&&e.target.closest("[data-node],[data-army]")){ e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click",{bubbles:true})); } });
/* ===== AI 一键推演：双方交由战略 AI，逐日自动推进（可调速、可中止） ===== */
let campAuto=null;
/* ===== 推进：一时段 / 一日 / 自动；遇设定的要事（只看玩家一方）暂停 ===== */
function campAutoStop(){ if(campAuto){ clearTimeout(campAuto.t); campAuto=null; } const b=$("#cp-auto"); if(b){ b.textContent="▶ 自动"; b.classList.remove("primary"); } }
function pauseHits(){ const ps=["A","B"].filter(s=>camp.control[s]==="player"); return camp.alerts.filter(a=>ps.includes(a.side)&&campCfg.pause[a.kind]!==false); }
function showPause(hits){ const el=$("#cp-pause"); if(!el) return; if(!hits||!hits.length){ el.hidden=true; return; }
  const seen=new Set(), rows=hits.filter(h=>!seen.has(h.text)&&seen.add(h.text)).slice(0,6);
  el.hidden=false; el.innerHTML=`<b>暂停 · 第 ${rows[0].day} 日${PERIODS[rows[0].ph].n}</b>${rows.map(h=>`<div>${(PAUSE_KINDS.find(k=>k[0]===h.kind)||[,""])[1]}：${h.text}</div>`).join("")}`; }
/* 走一个时段：AI 方与对垒之战即时速决；玩家参与的交战留待亲自指挥或速决（返回 "engage"）；遇要事返回 "pause" */
function runPeriod(){ if(camp.over) return "over"; const d=camp.day, eng=camp.beginPeriod();
  for(const e of eng){ const playerIn=["A","B"].some(s=>camp.control[s]==="player"&&e.armies[s].length); if(e.standoff||!playerIn) camp.resolveAuto(e); }
  if(eng.some(e=>!e.done)){ showPause(pauseHits()); return "engage"; }
  camp.endPeriod(); if(camp.day!==d) for(const s of ["A","B"]) camp.strat[s].intentSet=false;
  const hits=pauseHits(); if(hits.length){ showPause(hits); return "pause"; } return camp.over?"over":"ok"; }
function campFinish(){ campSave(); renderCamp(); if(camp.over&&!camp.reported){ camp.reported=true; openReport(); } }
function campAdvance(unit){ if(camp.over||camp.pending.some(e=>!e.done)) return; showPause(null); const d=camp.day; let r, n=0;
  do{ r=runPeriod(); } while(unit==="day"&&r==="ok"&&camp.day===d&&n++<12);
  campFinish(); }
function campAutoStart(){
  if(camp.over){ camp=new Campaign(CAMP_SCENARIOS[campCfg.scenario],campOpts({control:{...camp.control}})); campSel=null; }
  if(window.campLink) return;   // 正在亲自指挥一场交战：先回到战役
  if(camp.pending.some(e=>!e.done)) return;
  camp.reported=false; showPause(null); campAuto={}; const b=$("#cp-auto"); b.textContent="■ 暂停"; b.classList.add("primary");
  const tick=()=>{ if(!campAuto) return; const spd=+$("#cp-auto-spd").value; let r, n=0;
    do{ r=runPeriod(); } while(r==="ok"&&spd===0&&n++<36);   // 瞬时：每次走六日
    if(r!=="ok"){ campAutoStop(); campFinish(); return; }
    if(spd>0||n%36===0) renderCamp(); campAuto.t=setTimeout(tick,spd); };
  tick(); }
/* 交战处理完毕：本时段终了；不自动续推，由玩家再按 */
function afterEngagement(){ if(camp.pending.length&&camp.pending.every(e=>e.done)){ const d=camp.day; camp.endPeriod(); if(camp.day!==d) for(const s of ["A","B"]) camp.strat[s].intentSet=false; } campFinish(); }
/* 亲自指挥：把战役交战载入战场 */
function playEngagement(e){
  const sp=camp.battleSpec(e); if(!savedSpec) savedSpec=spec;
  spec=sp; window.campLink={e,spec:sp};
  SIDE_NAME.A=camp.sideName(e.att); SIDE_NAME.B=camp.sideName(e.def); document.body.classList.toggle("flip",e.att==="B");
  syncSetup(); resetBattle(); showView("v-board");
}
function endCampBattle(){ const cl=window.campLink; if(!cl) return;
  if(!battle.done){ while(!battle.done){ battle.step(); pushLog(); } }
  camp.applyBattle(cl.e,battle); window.campLink=null; SIDE_NAME.A="甲军"; SIDE_NAME.B="乙军"; document.body.classList.remove("flip");
  if(savedSpec){ spec=savedSpec; savedSpec=null; } syncSetup(); resetBattle(); afterEngagement();
  showView("v-camp"); }
document.addEventListener("click",e=>{ if(e.target.id==="b-camp-ret") endCampBattle(); });

/* 战役编辑（编辑器 · 战役编辑） */
const CP_LABELS=[["STRAT_VISION","战略视野（日程）"],["STRAT_NOISE","敌情估计误差"],["STRAT_LAG","迟疑上限（×(1−统帅)）"],["RAID_INT","谋划截粮所需智略"],["FORESIGHT_INT","预设防备/择天时所需智略"],["SPY_INT","探知敌粮所需智略"],["COUNTER_INT","低于此智略可能围魏救赵"],["COUNTER_P","围魏救赵误判倾向"],["WITHDRAW_FOOD","前线粮少于此日数议退兵"],["STARVE_COLLAPSE","断粮满此日数全军溃散"],["CONVOY_LOAD","运粮每趟装粮"],["BURN_TRIGGER","烧粮仓：一次焚此比例即军心大震"],["BURN_ORG","烧粮仓：组织打击（×严重度）"],["BURN_FAR","烧粮仓：不就食该仓者打击折扣"],["BURN_DESERT","烧粮仓：逃亡比例"],["BURN_SEV_BASE","烧粮仓：严重度基数"],["BURN_SEV_SHARE","烧粮仓：严重度×焚粮占全军存粮比"],["SHAKEN_DAYS","军心动摇日数"],["SHAKEN_REC","动摇期夜间恢复减少"],["SHAKEN_CAP","动摇期组织上限"],["SHAKEN_FLEE","动摇时主力议退倾向"],["EXPLOIT_RATIO","乘乱击之所需兵力比"],["CUT_ORG","截粮：运粮被截过半组织小挫"],["FIRE_INT","谋划火攻所需智略"],["FIRE_BASE","火攻：火势基数"],["FIRE_ORG","火攻：被焚营组织打击"],["FIRE_MEN","火攻：被焚营伤亡"],["FIRE_FORT","火攻：营垒毁损"],["FIRE_SPREAD","火攻：蔓延概率（×火势）"],["FIRE_SHOCK_CAMPS","连焚此数营则全军大震"],["WX_PERSIST","天气延续概率"],["SUPPLY_RANGE","就粮距离（日）"],["FOOD_CAP_DAYS","随军粮草上限（日）"],["EAT_PER_10","每 10 部每日食粮"],["RAID_GOAL","截粮焚毁目标比例"],["RAID_UNGUARDED","无守粮仓每日被焚比例"],["STARVE_ORG","断粮每日组织打击"],["STARVE_MEN","断粮每日减员"],["NIGHT_ORG","夜间组织恢复"],["RALLY","溃部收拢概率"],["CAMP_BUILD","驻敌前每日筑营"],["ASSAULT_RATIO","AI 强攻所需战力比"],["ASSAULT_P","AI 试攻城垒概率"],["STANDOFF_LOSS","对垒之日零星伤亡"],["SCOUT_P","斥候发现袭粮之敌概率"],["DEPOT_UNITS_PER","每多少存粮化为一部粮垛"],["LATE_ENGAGE_PH","过此时段抵达敌前则次日清晨再战（0后半夜…5前半夜）"],["NIGHT_ROUNDS","夜战回合数"],["NEAR_DAYS","敌军距此（日）以内即报敌情"]];
const AN_TYPE={posture:"相持姿态",weather:"天时",intel:"情报",order:"军令",decision:"抉择",luck:"战运",defect:"倒戈",morale:"军心"};
function anWhen(a){ return [a.day!=null?`第 ${a.day} 日起`:"",a.until!=null?`至第 ${a.until} 日`:"",a.node?`于${(CAMP_SCENARIOS[campCfg.scenario].nodes[a.node]||{}).name||a.node}`:"",a.trigger?({depotLost:"粮仓失"}[a.trigger.split(":")[0]]||a.trigger.split(":")[0])+(a.trigger.split(":")[1]?`·${(CAMP_SCENARIOS[campCfg.scenario].nodes[a.trigger.split(":")[1]]||{}).name||""}${a.trigger.split(":")[2]?Math.round(a.trigger.split(":")[2]*100)+"%":""}`:""):""].filter(Boolean).join(" "); }
function anEffect(a){ const sc=CAMP_SCENARIOS[campCfg.scenario], an=id=>{ const x=sc.armies.find(q=>q.id===id); return x?x.name.split(" · ")[0]:id; }, sn=s=>sc.sides[s]?sc.sides[s].name:s, nn=n=>(sc.nodes[n]||{}).name||n;
  return {posture:()=>`${sn(a.side)}${a.noRaid?"不出奇兵、":""}强攻意愿 ×${a.assaultMul??1}`,weather:()=>`天气→${a.value}`,intel:()=>`${sn(a.side)}尽知敌情，袭粮 ×${a.bonus||1.3}`,order:()=>`${an(a.army)}：${MISSION_NAME[a.mission]}${a.target?nn(a.target):""}`,
    decision:()=>`${sn(a.side)}告急时选「${{counter:"围魏救赵",relieve:"驰援"}[a.choose]||a.choose}」`,luck:()=>`${sn(a.side)}战运 ×${a.value}`,defect:()=>`${an(a.army)}倒戈归${sn(a.to)}`,morale:()=>`${sn(a.side)}组织 −${Math.round((a.org||0)*100)}%、逃亡 ${Math.round((a.desert||0)*100)}%`}[a.type]?.()||""; }
function histSetupHTML(sc){ const H=sc.history; if(!H) return `<div class="lbl">历史模式</div><p class="note">此剧本未设史实锚点。</p>`;
  const an=H.anchors||[];
  return `<div class="histset"><div class="lbl">历史模式 <span class="note">随机种子固定推演；史实倾向把随机推向史实（0 = 纯随机，100% = 尽依史实）</span></div>
    <div class="form-row"><label class="cp-chk"><input type="checkbox" id="cs-hist" ${campCfg.history?"checked":""}> 启用历史模式</label></div>
    <div class="form-row"><span class="lbl">史实倾向</span><input type="range" id="cs-tend" min="0" max="100" step="5" value="${Math.round(campCfg.tendency*100)}" aria-label="史实倾向"><b id="cs-tend-v" class="mono">${Math.round(campCfg.tendency*100)}%</b></div>
    <div class="form-row"><span class="lbl">随机种子</span><input type="text" id="cs-seed" inputmode="numeric" placeholder="留空 = 每局随机" value="${campCfg.seed}" style="width:120px"><button class="btn" id="cs-seed-rnd" type="button">取一个</button></div>
    <div class="lbl">史实锚点 <span class="note">每个锚点在条件满足时按「倾向 × 权重」的概率发生；关闭则听凭推演</span></div>
    <div class="tbl-wrap"><table class="edit cs-anchors"><thead><tr><th>启用</th><th>类型</th><th>时机</th><th>作用</th><th>权重</th><th>史文</th></tr></thead><tbody>${an.map((a,i)=>`<tr class="${a.off?"off":""}"><td><input type="checkbox" data-an="${i}" data-g="on" ${a.off?"":"checked"} aria-label="启用 ${a.id}"></td><td>${AN_TYPE[a.type]||a.type}</td><td class="note">${anWhen(a)}</td><td>${anEffect(a)}</td><td><input type="number" step="0.1" min="0" data-an="${i}" data-g="weight" value="${a.weight??1}"></td><td class="note antext">${a.text}</td></tr>`).join("")}</tbody></table></div>
    <details class="an-json"><summary>高级：以 JSON 编辑锚点与史实结局</summary><p class="note">类型：posture(side,until,noRaid,assaultMul) · weather(day,value) · intel(side,day,bonus) · order(army,mission,target,day|trigger,holdOthers) · decision(side,node,choose:counter|relieve) · luck(side,node,day,value) · defect(army,to,joinAt,trigger) · morale(side,trigger,org,desert)。触发 trigger："depotLost:节点:比例" 或 "day:N"。结局 check：depotBelow / defected / nodeOwner / winner。</p>
      <textarea id="cs-an-json" rows="12" spellcheck="false">${JSON.stringify({anchors:an,outcomes:H.outcomes||[],startDate:H.startDate,dayScale:H.dayScale},null,1).replace(/</g,"&lt;")}</textarea>
      <div class="controls" style="padding:0;gap:6px"><button class="btn" id="cs-an-apply" type="button">应用 JSON</button><span class="note" id="cs-an-msg"></span></div></details>
    <div class="controls" style="padding:0;gap:6px;margin-top:6px"><button class="btn" id="cs-hbatch" type="button">按当前设置 AI 对 AI 推演 20 局</button><span class="note">（种子依次递增；未填种子则从 1 起）</span></div>
    <div id="cs-hbatch-out"></div></div>`; }
function histBatch(N=20){ const out=$("#cs-hbatch-out"), btn=$("#cs-hbatch"); btn.disabled=true; const base=campCfg.seed===""?1:+campCfg.seed; const sc=CAMP_SCENARIOS[campCfg.scenario];
  const res={}, oc={}, fids=[]; let days=0, i=0;
  const step=()=>{ const t0=performance.now(); while(i<N&&performance.now()-t0<40){ const c=new Campaign(sc,campOpts({control:{A:"ai",B:"ai"},seed:base+i})); for(let d=0;d<(sc.maxDays||60)+2&&!c.over;d++){ const eng=c.beginDay(); for(const e of eng) c.resolveAuto(e); c.endDay(); }
      const k=c.over?(c.over.side?c.sideName(c.over.side)+"胜":"罢兵"):"未决"; res[k]=(res[k]||0)+1; days+=c.day; if(c.hist.outcomes.length){ const f=c.fidelity(); fids.push(f.score); for(const o of f.list) oc[o.text]=(oc[o.text]||0)+(o.ok?1:0); } i++; }
    out.innerHTML=`<p class="note">推演中 ${i}/${N}…</p>`;
    if(i<N) return setTimeout(step,0);
    const pct=v=>Math.round(v/N*100)+"%";
    out.innerHTML=`<div class="hbatch"><div><b>${N} 局</b> · ${campCfg.history?`历史模式 倾向 ${Math.round(campCfg.tendency*100)}%`:"历史模式未启用"} · 种子 ${base}–${base+N-1} · 平均 ${(days/N).toFixed(1)} 日</div>
      <div>${Object.entries(res).map(([k,v])=>`<span class="hb-k">${k} <b>${v}</b></span>`).join(" ")}</div>
      ${fids.length?`<div>平均史实吻合度 <b>${Math.round(fids.reduce((a,b)=>a+b,0)/fids.length*100)}%</b> · 全合史实 ${fids.filter(f=>f>=0.999).length} 局</div><table class="rtab"><tbody>${Object.entries(oc).map(([k,v])=>`<tr><td>${k}</td><td class="mono">${pct(v)}</td><td style="width:45%"><span class="hb-bar" style="width:${v/N*100}%"></span></td></tr>`).join("")}</tbody></table>`:""}</div>`;
    btn.disabled=false; };
  step(); }
/* ================= 战役设置：剧本编辑器（初始态势、据点、道路、军团、胜负条件、新建/复制/导入导出） ================= */
const AI_ROLE={main:"主力",reserve:"预备",raider:"奇兵",garrison:"守备",convoy:"运粮"};
const N_TYPE={city:"城",camp:"营垒",depot:"粮屯",ford:"渡口",road:"道路"};
const TERRS=["平原","丘陵","隘口"], SEASONS=["春","夏","秋","冬"];
const V_TYPE={armyAt:"军团抵达",armyGone:"军团溃散",nodeOwner:"占领据点"};
const edOpen=new Set(["base"]);
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
function scSave(){ try{ localStorage.setItem(SC_KEY,JSON.stringify(CAMP_SCENARIOS)); localStorage.setItem(CAMP_CFG_KEY,JSON.stringify(campCfg)); }catch(x){} }
function curSc(){ return CAMP_SCENARIOS[campCfg.scenario]; }
function isBuiltin(k){ return !!CAMP_SC_DEFAULT[k]; }
/* 校验：引用的据点、军团是否存在；两军是否各有兵 */
function scValidate(sc){ const err=[], N=sc.nodes||{}, has=id=>!!N[id], ids=new Set();
  if(!Object.keys(N).length) err.push("没有据点");
  for(const [a,b,d] of sc.edges||[]){ if(!has(a)||!has(b)) err.push(`道路 ${a}—${b} 引用了不存在的据点`); if(!(d>0)) err.push(`道路 ${N[a]?.name||a}—${N[b]?.name||b} 日数须大于 0`); }
  for(const a of sc.armies||[]){ if(ids.has(a.id)) err.push(`军团编号重复：${a.id}`); ids.add(a.id);
    if(!has(a.at)) err.push(`${a.name}：驻地不存在`); if(a.home&&!has(a.home)) err.push(`${a.name}：本营不存在`);
    if(a.mission&&a.mission.target&&!has(a.mission.target)) err.push(`${a.name}：任务目标不存在`); if(a.planTarget&&!has(a.planTarget)) err.push(`${a.name}：计划进攻目标不存在`);
    if(a.retreatHome&&!has(a.retreatHome)) err.push(`${a.name}：退路不存在`); if(a.ai==="convoy"&&!has(a.convoyTo)) err.push(`${a.name}：运粮目的地未设`);
    if(!Object.values(a.roster||{}).some(v=>v>0)) err.push(`${a.name}：没有兵`); }
  for(const s of ["A","B"]) if(!(sc.armies||[]).some(a=>a.side===s)) err.push(`${sc.sides[s].name}没有军团`);
  for(const v of sc.victory||[]){ if(v.army&&!ids.has(v.army)) err.push(`胜负条件「${v.text}」引用的军团不存在`); if(v.node&&!has(v.node)) err.push(`胜负条件「${v.text}」引用的据点不存在`); }
  if(!(sc.victory||[]).some(v=>v.side==="A")||!(sc.victory||[]).some(v=>v.side==="B")) err.push("两军都至少需要一个胜利条件");
  const comp=new Set(); const ks=Object.keys(N); if(ks.length){ const st=[ks[0]]; while(st.length){ const x=st.pop(); if(comp.has(x)) continue; comp.add(x); for(const [a,b] of sc.edges||[]){ if(a===x) st.push(b); if(b===x) st.push(a); } } if(comp.size<ks.length) err.push(`有据点未与道路相连：${ks.filter(k=>!comp.has(k)).map(k=>N[k].name).join("、")}`); }
  return err; }
function blankScenario(){ return { name:"新战役", season:"秋", custom:true, sides:{A:{name:"甲军",short:"甲",lord:{name:"甲帅",cmd:75,int:70,persona:"均衡"}},B:{name:"乙军",short:"乙",lord:{name:"乙帅",cmd:75,int:70,persona:"均衡"}}},
  calendar:{startDate:{year:"某年",month:8,day:1},dayScale:2}, map:{rivers:[]}, desc:"自定义战役。",
  nodes:{ ca:{name:"甲城",x:200,y:400,type:"city",terrain:"平原",wall:0.8,owner:"A",depot:{food:80}}, mid:{name:"中途",x:500,y:400,type:"road",terrain:"丘陵",owner:null}, cb:{name:"乙城",x:800,y:400,type:"city",terrain:"平原",wall:0.8,owner:"B",depot:{food:80}} },
  edges:[["ca","mid",2],["mid","cb",2]],
  armies:[ {id:"A1",side:"A",name:"甲帅 · 中军",gen:{name:"甲帅",cmd:75,int:70,persona:"均衡",genPos:"rear",formation:"FANG"},at:"ca",home:"ca",ai:"main",planTarget:"cb",roster:{"刀盾兵":5,"长枪兵":2,"弓兵":2,"轻骑":1},mission:{type:"hold",retreatAt:0.5},food:5},
    {id:"B1",side:"B",name:"乙帅 · 中军",gen:{name:"乙帅",cmd:75,int:70,persona:"均衡",genPos:"rear",formation:"FANG"},at:"cb",home:"cb",ai:"main",planTarget:"ca",roster:{"刀盾兵":5,"长枪兵":2,"弓兵":2,"轻骑":1},mission:{type:"hold",retreatAt:0.5},food:5} ],
  maxDays:40, victory:[{side:"A",type:"nodeOwner",node:"cb",owner:"A",text:"攻克乙城"},{side:"A",type:"armyGone",army:"B1",text:"乙军中军溃散"},{side:"B",type:"nodeOwner",node:"ca",owner:"B",text:"攻克甲城"},{side:"B",type:"armyGone",army:"A1",text:"甲军中军溃散"}] }; }
/* 通用取值/赋值：data-p="nodes.liyang.name"，data-t= str|num|numnull|bool */
function pGet(o,p){ return p.split(".").reduce((x,k)=>x==null?x:x[k],o); }
function pSet(o,p,v){ const ks=p.split("."); let x=o; for(let i=0;i<ks.length-1;i++){ if(x[ks[i]]==null) x[ks[i]]={}; x=x[ks[i]]; } const k=ks[ks.length-1]; if(v===undefined) delete x[k]; else x[k]=v; }
const inp=(p,v,t="num",attr="")=>`<input ${t==="str"?'type="text"':'type="number" step="any"'} data-p="${p}" data-t="${t}" value="${esc(v)}" ${attr}>`;
const sel=(p,v,opts,attr="")=>`<select data-p="${p}" data-t="str" ${attr}>${opts.map(([k,l])=>`<option value="${esc(k)}" ${String(k)===String(v??"")?"selected":""}>${esc(l)}</option>`).join("")}</select>`;
function scPreviewSVG(sc){ const N=sc.nodes; let h=`<rect width="1000" height="800" class="ed-bg"/>`;
  for(const r of (sc.map&&sc.map.rivers)||[]) h+=`<path d="${esc(r.d)}" class="ed-river"/>`;
  for(const [a,b,d] of sc.edges) if(N[a]&&N[b]){ const m=roadAt(a,N[a],b,N[b],0.5); h+=`<path d="${roadD(a,N[a],b,N[b])}" class="ed-road"/><text x="${r1(m.x)}" y="${r1(m.y-8)}" class="ed-d">${d}</text>`; }
  for(const [id,n] of Object.entries(N)) h+=`<g class="ed-n ${(n.owner||"n").toLowerCase()}" data-drag="${id}" transform="translate(${n.x},${n.y})"><circle r="${n.type==="road"||n.type==="ford"?12:18}"/>${n.cover==="林"?'<text y="-24" class="ed-cv">林</text>':""}<text y="38" class="ed-nm">${esc(n.name)}</text></g>`;
  for(const a of sc.armies){ const n=N[a.at]; if(!n) continue; } return h; }
function buildCampSetup(){ const el=$("#camp-setup"); if(!el) return; const key=campCfg.scenario, sc=curSc(); if(!sc){ campCfg.scenario="GUANDU"; return buildCampSetup(); }
  const nodeOpts=(blank)=>[...(blank?[["",blank]]:[]),...Object.entries(sc.nodes).map(([k,n])=>[k,n.name])];
  const armyOpts=sc.armies.map(a=>[a.id,a.name]); const sideOpts=[["A",sc.sides.A.name],["B",sc.sides.B.name]];
  const cal=sc.calendar||{startDate:{year:"",month:1,day:1},dayScale:1}; sc.calendar=cal;
  const D=(id,title,body)=>`<details class="ed-sec" data-sec="${id}" ${edOpen.has(id)?"open":""}><summary>${title}</summary><div class="ed-body">${body}</div></details>`;
  const errs=scValidate(sc);
  const base=`<div class="ed-grid">
      <label>战役名称${inp("name",sc.name,"str",'style="width:100%"')}</label>
      <label>最长日数${inp("maxDays",sc.maxDays??60)}</label>
      <label>起始季节${sel("season",sc.season,SEASONS.map(x=>[x,x]))}</label>
      <label class="cp-chk"><input type="checkbox" data-p="dynamicSeason" data-t="boolneg" ${sc.dynamicSeason===false?"":"checked"}> 季节随日期推移</label>
      <label>纪年${inp("calendar.startDate.year",cal.startDate.year,"str")}</label>
      <label>起始月${inp("calendar.startDate.month",cal.startDate.month)}</label>
      <label>起始日${inp("calendar.startDate.day",cal.startDate.day)}</label>
      <label>每回合天数${inp("calendar.dayScale",cal.dayScale)}</label></div>
    <label class="ed-full">战役简介（开局写入日志）<textarea data-p="desc" data-t="str" rows="3">${esc(sc.desc)}</textarea></label>
    <div class="tbl-wrap"><table class="edit ed-t"><thead><tr><th>方</th><th>军号</th><th>简称</th><th>主帅</th><th>统帅</th><th>智略</th><th>性格</th><th>指挥</th></tr></thead><tbody>${["A","B"].map(s=>`<tr><td class="${s.toLowerCase()}">${s==="A"?"红":"蓝"}</td><td>${inp(`sides.${s}.name`,sc.sides[s].name,"str",'style="width:72px"')}</td><td>${inp(`sides.${s}.short`,sc.sides[s].short,"str",'style="width:32px"')}</td><td>${inp(`sides.${s}.lord.name`,sc.sides[s].lord.name,"str",'style="width:64px"')}</td><td>${inp(`sides.${s}.lord.cmd`,sc.sides[s].lord.cmd)}</td><td>${inp(`sides.${s}.lord.int`,sc.sides[s].lord.int)}</td><td>${sel(`sides.${s}.lord.persona`,sc.sides[s].lord.persona,Object.keys(T_PERSONA).map(k=>[k,k]))}</td><td><select data-ctl="${s}"><option value="player" ${campCfg.control[s]==="player"?"selected":""}>玩家</option><option value="ai" ${campCfg.control[s]==="ai"?"selected":""}>AI</option></select></td></tr>`).join("")}</tbody></table></div>`;
  const nodesT=`<div class="ed-mapwrap"><svg class="ed-map" id="ed-map" viewBox="0 0 1000 800" role="img" aria-label="据点位置（可拖动）">${scPreviewSVG(sc)}</svg><p class="note">拖动圆点可改据点位置；红=${esc(sc.sides.A.name)}，蓝=${esc(sc.sides.B.name)}，灰=无主。</p></div>
    <div class="tbl-wrap"><table class="edit ed-t"><thead><tr><th>据点</th><th>类型</th><th>地形</th><th title="林木：火攻火势 ×1.5">林</th><th>归属</th><th title="营垒等级（0–3）">营垒</th><th title="城墙耐久比例，留空=无城墙">城墙</th><th title="留空=无粮仓">存粮</th><th>x</th><th>y</th><th></th></tr></thead><tbody>${Object.entries(sc.nodes).map(([k,n])=>`<tr><td>${inp(`nodes.${k}.name`,n.name,"str",'style="width:86px"')}</td><td>${sel(`nodes.${k}.type`,n.type,Object.entries(N_TYPE))}</td><td>${sel(`nodes.${k}.terrain`,n.terrain,TERRS.map(x=>[x,x]))}</td><td><input type="checkbox" data-p="nodes.${k}.cover" data-t="cover" ${n.cover==="林"?"checked":""} aria-label="林木"></td><td>${sel(`nodes.${k}.owner`,n.owner||"",[["","无"],...sideOpts])}</td><td>${inp(`nodes.${k}.fort`,n.fort||0)}</td><td>${inp(`nodes.${k}.wall`,n.wall??"","numnull")}</td><td>${inp(`nodes.${k}.depot.food`,n.depot?n.depot.food:"","depot")}</td><td>${inp(`nodes.${k}.x`,n.x)}</td><td>${inp(`nodes.${k}.y`,n.y)}</td><td><button class="btn sm" data-act="delNode" data-k="${k}" title="删除据点">✕</button></td></tr>`).join("")}</tbody></table></div>
    <button class="btn" data-act="addNode">＋ 新增据点</button>`;
  const edgesT=`<div class="tbl-wrap"><table class="edit ed-t"><thead><tr><th>起</th><th>止</th><th>行军日数</th><th></th></tr></thead><tbody>${sc.edges.map((e,i)=>`<tr><td>${sel(`edges.${i}.0`,e[0],nodeOpts())}</td><td>${sel(`edges.${i}.1`,e[1],nodeOpts())}</td><td>${inp(`edges.${i}.2`,e[2])}</td><td><button class="btn sm" data-act="delEdge" data-i="${i}">✕</button></td></tr>`).join("")}</tbody></table></div><button class="btn" data-act="addEdge">＋ 新增道路</button>`;
  const armiesT=`<p class="note">角色决定战略 AI 如何用这支军：主力（议战议退）、预备（驰援）、奇兵（袭粮、火攻、截运）、守备（坚守不动）、运粮（往返运粮）。</p>
    <div class="tbl-wrap"><table class="edit ed-t ed-arm"><thead><tr><th>方</th><th>军团名</th><th>主将</th><th>统</th><th>智</th><th>性格</th><th>驻地</th><th>本营</th><th>角色</th><th>开局任务</th><th>目标</th><th title="伤亡达此比例撤出战斗">撤退</th><th title="主力：计划进攻之地">计划进攻</th><th title="主力败退时的归处（胜负条件常用）">退路</th><th title="运粮：送往">运往</th><th title="运粮：开局载粮">载粮</th><th>随军粮</th>${UNIT_ORDER.map(n=>`<th title="${n}">${GLYPH[n]}</th>`).join("")}<th></th></tr></thead><tbody>${sc.armies.map((a,i)=>`<tr><td>${sel(`armies.${i}.side`,a.side,sideOpts)}</td><td>${inp(`armies.${i}.name`,a.name,"str",'style="width:110px"')}</td><td>${inp(`armies.${i}.gen.name`,a.gen.name,"str",'style="width:52px"')}</td><td>${inp(`armies.${i}.gen.cmd`,a.gen.cmd)}</td><td>${inp(`armies.${i}.gen.int`,a.gen.int)}</td><td>${sel(`armies.${i}.gen.persona`,a.gen.persona,Object.keys(T_PERSONA).map(k=>[k,k]))}</td><td>${sel(`armies.${i}.at`,a.at,nodeOpts())}</td><td>${sel(`armies.${i}.home`,a.home||a.at,nodeOpts())}</td><td>${sel(`armies.${i}.ai`,a.ai,Object.entries(AI_ROLE))}</td><td>${sel(`armies.${i}.mission.type`,a.mission.type,Object.entries(MISSION_NAME))}</td><td>${sel(`armies.${i}.mission.target`,a.mission.target||"",nodeOpts("—"))}</td><td>${inp(`armies.${i}.mission.retreatAt`,a.mission.retreatAt??0)}</td><td>${sel(`armies.${i}.planTarget`,a.planTarget||"",nodeOpts("—"))}</td><td>${sel(`armies.${i}.retreatHome`,a.retreatHome||"",nodeOpts("—"))}</td><td>${sel(`armies.${i}.convoyTo`,a.convoyTo||"",nodeOpts("—"))}</td><td>${inp(`armies.${i}.cargo`,a.cargo||0)}</td><td>${inp(`armies.${i}.food`,a.food??5)}</td>${UNIT_ORDER.map(n=>`<td>${inp(`armies.${i}.roster.${n}`,a.roster[n]||0)}</td>`).join("")}<td><button class="btn sm" data-act="delArmy" data-i="${i}">✕</button></td></tr>`).join("")}</tbody></table></div>
    <button class="btn" data-act="addArmy" data-s="A">＋ ${esc(sc.sides.A.name)}军团</button> <button class="btn" data-act="addArmy" data-s="B">＋ ${esc(sc.sides.B.name)}军团</button>`;
  const vicT=`<div class="tbl-wrap"><table class="edit ed-t"><thead><tr><th>胜方</th><th>条件</th><th>军团</th><th>据点</th><th>说明</th><th></th></tr></thead><tbody>${(sc.victory||[]).map((v,i)=>`<tr><td>${sel(`victory.${i}.side`,v.side,sideOpts)}</td><td>${sel(`victory.${i}.type`,v.type,Object.entries(V_TYPE))}</td><td>${v.type==="nodeOwner"?'<span class="note">—</span>':sel(`victory.${i}.army`,v.army||"",[["","—"],...armyOpts])}</td><td>${v.type==="armyGone"?'<span class="note">—</span>':sel(`victory.${i}.node`,v.node||"",nodeOpts("—"))}</td><td>${inp(`victory.${i}.text`,v.text,"str",'style="width:150px"')}</td><td><button class="btn sm" data-act="delVic" data-i="${i}">✕</button></td></tr>`).join("")}</tbody></table></div><button class="btn" data-act="addVic">＋ 新增条件</button><p class="note">占领据点：该方军队占据此地即胜；军团抵达：指定军团（常为敌主帅）退回某地即胜；军团溃散：指定军团覆没即胜。达最长日数则两军罢兵。</p>`;
  el.innerHTML=`<h2>战役编辑 <span class="lbl">CAMPAIGN</span></h2><div class="body">
    <div class="ed-top"><label class="lbl">剧本<select id="cs-sc">${Object.entries(CAMP_SCENARIOS).map(([k,v])=>`<option value="${k}" ${k===key?"selected":""}>${esc(v.name)}${isBuiltin(k)?"":"（自定义）"}</option>`).join("")}</select></label>
      <button class="btn" data-act="copySc">复制为新战役</button><button class="btn" data-act="newSc">新建空白战役</button>${isBuiltin(key)?`<button class="btn" data-act="resetSc">恢复此剧本默认</button>`:`<button class="btn" data-act="delSc">删除此战役</button>`}<button class="btn" data-act="ioSc">导入 / 导出</button></div>
    <div id="ed-io" hidden><textarea id="ed-json" rows="10" spellcheck="false"></textarea><div class="controls" style="padding:0;gap:6px"><button class="btn" data-act="importSc">作为新战役导入</button><button class="btn" data-act="copyJson">复制 JSON</button><span class="note" id="ed-io-msg"></span></div></div>
    <div class="ed-err" ${errs.length?"":"hidden"}><b>需修正后才能开始：</b>${errs.map(esc).join("；")}</div>
    ${D("base","基本 · 两军主帅",base)}
    ${D("nodes",`据点（${Object.keys(sc.nodes).length}）· 地图位置、归属、营垒城墙、粮仓`,nodesT)}
    ${D("edges",`道路（${sc.edges.length}）`,edgesT)}
    ${D("armies",`军团（${sc.armies.length}）· 驻地、角色、开局任务、编成`,armiesT)}
    ${D("vic",`胜负条件（${(sc.victory||[]).length}）`,vicT)}
    ${D("hist","历史模式",histSetupHTML(sc))}
    ${D("cp","战役参数（全局）",`<div class="tgrid">${CP_LABELS.map(([k,l])=>`<label title="${k}">${l}<input type="number" step="any" data-cp="${k}" value="${CP[k]}" class="${CP[k]!==CP_DEFAULT[k]?"chg":""}"></label>`).join("")}</div><button class="btn" data-act="resetCp">恢复默认参数</button>`)}
    <div class="controls" style="padding:0;gap:6px"><button class="btn primary" id="cs-restart" ${errs.length?"disabled":""}>按此设置开始战役</button><button class="btn" id="cs-aitest" ${errs.length?"disabled":""} title="双方交由战略 AI，在战役地图上自动推演一局，用来检验剧本与参数">AI 观战试推</button><span class="note">修改在开始新一局时生效；正在进行的战役不受影响。</span></div>
  </div>`;
  bindEdMap(); }
function bindEdMap(){ const svg=$("#ed-map"); if(!svg) return; let drag=null;
  const pt=e=>{ const r=svg.getBoundingClientRect(); return {x:Math.round((e.clientX-r.left)/r.width*1000),y:Math.round((e.clientY-r.top)/r.height*800)}; };
  svg.addEventListener("pointerdown",e=>{ const g=e.target.closest("[data-drag]"); if(!g) return; drag=g.dataset.drag; svg.setPointerCapture(e.pointerId); e.preventDefault(); });
  svg.addEventListener("pointermove",e=>{ if(!drag) return; const p=pt(e), n=curSc().nodes[drag]; n.x=Math.max(20,Math.min(980,p.x)); n.y=Math.max(20,Math.min(780,p.y)); svg.innerHTML=scPreviewSVG(curSc());
    const ix=document.querySelector(`[data-p="nodes.${drag}.x"]`), iy=document.querySelector(`[data-p="nodes.${drag}.y"]`); if(ix) ix.value=n.x; if(iy) iy.value=n.y; });
  const end=()=>{ if(drag){ drag=null; scSave(); } }; svg.addEventListener("pointerup",end); svg.addEventListener("pointercancel",end); }
const EDV=$("#v-campedit");
EDV.addEventListener("toggle",e=>{ const d=e.target.closest&&e.target.closest("details.ed-sec"); if(d){ if(d.open) edOpen.add(d.dataset.sec); else edOpen.delete(d.dataset.sec); } },true);
EDV.addEventListener("change",e=>{ const t=e.target; const sc=curSc(); let rebuild=false, save=true;
  if(t.id==="cs-sc"){ campCfg.scenario=t.value; rebuild=true; }
  else if(t.id==="cs-hist") campCfg.history=t.checked; else if(t.id==="cs-tend") campCfg.tendency=(+t.value)/100; else if(t.id==="cs-seed") campCfg.seed=t.value.replace(/\D/g,"");
  else if(t.dataset.an!=null){ const a=sc.history.anchors[+t.dataset.an]; if(t.dataset.g==="on"){ if(t.checked) delete a.off; else a.off=true; t.closest("tr").classList.toggle("off",!t.checked); } else a.weight=Math.max(0,+t.value||0); }
  else if(t.dataset.ctl){ campCfg.control[t.dataset.ctl]=t.value; if(camp) camp.control[t.dataset.ctl]=t.value; }
  else if(t.dataset.cp){ const v=parseFloat(t.value); if(isFinite(v)) CP[t.dataset.cp]=v; t.classList.toggle("chg",CP[t.dataset.cp]!==CP_DEFAULT[t.dataset.cp]); try{ localStorage.setItem("hm-camp-cp2",JSON.stringify(CP)); }catch(x){} save=false; }
  else if(t.dataset.p){ const p=t.dataset.p, ty=t.dataset.t; let v;
    if(ty==="str") v=t.value; else if(ty==="num") v=+t.value||0; else if(ty==="numnull") v=t.value===""?undefined:+t.value; else if(ty==="boolneg") v=t.checked?undefined:false; else if(ty==="cover") v=t.checked?"林":undefined;
    else if(ty==="depot"){ const nk=p.split(".")[1]; if(t.value==="") delete sc.nodes[nk].depot; else sc.nodes[nk].depot={food:+t.value||0}; rebuild=true; }
    if(ty!=="depot"){ if(ty==="str"&&v===""&&/(target|planTarget|retreatHome|convoyTo|owner|army|node)$/.test(p)) v=p.endsWith("owner")?null:undefined; pSet(sc,p,v); }
    if(/^victory\.\d+\.side$/.test(p)){ const vv=pGet(sc,p.replace(/\.side$/,"")); if(vv.type==="nodeOwner") vv.owner=vv.side; }
    if(/^victory\.\d+\.type$/.test(p)){ const vv=pGet(sc,p.replace(/\.type$/,"")); if(vv.type==="nodeOwner"){ delete vv.army; vv.owner=vv.side; } if(vv.type==="armyGone") delete vv.node; }
    if(/^armies\.\d+\.side$/.test(p)) rebuild=true;
    if(/(\.name|\.type|\.owner|\.cover|^edges|\.ai|^victory|\.wall|\.fort)/.test(p)||p.startsWith("sides")) rebuild=true;
    if(/^nodes\.[^.]+\.(x|y)$/.test(p)){ const svg=$("#ed-map"); if(svg) svg.innerHTML=scPreviewSVG(sc); } }
  else save=false;
  if(save) scSave(); if(rebuild) buildCampSetup(); else { const er=scValidate(sc), box=EDV.querySelector(".ed-err"); if(box){ box.hidden=!er.length; box.innerHTML=`<b>需修正后才能开始：</b>${er.map(esc).join("；")}`; } for(const id of ["#cs-restart","#cs-aitest"]){ const rb=$(id); if(rb) rb.disabled=!!er.length; } } });
EDV.addEventListener("input",e=>{ if(e.target.id==="cs-tend") $("#cs-tend-v").textContent=e.target.value+"%"; });
EDV.addEventListener("click",e=>{ const t=e.target.closest("button"); if(!t) return; const sc=curSc(), act=t.dataset.act;
  if(t.id==="cs-seed-rnd"){ campCfg.seed=String(Math.floor(Math.random()*1e6)); $("#cs-seed").value=campCfg.seed; scSave(); return; }
  if(t.id==="cs-hbatch"){ histBatch(20); return; }
  if(t.id==="cs-an-apply"){ try{ const o=JSON.parse($("#cs-an-json").value); if(!Array.isArray(o.anchors)) throw new Error("缺少 anchors 数组"); sc.history={...sc.history,...o}; scSave(); buildCampSetup(); $("#cs-an-msg").textContent="已应用"; }catch(x){ $("#cs-an-msg").textContent="JSON 有误："+x.message; } return; }
  if(t.id==="cs-restart"){ if(scValidate(sc).length) return; campAutoStop&&campAutoStop(); campNew(); window.PLAY&&(PLAY.campIn=true); showView("v-camp"); return; }
  if(t.id==="cs-aitest"){ if(scValidate(sc).length) return; campAutoStop(); campNew({control:{A:"ai",B:"ai"}}); window.PLAY&&(PLAY.campIn=true); showView("v-camp"); campAutoStart(); return; }
  if(!act) return;
  const uid=(pre,obj)=>{ let i=1; while(obj[pre+i]) i++; return pre+i; };
  if(act==="addNode"){ const k=uid("n",sc.nodes); sc.nodes[k]={name:"新据点",x:500,y:400,type:"road",terrain:"平原",owner:null}; edOpen.add("nodes"); }
  else if(act==="delNode"){ const k=t.dataset.k; if(sc.armies.some(a=>a.at===k)){ alertNote(`有军团驻于${sc.nodes[k].name}，请先移走`); return; } delete sc.nodes[k]; sc.edges=sc.edges.filter(e=>e[0]!==k&&e[1]!==k); }
  else if(act==="addEdge"){ const ks=Object.keys(sc.nodes); sc.edges.push([ks[0],ks[1]||ks[0],1]); edOpen.add("edges"); }
  else if(act==="delEdge") sc.edges.splice(+t.dataset.i,1);
  else if(act==="addArmy"){ const s=t.dataset.s, ids=new Set(sc.armies.map(a=>a.id)); let i=1; while(ids.has(s+"X"+i)) i++; const home=Object.keys(sc.nodes).find(k=>sc.nodes[k].owner===s)||Object.keys(sc.nodes)[0];
    sc.armies.push({id:s+"X"+i,side:s,name:`新军 ${i}`,gen:{name:"将",cmd:70,int:60,persona:"均衡",genPos:"front",formation:"FANG"},at:home,home,ai:"reserve",roster:{"刀盾兵":3,"弓兵":1},mission:{type:"hold",retreatAt:0.45},food:5}); edOpen.add("armies"); }
  else if(act==="delArmy"){ const a=sc.armies[+t.dataset.i]; sc.armies.splice(+t.dataset.i,1); sc.victory=(sc.victory||[]).filter(v=>v.army!==a.id); }
  else if(act==="addVic"){ (sc.victory=sc.victory||[]).push({side:"A",type:"nodeOwner",node:Object.keys(sc.nodes)[0],owner:"A",text:"新条件"}); edOpen.add("vic"); }
  else if(act==="delVic") sc.victory.splice(+t.dataset.i,1);
  else if(act==="resetCp"){ Object.assign(CP,CP_DEFAULT); try{ localStorage.removeItem("hm-camp-cp2"); }catch(x){} }
  else if(act==="copySc"){ const k="C"+Date.now().toString(36); const c=JSON.parse(JSON.stringify(sc)); c.name=sc.name+"（副本）"; c.custom=true; CAMP_SCENARIOS[k]=c; campCfg.scenario=k; }
  else if(act==="newSc"){ const k="C"+Date.now().toString(36); CAMP_SCENARIOS[k]=blankScenario(); campCfg.scenario=k; edOpen.add("nodes"); }
  else if(act==="delSc"){ if(isBuiltin(campCfg.scenario)) return; delete CAMP_SCENARIOS[campCfg.scenario]; campCfg.scenario="GUANDU"; }
  else if(act==="resetSc"){ CAMP_SCENARIOS[campCfg.scenario]=JSON.parse(JSON.stringify(CAMP_SC_DEFAULT[campCfg.scenario])); }
  else if(act==="ioSc"){ const b=$("#ed-io"); b.hidden=!b.hidden; $("#ed-json").value=JSON.stringify(sc,null,1); return; }
  else if(act==="copyJson"){ navigator.clipboard&&navigator.clipboard.writeText($("#ed-json").value).then(()=>$("#ed-io-msg").textContent="已复制",()=>$("#ed-io-msg").textContent="复制失败，请手动选取"); return; }
  else if(act==="importSc"){ try{ const o=JSON.parse($("#ed-json").value); if(!o.nodes||!o.armies||!o.sides) throw new Error("缺少 nodes / armies / sides"); o.edges=o.edges||[]; o.custom=true; o.name=(o.name||"导入战役"); const k="C"+Date.now().toString(36); CAMP_SCENARIOS[k]=o; campCfg.scenario=k; }catch(x){ $("#ed-io-msg").textContent="JSON 有误："+x.message; return; } }
  scSave(); buildCampSetup(); });
function alertNote(t){ const b=EDV.querySelector(".ed-err"); if(b){ b.hidden=false; b.textContent=t; } }
buildCampSetup();
/* ================= 主帅 · 谋士献策 ================= */
const DK={fire:"火攻营寨",assault:"进逼强攻",exploit:"乘乱击之",raid:"奇袭粮仓",intercept:"截击运粮",relieve:"援救",counter:"围魏救赵",guard:"预设防备",withdraw:"退兵",hesitate:"迟疑未决"};
function lordHTML(s){ const c=camp, st=c.strat[s], L=st.lord; const player=c.control[s]==="player";
  let adv=""; if(player&&!c.over){ if(!st.adv||st.adv.day!==c.day){ st.adv={day:c.day,list:st.options().filter(o=>o.score>0.2).slice(0,3)}; } const list=st.adv.list;
    const hints=Object.values(c.histHint||{}).filter(a=>!c.histDone[a.id]&&c.army(a.army)&&!c.army(a.army).gone&&c.army(a.army).side===s);
    adv=(hints.length?`<div class="lbl" style="margin-top:4px">史实之机 <span class="note">（史上此时所为，可采纳或另作决断）</span></div>`+hints.map(a=>`<div class="cp-adv shi"><div><b>〔史〕${c.army(a.army).name.split(" · ")[0]}：${MISSION_NAME[a.mission]}${a.target?c.nodes[a.target].name:""}</b><div class="note">${a.text}</div></div><button class="btn" data-histadopt="${a.id}">从史</button></div>`).join(""):"")+`<div class="lbl" style="margin-top:4px">谋士献策 <span class="note">（所见所虑取决于${L.name}的智略）</span></div>`+(list.length?list.map((o,i)=>`<div class="cp-adv"><div><b>${o.text}</b><div class="note">${o.why}</div></div><button class="btn" data-adopt="${s}:${i}">采纳</button></div>`).join(""):`<div class="note">${L.int<CP.RAID_INT?"帐下无人献奇策":"暂无良策，宜静观其变"}</div>`); }
  return `<div class="cp-lord ${s.toLowerCase()}"><div class="cp-lh"><span class="chip">${c.sideInfo[s].short}</span><b>${L.name}</b><span class="note">统帅 ${L.cmd} · 智略 ${L.int} · ${L.persona}</span><span class="tag">${st.style()}</span></div>
    <div class="note">${player?"我军":"敌军"}意图：${player?(st.intentSet?st.intent:"由你决断"):(seeIntent(s)?st.intent:"敌情不明（我方主帅智略不足以窥其意图）")}</div>${adv}</div>`; }
function seeIntent(s){ const o=s==="A"?"B":"A"; if(camp.control[o]!=="player") return true; return camp.strat[o].lord.int>=CP.SPY_INT; }

/* ================= 战役报告 ================= */
const RCOL={A:"var(--chart-a)",B:"var(--chart-b)"};
function lineChart(id,series,opt){ // series:[{name,side,dash,values:[[x,y]]}]
  const W=640,H=220,m={l:44,r:84,t:12,b:26}; const xs=series.flatMap(s=>s.values.map(v=>v[0])), ys=series.flatMap(s=>s.values.map(v=>v[1]));
  const x0=Math.min(...xs), x1=Math.max(...xs,x0+1), y1=Math.max(1,...ys)*1.08; const X=x=>m.l+(x-x0)/(x1-x0)*(W-m.l-m.r), Y=y=>H-m.b-y/y1*(H-m.t-m.b);
  const ticks=[0,0.25,0.5,0.75,1].map(f=>f*y1); const fmt=opt.fmt||(v=>Math.round(v));
  let h=`<svg viewBox="0 0 ${W} ${H}" class="rchart" role="img" aria-label="${opt.title}">`;
  for(const t of ticks) h+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(t)}" y2="${Y(t)}" class="rg"/><text x="${m.l-6}" y="${Y(t)+4}" class="ry">${fmt(t)}</text>`;
  const step=Math.max(1,Math.ceil((x1-x0)/10)); for(let x=x0;x<=x1;x+=step) h+=`<text x="${X(x)}" y="${H-8}" class="rx">${x}</text>`;
  const ends=[];
  series.forEach((s,i)=>{ const d=s.values.map((v,j)=>(j?"L":"M")+X(v[0]).toFixed(1)+" "+Y(v[1]).toFixed(1)).join(""); h+=`<path d="${d}" fill="none" stroke="${RCOL[s.side]}" stroke-width="2" stroke-dasharray="${s.dash||""}" stroke-linejoin="round"/>`;
    const lv=s.values[s.values.length-1]; if(lv) ends.push({y:Y(lv[1]),x:X(lv[0]),name:s.name,side:s.side}); });
  ends.sort((a,b)=>a.y-b.y); for(let i=1;i<ends.length;i++) if(ends[i].y-ends[i-1].y<12) ends[i].y=ends[i-1].y+12;
  for(const e of ends) h+=`<text x="${e.x+6}" y="${e.y+4}" class="rl">${e.name}</text>`;
  h+=`<line class="rcross" x1="0" x2="0" y1="${m.t}" y2="${H-m.b}" visibility="hidden"/><rect class="rhit" x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="transparent" tabindex="0"/></svg>`;
  const legend=`<div class="rleg">${series.map(s=>`<span><i style="border-top:2px ${s.dash?"dashed":"solid"} ${RCOL[s.side]}"></i>${s.name}</span>`).join("")}</div>`;
  return {html:`<figure class="rfig" id="${id}"><figcaption>${opt.title}</figcaption>${legend}<div class="rwrap">${h}<div class="rtip" hidden></div></div></figure>`,
    bind(){ const fig=document.getElementById(id); if(!fig) return; const svg=fig.querySelector("svg"), hit=fig.querySelector(".rhit"), cross=fig.querySelector(".rcross"), tip=fig.querySelector(".rtip");
      const show=x=>{ const xv=Math.round(x0+(x-m.l)/(W-m.l-m.r)*(x1-x0)); const cx=X(Math.max(x0,Math.min(x1,xv))); cross.setAttribute("x1",cx); cross.setAttribute("x2",cx); cross.setAttribute("visibility","visible");
        tip.hidden=false; tip.replaceChildren(); const hd=document.createElement("div"); hd.className="rth"; hd.textContent=`第 ${xv} 日`; tip.appendChild(hd);
        for(const s of series){ const v=s.values.find(p=>p[0]===xv); if(!v) continue; const r=document.createElement("div"); r.className="rtr"; const k=document.createElement("i"); k.style.borderTop=`2px ${s.dash?"dashed":"solid"} ${RCOL[s.side]}`; const b=document.createElement("b"); b.textContent=fmt(v[1]); const n=document.createElement("span"); n.textContent=s.name; r.append(k,b,n); tip.appendChild(r); }
        const rect=svg.getBoundingClientRect(); tip.style.left=Math.min(rect.width-140,cx/W*rect.width+10)+"px"; };
      hit.addEventListener("pointermove",e=>{ const r=svg.getBoundingClientRect(); show((e.clientX-r.left)/r.width*W); });
      hit.addEventListener("pointerleave",()=>{ tip.hidden=true; cross.setAttribute("visibility","hidden"); });
      hit.addEventListener("focus",()=>show(W-m.r)); hit.addEventListener("blur",()=>{ tip.hidden=true; cross.setAttribute("visibility","hidden"); }); } }; }
/* ================= 史书体：把推演写成编年 ================= */
const CN_NUM=n=>n<=10?"一二三四五六七八九十"[n-1]:n<20?"十"+"一二三四五六七八九"[n-11]:n<100?"一二三四五六七八九"[Math.floor(n/10)-1]+"十"+(n%10?"一二三四五六七八九"[n%10-1]:""):String(n);
function chronicle(c){
  const S=["A","B"], nm=s=>c.sideName(s), L=s=>c.strat[s].lord, lead=names=>[...new Set(names.map(x=>x.split(" · ")[0].replace("（降）","")))].join("、");
  const ents=[]; const add=(day,t,cls="")=>ents.push({day,t,cls,ord:ents.length});
  add(1,`${L("B").name}与${L("A").name}相拒${(()=>{ const m=c.events.find(e=>e.type==="standoff")||c.battles[0]; return m?"于"+c.nodes[m.node].name.split("·")[0]:""; })()}`);
  for(const h of c.histFired) add(h.day,h.text,"shi");
  const histIds=new Set(c.histFired.map(h=>h.id));
  for(const d of c.decisions){ if(d.kind==="hesitate"||/^史实/.test(d.why)||/粮尽，退往/.test(d.text)) continue;
    const t=d.kind==="withdraw"?d.text.replace(/^(.+?)(退兵|退守本营)$/,(m,a,b)=>`${a===d.lord?d.lord:d.lord+"令"+a}${b==="退兵"?"引还":"退守本营"}`):(t0=>t0.startsWith("遣"+d.lord)?`${d.lord}自将${t0.slice(1+d.lord.length)}`:`${d.lord}${t0}`)(d.text.replace(/^令/,"遣"));
    add(d.day,t+(d.kind==="counter"?"，欲攻其必救":"")); }
  for(const b of c.battles){ const W=b.winner, Lz=W?(W===b.att?b.def:b.att):null, big=Math.max(b.lossPct[b.att],b.lossPct[b.def]);
    if(c.histFired.some(h=>h.day===b.day&&h.node===b.node)) continue;
    if(b.raidOk){ add(b.day,`${lead(b.armies[b.raidOk])}${b.night?"夜":""}袭${b.place}，${b.burnt>0.5?"尽燔其辎重":"焚其辎重"}${W&&W===b.raidOk&&b.lossPct[Lz]>0.2?"，守者大溃":""}`); continue; }
    if(!W&&big<0.08&&!(b.burnt>0.1)) continue;
    if(W) add(b.day,`${lead(b.armies[W])}与${lead(b.armies[Lz])}战于${b.place}${b.night?"（夜）":""}，${b.lossPct[Lz]>=0.3?"大破之":"败之"}${b.lossPct[Lz]>=0.3?"，"+lead(b.armies[Lz])+"走":""}`);
    else add(b.day,`${lead(b.armies[b.att])}攻${lead(b.armies[b.def])}于${b.place}，${b.lossPct[b.att]>b.lossPct[b.def]*1.5?"不克，死伤甚众":"相持不下"}`); }
  for(const e of c.events){
    if(e.type==="capture") add(e.day,`${L(e.side).name}拔${c.nodes[e.node].name}`);
    else if(e.type==="depot"&&e.amount>=8&&!c.battles.some(b=>b.day===e.day&&b.node===e.node&&b.raidOk)) add(e.day,`${c.nodes[e.node].name}积谷焚者十之${CN_NUM(Math.max(1,Math.min(10,Math.round(e.amount/Math.max(1,e.before)*10))))}`);
    else if(e.type==="fire") add(e.day,e.f>0?`${nm(e.by)}纵火焚${c.nodes[e.node].name}${e.burned.length>1?`，火势延及${e.burned.slice(1).map(x=>c.nodes[x].name).join("、")}，连破${CN_NUM(e.burned.length)}营`:""}`:`${nm(e.by)}欲火攻${c.nodes[e.node].name}，火不得起`);
    else if(e.type==="shock"&&e.cause==="fire") add(e.day,`${nm(e.side)}连营被焚，众皆惊溃`);
    else if(e.type==="shock") add(e.day,`${nm(e.side).replace(/军$/,"")}军闻${c.nodes[e.node].name}积谷被焚，${e.org>=40?"军心大震，众皆汹惧":"军中震动"}`);
    else if(e.type==="convoy"&&e.amount>=0.5*e.before) add(e.day,`${c.army(e.army).name.split(" · ")[0]}运粮为敌所截`);
    else if(e.type==="collapse") add(e.day,`${c.army(e.army).name.split(" · ")[0]}粮尽，众散`); }
  const fs={}; for(const e of c.events.filter(e=>e.type==="starve")) if(!fs[e.side]){ fs[e.side]=1; add(e.day,`${nm(e.side)}乏食`); }
  if(c.over) add(c.day,c.over.side?`${nm(c.over.side)}胜：${c.over.text}`:c.over.text,"end");
  ents.sort((a,b)=>a.day-b.day||a.ord-b.ord);
  // 按月编排；每月附相持、议而不决之数
  const hasDate=!!(c.hist&&c.hist.startDate); const key=d=>{ if(!hasDate) return "第 "+(Math.floor((d-1)/10)*10+1)+"–"+(Math.floor((d-1)/10)*10+10)+" 日"; const t=c.dateOf(d); return `${t.y} · ${t.mn}月`; };
  const months=[]; const mm={}; const mon=d=>{ const k=key(d); if(!mm[k]){ mm[k]={k,items:[],so:{},hes:{}}; months.push(mm[k]); } return mm[k]; };
  for(let d=1;d<=c.day;d++) mon(d);
  for(const e of ents) mon(e.day).items.push(e);
  for(const e of c.events.filter(e=>e.type==="standoff")){ const m=mon(e.day); m.so[e.node]=(m.so[e.node]||0)+1; }
  for(const d of c.decisions.filter(d=>d.kind==="hesitate")){ const m=mon(d.day); m.hes[d.lord]=(m.hes[d.lord]||0)+1; }
  const dayLbl=d=>hasDate?c.dateOf(d).d:`第${d}日`;
  const mLines=months.filter(m=>m.items.length||Object.keys(m.so).length||Object.keys(m.hes).length).map(m=>{ const lines=[]; let lastD=null, cur=null;
    for(const e of m.items){ if(e.day!==lastD){ cur={d:e.day,parts:[]}; lines.push(cur); lastD=e.day; } cur.parts.push(e); }
    const tail=[...Object.entries(m.so).map(([n,k])=>`两军对垒于${c.nodes[n].name}，凡${CN_NUM(k)}日不战`),...Object.entries(m.hes).filter(([l,k])=>k>=2).map(([l,k])=>`${l}议而不决者${CN_NUM(k)}`)];
    return {k:m.k,lines,tail}; });
  // 史臣曰
  const lunz=[]; const W=c.over&&c.over.side, Ls=W?(W==="A"?"B":"A"):null;
  if(W){ const rk=c.battles.filter(b=>b.raidOk===W); const fk=c.events.filter(e=>e.type==="fire"&&e.by===W&&e.burned&&e.burned.length);
    if(fk.length) lunz.push(`${L(Ls).name}依林结营，连屯数十，${L(W).name}待天时而纵火，${fk.reduce((t,e)=>t+e.burned.length,0)>1?"一炬而连营俱溃":"一举而破之"}；兵法所谓"以火佐攻者明"也。`);
    else if(rk.length) lunz.push(`兵以食为本。${L(W).name}焚${[...new Set(rk.map(b=>b.place))].join("、")}之积，${L(Ls).name}之众不战而自乱，所谓攻其所必救者也。`);
    else if(c.events.some(e=>e.type==="capture"&&e.side===W)) lunz.push(`${L(W).name}乘隙拔其坚垒，${L(Ls).name}失其所恃，遂不能支。`);
    else lunz.push(`${L(W).name}持重待敌，以逸击劳，卒成其功。`);
    if(c.decisions.some(d=>d.side===Ls&&d.kind==="counter")) lunz.push(`${L(Ls).name}闻粮屯告急，不救而攻坚营，此智者所不取也。`);
    const hz=c.decisions.filter(d=>d.side===Ls&&d.kind==="hesitate").length; if(hz>=3) lunz.push(`${L(Ls).name}议而不决者${CN_NUM(hz)}，坐失事机。`);
    if(c.defected.length) lunz.push(`将帅离心，临阵倒戈，败亡之兆先见矣。`); }
  else lunz.push(c.over?`两军相持日久，师老粮匮，各引而还，劳而无功。`:`胜负未分。`);
  const fid=c.hist&&c.hist.outcomes&&c.hist.outcomes.length?c.fidelity():null;
  if(c.hist&&c.hist.on&&fid){ const miss=fid.list.filter(o=>!o.ok); lunz.push(miss.length?`然考之于史，其异者${CN_NUM(miss.length)}：${miss.map(o=>`史称「${o.text}」，此则不然`).join("；")}。`:"其事始末，与史所载略同。"); }
  else if(fid){ const ok=fid.list.filter(o=>o.ok); lunz.push(`（此为自由推演，与史合者${ok.length?CN_NUM(ok.length):"无"}。）`); }
  const html=`<div class="chron">${mLines.map(m=>`<div class="chm"><h4>${m.k}</h4>${m.lines.map(l=>`<p><span class="chd">${dayLbl(l.d)}</span>${l.parts.map(p=>`<span class="${p.cls}">${p.t}</span>`).join("。")}。</p>`).join("")}${m.tail.length?`<p class="note">是月，${m.tail.join("；")}。</p>`:""}</div>`).join("")}
    <p class="lunz"><b>史臣曰：</b>${lunz.join("")}</p></div>`;
  const text=[...mLines.flatMap(m=>[`【${m.k}】`,...m.lines.map(l=>`${dayLbl(l.d)}，${l.parts.map(p=>p.t).join("。")}。`),...(m.tail.length?[`是月，${m.tail.join("；")}。`]:[])]),`史臣曰：${lunz.join("")}`].join("\n");
  return {html,text}; }
function fidelityHTML(c){ if(!c.hist||!c.hist.outcomes||!c.hist.outcomes.length) return ""; const f=c.fidelity(); const fired={}; for(const h of c.histFired) fired[h.id]=h.day;
  const st=a=>a.off?'<span class="note">关闭</span>':c.histDone[a.id]==="fired"?`<span class="ok">✓ 应验（第 ${fired[a.id]??"?"} 日）</span>`:c.histDone[a.id]==="missed"?'<span class="bad">✗ 未应验</span>':'<span class="note">未及（条件未至）</span>';
  return `<h3>史实吻合度 <span class="note">${c.hist.on?`历史模式 · 倾向 ${Math.round(c.hist.tend*100)}% · 种子 ${c.seed}`:`自由推演 · 种子 ${c.seed}`}</span></h3>
    <div class="fid"><div class="rtile"><b>${Math.round(f.score*100)}%</b><span>结局合于史</span></div><ul class="fidl">${f.list.map(o=>`<li class="${o.ok?"ok":"bad"}">${o.ok?"✓":"✗"} ${o.text}</li>`).join("")}</ul></div>
    ${c.hist.on?`<div class="tbl-wrap"><table class="rtab"><thead><tr><th>锚点</th><th>史文</th><th>状态</th></tr></thead><tbody>${c.hist.anchors.map(a=>`<tr><td>${AN_TYPE[a.type]||a.type}</td><td class="note">${a.text}</td><td>${st(a)}</td></tr>`).join("")}</tbody></table></div>`:""}`; }
function buildReport(c){
  const S=["A","B"], nm=s=>c.sideName(s), L=s=>c.strat[s].lord;
  const last=c.stats[c.stats.length-1]||{men:{A:0,B:0}}; const men0=c.initMen;
  const kinds=s=>{ const o={}; for(const d of c.decisions.filter(d=>d.side===s)) o[d.kind||"other"]=(o[d.kind||"other"]||0)+1; return o; };
  const burntBy=s=>c.events.filter(e=>e.type==="depot"&&e.side!==s).reduce((t,e)=>t+e.amount,0);
  const starveDays=s=>c.events.filter(e=>e.type==="starve"&&e.side===s).length;
  const res=c.over?(c.over.side?`${nm(c.over.side)}胜——${c.over.text}`:c.over.text):`战役进行中（第 ${c.day} 日）`;
  // 转折点
  const tp=[]; const bigDepot=c.events.filter(e=>e.type==="depot").sort((a,b)=>b.amount-a.amount)[0];
  if(bigDepot) tp.push({day:bigDepot.day,t:`${c.nodes[bigDepot.node].name}粮仓一日被焚 ${Math.round(bigDepot.amount)}（存粮 ${Math.round(bigDepot.before)} → ${Math.round(bigDepot.before-bigDepot.amount)}）`});
  const bigB=c.battles.slice().sort((a,b)=>Math.max(...Object.values(b.lossPct))-Math.max(...Object.values(a.lossPct)))[0];
  if(bigB) tp.push({day:bigB.day,t:`${bigB.place}之战伤亡最重：${bigB.desc.split("：").slice(1).join("：")}`});
  for(const e of c.events.filter(e=>e.type==="fire"&&e.f>0)) tp.push({day:e.day,t:`${nm(e.by)}火攻${c.nodes[e.node].name}（火势 ${Math.round(e.f*100)}%）${e.burned.length>1?`，连焚 ${e.burned.length} 营`:""}`});
  for(const e of c.events.filter(e=>e.type==="shock"&&e.cause!=="fire")) tp.push({day:e.day,t:`${c.nodes[e.node].name}屯粮被焚，${nm(e.side)}军心大震：组织平均 −${e.org}%，数日难复`});
  for(const e of c.events.filter(e=>e.type==="capture")) tp.push({day:e.day,t:`${nm(e.side)}攻占${c.nodes[e.node].name}`});
  for(const e of c.events.filter(e=>e.type==="collapse")) tp.push({day:e.day,t:`${c.army(e.army).name}断粮溃散`});
  const firstStarve={}; for(const e of c.events.filter(e=>e.type==="starve")) if(!firstStarve[e.side]) firstStarve[e.side]=e; for(const s of S) if(firstStarve[s]) tp.push({day:firstStarve[s].day,t:`${nm(s)}始现断粮`});
  for(const d of c.decisions.filter(d=>d.kind==="counter")) tp.push({day:d.day,t:`${d.lord}误判敌情，${d.text}（${d.why}）`});
  tp.sort((a,b)=>a.day-b.day);
  // 风格评述
  const styleText=s=>{ const k=kinds(s), l=L(s); const p=[];
    if(k.raid) p.push(`出奇兵袭粮 ${k.raid} 次${c.battles.filter(b=>b.raidOk===s).length?`，焚粮得手 ${c.battles.filter(b=>b.raidOk===s).length} 次`:""}`);
    if(k.intercept) p.push(`截击运粮 ${k.intercept} 次`); if(k.relieve) p.push(`遣援 ${k.relieve} 次`); if(k.guard) p.push(`料敌先机、预设防备 ${k.guard} 次`);
    if(k.counter) p.push(`误判敌情而围魏救赵 ${k.counter} 次`); if(k.hesitate) p.push(`议而不决 ${k.hesitate} 日`); if(k.withdraw) p.push(`下令退兵 ${k.withdraw} 次`);
    if(!p.length) p.push(c.control[s]==="player"?"由玩家亲自指挥":"按兵不动，未出奇谋");
    const lead=l.int>=85?"深谋远虑，所见者远":l.int>=65?"颇有谋略":l.int>=45?"谋略中平，所虑不及粮道之外":"寡于谋略，易为敌所误";
    const exe=l.cmd>=85?"号令严明，令出即行":l.cmd>=65?"调度尚可":"调度迟缓，常议而不决";
    return `${l.name}（统帅 ${l.cmd} / 智略 ${l.int}，${l.persona}）：${lead}；${exe}。本役${p.join("，")}。`; };
  // 总评
  let summary=`${c.name}历时 ${c.day} 日，${res}。`;
  if(c.over&&c.over.side){ const w=c.over.side, l=w==="A"?"B":"A"; const okRaids=c.battles.filter(b=>b.raidOk===w);
    if(okRaids.length) summary+=`${nm(w)}以奇兵${okRaids.map(b=>`于第 ${b.day} 日${b.night?"夜":""}袭${b.place}`).join("、")}，焚敌粮草共约 ${Math.round(burntBy(w))}；`;
    if(starveDays(l)) summary+=`${nm(l)}断粮累计 ${starveDays(l)} 军日，`;
    if(c.events.some(e=>e.type==="capture"&&e.side===w)) summary+=`${nm(w)}攻破${c.events.filter(e=>e.type==="capture"&&e.side===w).map(e=>c.nodes[e.node].name).join("、")}，`;
    summary+=`终致${c.over.text}。`; }
  summary+=`双方兵员：${nm("A")} ${Math.round(men0.A)} → ${Math.round(last.men.A)}，${nm("B")} ${Math.round(men0.B)} → ${Math.round(last.men.B)}。`;
  // 军团表现
  const armRows=c.armies.map(a=>{ const bs=c.battles.filter(b=>b.armyIds[a.side].includes(a.id)); const now=a.gone?0:c.combatUnits(a).reduce((t,u)=>t+u.men,0); const ok=c.battles.filter(b=>b.raidOk===a.side&&b.armyIds[a.side].includes(a.id)).length;
    return `<tr><td class="${a.side.toLowerCase()}">${nm(a.side)}</td><th>${a.name}</th><td>${a.gen.cmd}/${a.gen.int}</td><td>${bs.length}</td><td>${Math.round(a.men0||0)}</td><td>${Math.round(now)}</td><td>${a.gone?"溃散":MISSION_NAME[a.mission.type]+"·"+c.nodes[a.at].name}</td><td>${ok?`焚粮得手 ${ok}`:""}</td></tr>`; }).join("");
  const charts=[lineChart("rc-men",S.map(s=>({name:nm(s),side:s,values:c.stats.map(d=>[d.day,d.men[s]])})),{title:"双方兵员（逐日）",fmt:v=>(v/10000).toFixed(1)+"万"}),
    lineChart("rc-food",Object.values(c.nodes).filter(n=>n.depot).map((n,i)=>({name:n.name,side:(c.sc.nodes[n.id].owner||n.owner||"A"),dash:i%2?"5 4":"",values:c.stats.map(d=>[d.day,d.depots[n.id]??0])})),{title:"各粮仓存粮（逐日）",fmt:v=>Math.round(v)})];
  const chron=chronicle(c), maps=reportMapsHTML(c);
  const tile=(v,l)=>`<div class="rtile"><b>${v}</b><span>${l}</span></div>`;
  const html=`<div class="rhead"><h2>战役报告 · ${c.name}</h2><div class="controls" style="padding:0;gap:6px"><button class="btn" id="rp-copy">复制报告文本</button><button class="btn" id="cp-replay" title="用本局的随机种子与设置重演：结果完全相同（除非你改变了指挥）">同种子重演</button><button class="btn" id="cp-restart" title="同一剧本、同一设置重新开一局">再开一局</button><button class="btn primary" id="rp-close">返回地图</button></div></div>
    <p class="rres"><b>${res}</b></p><p>${summary}</p>
    <div class="rtabs" role="tablist"><button class="btn on" data-rt="data" role="tab">战报</button><button class="btn" data-rt="map" role="tab">战役示意图</button><button class="btn" data-rt="daily" role="tab">每日战况</button><button class="btn" data-rt="chron" role="tab">史书体</button></div>
    <div class="rpane" data-pane="map" hidden>${maps.map}</div><div class="rpane" data-pane="daily" hidden>${maps.daily}</div>
    <div class="rpane" data-pane="chron" hidden><h3>${c.name} · 纪事</h3>${chron.html}${fidelityHTML(c)}</div><div class="rpane" data-pane="data">
    <div class="rtiles">${tile(c.day+" 日","历时")}${tile(c.battles.length,"会战")}${S.map(s=>tile(Math.round((1-last.men[s]/Math.max(1,men0[s]))*100)+"%",nm(s)+"兵员损失")).join("")}${S.map(s=>tile(Math.round(burntBy(s)),nm(s)+"焚敌粮仓")).join("")}${S.map(s=>tile(Math.round(c.events.filter(e=>e.type==="convoy"&&e.side!==s).reduce((t,e)=>t+e.amount,0)),nm(s)+"截敌运粮")).join("")}${S.map(s=>tile(starveDays(s),nm(s)+"断粮军日")).join("")}</div>
    <h3>两军主帅</h3>${S.map(s=>`<p class="rlord ${s.toLowerCase()}">${styleText(s)}</p>`).join("")}
    <div class="rcharts">${charts.map(x=>x.html).join("")}</div>
    <h3>转折点</h3>${tp.length?`<ol class="rtp">${tp.map(x=>`<li><span class="mono">第 ${x.day} 日</span> ${x.t}</li>`).join("")}</ol>`:'<p class="note">尚无</p>'}
    <h3>会战一览</h3><div class="tbl-wrap"><table class="rtab"><thead><tr><th>日</th><th>地点</th><th>形式</th><th>攻方</th><th>守方</th><th>结果</th><th>攻方损失</th><th>守方损失</th><th>焚辎重</th></tr></thead><tbody>${c.battles.map(b=>`<tr><td>${b.day}</td><td>${b.place}</td><td>${b.mode}${b.night?"·夜":""}${b.weather!=="晴"?"·"+b.weather:""}</td><td class="${b.att.toLowerCase()}">${b.armies[b.att].map(x=>x.split(" · ")[0]).join("、")}</td><td class="${b.def.toLowerCase()}">${b.armies[b.def].map(x=>x.split(" · ")[0]).join("、")}</td><td>${b.raidOk?nm(b.raidOk)+"焚粮得手":(b.winner?nm(b.winner)+"胜·"+b.reason:"相持")}</td><td>${Math.round(b.lossPct[b.att]*100)}%</td><td>${Math.round(b.lossPct[b.def]*100)}%</td><td>${b.burnt>0.01?Math.round(b.burnt*100)+"%":""}</td></tr>`).join("")||'<tr><td colspan="9" class="note">尚无会战</td></tr>'}</tbody></table></div>
    <h3>军团表现</h3><div class="tbl-wrap"><table class="rtab"><thead><tr><th>方</th><th>军团</th><th>统/智</th><th>参战</th><th>初兵</th><th>今兵</th><th>终况</th><th>战绩</th></tr></thead><tbody>${armRows}</tbody></table></div>
    <h3>战略决策年表</h3><div class="tbl-wrap"><table class="rtab"><thead><tr><th>日</th><th>主帅</th><th>决策</th><th>缘由</th></tr></thead><tbody>${c.decisions.map(d=>`<tr><td>${d.day}</td><td class="${d.side.toLowerCase()}">${d.lord}</td><td>${DK[d.kind]?`<span class="rk">${DK[d.kind]}</span> `:""}${d.text}</td><td class="note">${d.why}</td></tr>`).join("")||'<tr><td colspan="4" class="note">尚无（玩家下达的命令见战役日志）</td></tr>'}</tbody></table></div></div>`;
  const text=[`战役报告 · ${c.name}`,res,summary,"","两军主帅：",...S.map(styleText),"","转折点：",...tp.map(x=>`第${x.day}日 ${x.t}`),"","会战一览：",...c.battles.map(b=>`第${b.day}日 ${b.desc}`),"","战略决策：",...c.decisions.map(d=>`第${d.day}日【${d.lord}】${d.text}——${d.why}`),"","—— 史书体 ——",chron.text,...(c.hist&&c.hist.outcomes&&c.hist.outcomes.length?["",`史实吻合度 ${Math.round(c.fidelity().score*100)}%：`+c.fidelity().list.map(o=>(o.ok?"✓":"✗")+o.text).join(" ")]:[])].join("\n");
  return {html,text,charts,maps};
}
function openReport(){ const el=$("#cp-report"); const r=buildReport(camp); el.innerHTML=r.html; el.hidden=false; r.charts.forEach(x=>x.bind()); el.scrollTop=0;
  $("#rp-close").onclick=()=>{ el.hidden=true; };
  el.querySelectorAll("[data-rt]").forEach(b=>b.onclick=()=>{ el.querySelectorAll("[data-rt]").forEach(x=>x.classList.toggle("on",x===b)); el.querySelectorAll("[data-pane]").forEach(p=>p.hidden=p.dataset.pane!==b.dataset.rt); if(b.dataset.rt==="data") r.charts.forEach(x=>x.bind()); if(b.dataset.rt==="map"||b.dataset.rt==="daily") r.maps.bind(el); });
  if(camp.hist&&camp.hist.on) el.querySelector('[data-rt="chron"]').click(); $("#rp-copy").onclick=async()=>{ try{ await navigator.clipboard.writeText(r.text); $("#rp-copy").textContent="已复制"; }catch(e){ $("#rp-copy").textContent="复制失败"; } }; }

window.renderCamp=renderCamp;
