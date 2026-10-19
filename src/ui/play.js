/* ================= 游玩模式：开局大厅（战役）· 选战例（战斗）· 玩家军令 ================= */
const PLAY_KEY="hm-play-v1";
const PLAY={
  pref:"A", bsel:2, bfilter:"全部", csel:null, cside:"A",   // 大厅里的选择（记在本浏览器）
  battleSide:null, battleIn:false, campIn:false, fromEdit:false,           // 本次会话的进行状态
  get side(){ const cl=window.campLink;                     // 当前战场上玩家指挥的一方（null = 观战）
    if(cl&&camp){ const e=cl.e; return camp.control[e.att]==="player"?"A":camp.control[e.def]==="player"?"B":null; }
    return this.battleIn?this.battleSide:null; },
};
window.PLAY=PLAY;   // const 不会挂到 window 上；main.js / camp_ui.js 通过 window.PLAY 判断
try{ const o=JSON.parse(localStorage.getItem(PLAY_KEY)||"null"); if(o) for(const k of ["pref","bsel","bfilter","csel","cside"]) if(k in o) PLAY[k]=o[k]; }catch(e){}
function playSave(){ try{ localStorage.setItem(PLAY_KEY,JSON.stringify({pref:PLAY.pref,bsel:PLAY.bsel,bfilter:PLAY.bfilter,csel:PLAY.csel,cside:PLAY.cside})); }catch(e){} }
const clone=o=>JSON.parse(JSON.stringify(o));
const segBtns=(attr,list,cur)=>list.map(([v,l])=>`<button type="button" data-${attr}="${v}" aria-pressed="${v===cur}">${l}</button>`).join("");

/* ---------- 路由：游玩页在「大厅」与「进行中」之间切换 ---------- */
window.routeView=id=>{
  if(id==="v-camp") return PLAY.campIn?"v-camp":"v-clobby";
  if(id==="v-board") return (window.campLink||PLAY.battleIn)?"v-board":"v-blobby";
  return id; };
const VIEW_SUB={"v-clobby":"选剧本与阵营，开一局战役","v-camp":"战役地图上调兵遣将 · 两军相遇转入战场","v-blobby":"选战例与阵营，亲自指挥一场会战",
  "v-board":"开战前点兵牌布阵 · 开战后在左栏下达战术","v-campedit":"编辑剧本：据点、道路、军团、胜负条件与史实锚点","v-setup":"编辑战例：编成、地形、会战模式与战术 AI",
  "v-tactics":"战术库：效果、阶段、条件与克制","v-rules":"兵种、阵型、状态、地形与结算参数","v-batch":"按战斗编辑中的编成连续演算，统计胜率"};
window.onView=id=>{
  const sub=$("#top-sub"); if(sub) sub.textContent=VIEW_SUB[id]||"";
  if(id==="v-clobby") renderCLobby();
  if(id==="v-blobby") renderBLobby();
  if(id==="v-board"){ const bb=$("#b-back"); bb.hidden=!!window.campLink; bb.textContent=PLAY.fromEdit?"← 战斗编辑":"← 战例"; bb.title=PLAY.fromEdit?"返回编辑器":"返回选战例"; }
};

/* ================= 战役 · 开局 ================= */
function scTroops(sc,s){ let n=0; for(const a of sc.armies) if(a.side===s) for(const [u,c] of Object.entries(a.roster||{})) if(UT[u]&&!UT[u].engine&&!UT[u].supply) n+=c; return n; }
function renderCLobby(){
  const el=$("#v-clobby"); if(!CAMP_SCENARIOS[PLAY.csel]) PLAY.csel=campCfg.scenario;
  const key=PLAY.csel, sc=CAMP_SCENARIOS[key], errs=scValidate(sc);
  const cont=!!camp;
  const who=c=>{ const p=["A","B"].filter(s=>c.control[s]==="player"); return p.length?`你指挥 ${p.map(s=>c.sideName(s)).join("、")}`:"观战"; };
  const vsSide=s=>{ const L=sc.sides[s].lord||{}; return `<div class="vs-side ${s.toLowerCase()}"><b>${esc(sc.sides[s].name)}</b><span>${esc(L.name||"")} · 统 ${L.cmd??"—"} / 智 ${L.int??"—"} · ${esc(L.persona||"")}</span><span class="note">${sc.armies.filter(a=>a.side===s).length} 支军团 · 约 ${(scTroops(sc,s)/10).toFixed(1)} 万</span></div>`; };
  const dt=sc.calendar&&sc.calendar.startDate&&sc.calendar.startDate.year?`${sc.calendar.startDate.year} ${sc.calendar.startDate.month}月`:sc.season||"";
  el.innerHTML=`<div class="lobby">
    <section class="card"><h2>选择剧本 <span class="lbl">CAMPAIGN</span></h2><div class="body">
      ${cont?`<div class="cp-eng"><div><b>${camp.over?"上一局":"当前进度"}：${esc(camp.name)}</b> <span class="note">第 ${camp.day} 日 · ${who(camp)}${camp.hist&&camp.hist.on?" · 历史模式":""}${camp.over?" · 已结束":""}</span></div><div class="cp-eb"><button class="btn${camp.over?"":" primary"}" id="cl-cont">${camp.over?"查看战果":"继续战役"}</button></div></div>`:""}
      <div class="pick-list">${Object.entries(CAMP_SCENARIOS).map(([k,v])=>`<button type="button" class="pick ${k===key?"on":""}" data-sc="${k}"><span class="nm">${esc(v.name)}</span><span class="st">${esc(v.sides.A.name)} 對 ${esc(v.sides.B.name)} · ${v.armies.length} 支军团${isBuiltin(k)?"":" · 自定义"}${v.history?" · 可用历史模式":""}</span></button>`).join("")}</div>
      <button type="button" class="linkbtn" data-goto="v-campedit">新建或修改剧本：编辑器 · 战役编辑 →</button>
    </div></section>
    <section class="card"><h2>剧本 <span class="lbl">${esc(dt)}</span></h2><div class="body">
      <p class="lobby-title">${esc(sc.name)}</p>
      ${sc.desc?`<div class="note">${esc(sc.desc)}</div>`:""}
      <div class="vs">${vsSide("A")}<span class="vs-x">對</span>${vsSide("B")}</div>
      <dl class="kv"><dt>最长日数</dt><dd>${sc.maxDays??60}</dd><dt>据点 / 道路</dt><dd>${Object.keys(sc.nodes).length} / ${sc.edges.length}</dd></dl>
      <div><div class="lbl">胜负条件</div>${(sc.victory||[]).map(v=>`<div class="note">${esc(sc.sides[v.side].name)}胜：${esc(v.text)}</div>`).join("")||'<div class="note">（未设，打满日数为止）</div>'}</div>
      <div><div class="lbl">你的指挥</div><div class="seg" id="cl-side">${segBtns("s",[["A","扮演"+sc.sides.A.name],["B","扮演"+sc.sides.B.name],["","观战"]],PLAY.cside)}</div></div>
      ${sc.history?`<label class="chk"><input type="checkbox" id="cl-hist" ${campCfg.history?"checked":""}> 历史模式：随机推向史实，结束后生成史书体纪事</label>
        <div class="slider-row" ${campCfg.history?"":"hidden"} id="cl-tend-row"><span class="lbl">史实倾向</span><input type="range" id="cl-tend" min="0" max="100" step="5" value="${Math.round(campCfg.tendency*100)}"><output>${Math.round(campCfg.tendency*100)}%</output></div>`:""}
      <div class="form-row"><span class="lbl">随机种子</span><input id="cl-seed" class="mono" inputmode="numeric" placeholder="留空则随机" value="${esc(campCfg.seed)}"></div>
      ${errs.length?`<div class="ed-err">剧本有误，需在编辑器中修正：${errs.map(esc).join("；")}</div>`:""}
      <div class="toolbar"><button class="btn primary" id="cl-go" ${errs.length?"disabled":""}>开始战役</button><span class="note">${PLAY.cside?"逐日下令，遇敌可亲自指挥会战":"双方由战略 AI 指挥，可自动推演"}</span></div>
    </div></section></div>`;
}
$("#v-clobby").addEventListener("click",e=>{
  const p=e.target.closest("[data-sc]"); if(p){ PLAY.csel=p.dataset.sc; playSave(); renderCLobby(); return; }
  const sd=e.target.closest("#cl-side [data-s]"); if(sd){ PLAY.cside=sd.dataset.s; playSave(); renderCLobby(); return; }
  if(e.target.id==="cl-cont"){ PLAY.campIn=true; showView("v-camp"); return; }
  if(e.target.id==="cl-go"){
    const s=PLAY.cside, sd2=$("#cl-seed").value.trim(), h=$("#cl-hist");
    campCfg.scenario=PLAY.csel; campCfg.control=s?{A:s==="A"?"player":"ai",B:s==="B"?"player":"ai"}:{A:"ai",B:"ai"};
    campCfg.history=!!(h&&h.checked); if($("#cl-tend")) campCfg.tendency=+$("#cl-tend").value/100;
    campCfg.seed=/^\d+$/.test(sd2)?sd2:"";
    try{ localStorage.setItem(CAMP_CFG_KEY,JSON.stringify(campCfg)); }catch(x){}
    campAutoStop(); campNew(); PLAY.campIn=true; if(window.buildCampSetup) buildCampSetup(); showView("v-camp"); return; }
});
$("#v-clobby").addEventListener("input",e=>{
  if(e.target.id==="cl-tend") e.target.nextElementSibling.textContent=e.target.value+"%";
  if(e.target.id==="cl-hist") $("#cl-tend-row").hidden=!e.target.checked;
});

/* ================= 战斗 · 选战例 ================= */
const MODE_BRIEF={攻守:"甲军来攻，乙军守阵，守方享地形之利。",决战:"两军同时压上，日暮收兵，次日黎明再战。",遭遇:"行军中相遇，各部按速度陆续展开，先到的骑兵可袭击未展开的队列。",
  阵地:"乙军据营垒而守，双方每夜议定次日方略。",围城:"乙军守城：攻方造器械攻城，守方修城、出城焚械；城中粮尽则溃。"};
const MISSION_SHORT={rout:"击溃敌军",destroy:"焚粮",hold:"坚守",delay:"阻滞",escort:"护粮"};
const BFILTERS=["全部","遭遇","决战","攻守","阵地","围城"];
function presetTitle(p){ const i=p.name.indexOf(" · "); return i<0?[p.name,""]:[p.name.slice(0,i),p.name.slice(i+3)]; }
function rosterGlyphs(r){ return UNIT_ORDER.filter(n=>(r[n]||0)>0).map(n=>`<span class="mini">${GLYPH[n]}</span>${r[n]}`).join(" "); }
function rosterMen(r){ let n=0; for(const u in r) if(UT[u]&&!UT[u].engine) n+=r[u]*1000; return n; }
function curPreset(){ return PLAY.bsel>=0&&PRESETS[PLAY.bsel]?PRESETS[PLAY.bsel]:spec; }
function renderBLobby(){
  const el=$("#v-blobby"); if(PLAY.bsel>=0&&!PRESETS[PLAY.bsel]) PLAY.bsel=0;
  const custom=$("#preset").value==="-1";
  if(PLAY.bsel<0&&!custom) PLAY.bsel=0;
  const p=curPreset(), [t1,t2]=PLAY.bsel<0?["自定义战例","编辑器中当前的编成"]:presetTitle(p);
  const list=PRESETS.map((x,i)=>[x,i]).filter(([x])=>PLAY.bfilter==="全部"||x.mode===PLAY.bfilter);
  const vsSide=s=>{ const d=p[s], m=d.mission||{type:"rout"}; const ex=[d.fort?`营垒 ${d.fort} 级`:"",d.wall!=null?`城墙 ${Math.round(d.wall*100)}%`:"",d.food?`粮 ${d.food} 日`:""].filter(Boolean).join(" · ");
    return `<div class="vs-side ${s.toLowerCase()}"><b>${SIDE_NAME[s]}</b><span>统 ${d.cmd} / 智 ${d.int??60}${d.ai&&d.ai.persona?" · "+d.ai.persona:""}</span><span class="gl">${rosterGlyphs(d.roster)}</span><span class="note">${(rosterMen(d.roster)/10000).toFixed(1)} 万 · 目标：${MISSION_SHORT[m.type]||m.type}${ex?" · "+ex:""}</span></div>`; };
  el.innerHTML=`<div class="lobby">
    <section class="card"><h2>选择战例 <span class="lbl">BATTLE</span></h2><div class="body">
      <div class="seg" id="bl-filter">${segBtns("f",BFILTERS.map(f=>[f,f]),PLAY.bfilter)}</div>
      <div class="pick-list">${custom?`<button type="button" class="pick ${PLAY.bsel<0?"on":""}" data-bp="-1"><span class="nm">自定义战例</span><span class="st">编辑器中当前的编成 · ${spec.mode} · ${spec.terrain}</span></button>`:""}
        ${list.map(([x,i])=>{ const [a,b]=presetTitle(x); return `<button type="button" class="pick ${i===PLAY.bsel?"on":""}" data-bp="${i}"><span class="nm">${esc(a)}</span><span class="st">${b?esc(b)+" · ":""}${x.mode} · ${x.terrain}</span></button>`; }).join("")}</div>
      <button type="button" class="linkbtn" data-goto="v-setup">自己配一场：编辑器 · 战斗编辑 →</button>
    </div></section>
    <section class="card"><h2>战例 <span class="lbl">${p.mode}战</span></h2><div class="body">
      <p class="lobby-title">${esc(t1)}</p>${t2?`<div class="note">${esc(t2)}</div>`:""}
      <dl class="kv"><dt>地形</dt><dd>${p.terrain}</dd><dt>会战模式</dt><dd>${p.mode}</dd><dt>预定日数</dt><dd>${p.days||1} 日</dd><dt>天气</dt><dd>${p.weather||"晴"}</dd><dt>开战</dt><dd>${PERIODS[presetStart(p)].n}${PERIODS[presetStart(p)].night?" · 夜战":""}</dd></dl>
      <div class="note">${MODE_BRIEF[p.mode]||""}</div>
      <div class="vs">${vsSide("A")}<span class="vs-x">對</span>${vsSide("B")}</div>
      <div><div class="lbl">你的指挥</div><div class="seg" id="bl-side">${segBtns("s",[["A","甲军"],["B","乙军"],["","观战"]],PLAY.pref)}</div></div>
      <div class="note">${PLAY.pref?"开战前点己方兵牌布阵、选阵型与主将位置；开战后在左栏「军令」中下达战术，未下令时由副将（战术 AI）自择。":"双方由战术 AI 指挥，你可逐回合或自动推演观战。"}</div>
      <div class="toolbar"><button class="btn primary" id="bl-go">出阵</button><span class="sp"></span><button type="button" class="linkbtn" id="bl-edit">在编辑器中调整此战例 →</button></div>
    </div></section></div>`;
}
function loadPresetSpec(){ if(PLAY.bsel>=0){ spec=clone(PRESETS[PLAY.bsel]); $("#preset").value=String(PLAY.bsel); }
  for(const k of ["A","B"]) if(!spec[k].ai) spec[k].ai={on:true,persona:"均衡",forced:""}; }
function battleGo(){
  loadPresetSpec(); const s=PLAY.pref||null;
  if(s) spec[s].ai={...spec[s].ai,on:true,forced:""};     // 玩家一方：保留战术 AI 作「副将」，战术由玩家下令
  PLAY.battleSide=s; PLAY.battleIn=true; PLAY.fromEdit=false; syncSetup(); resetBattle(); showView("v-board"); }
$("#v-blobby").addEventListener("click",e=>{
  const f=e.target.closest("#bl-filter [data-f]"); if(f){ PLAY.bfilter=f.dataset.f; playSave(); renderBLobby(); return; }
  const p=e.target.closest("[data-bp]"); if(p){ PLAY.bsel=+p.dataset.bp; playSave(); renderBLobby(); return; }
  const sd=e.target.closest("#bl-side [data-s]"); if(sd){ PLAY.pref=sd.dataset.s; playSave(); renderBLobby(); return; }
  if(e.target.id==="bl-go"){ battleGo(); return; }
  if(e.target.id==="bl-edit"){ loadPresetSpec(); syncSetup(); resetBattle(); showView("v-setup"); return; }
});
$("#b-back").onclick=()=>{ if(window.campLink) return; stop(); PLAY.battleIn=false; if(PLAY.fromEdit){ PLAY.fromEdit=false; showView("v-setup"); } else showView("v-board"); };
$("#se-try").onclick=()=>{ if(window.campLink){ showView("v-board"); return; } PLAY.battleSide=null; PLAY.battleIn=true; PLAY.fromEdit=true; resetBattle(); showView("v-board"); };

/* ================= 战场 · 玩家军令（左栏） ================= */
window.cmdHTML=b=>{
  const s=PLAY.side, cl=window.campLink;
  const after=!cl&&b.done?`<div class="toolbar"><button class="btn primary" data-pact="again">再战一局</button><button class="btn" data-pact="back">${PLAY.fromEdit?"← 战斗编辑":"← 换战例"}</button></div>`:"";
  if(!s) return cl?"":`<section class="card"><h2>观战 <span class="lbl">双方由战术 AI 指挥</span></h2><div class="body"><div class="note">空格下一回合，P 自动推演。</div>${after}</div></section>`;
  const sd=b[s], ai=b.tacticAIs&&b.tacticAIs[s]; let body="";
  if(b.done) body=`<div class="note">战斗已结束：${sd.missionDone==="success"?"目标达成":b.winner&&b.winner.name===s?"我军获胜":b.winner?"我军失利":"两军相持"}。</div>${after}`;
  else if(b.rnd===0){
    const fm=spec[s].formation||"FANG", gp=spec[s].genPos||"front";
    body=`<div><div class="lbl">阵型（开战前）</div><div class="form-chips">${FORM_IDS.map(id=>`<button type="button" data-pf="${id}" aria-pressed="${fm===id}" title="${FORM[id].desc}">${FORM[id].name}</button>`).join("")}<button type="button" data-pf="auto" aria-pressed="${fm==="auto"}">副将自择</button></div></div>
      <div><div class="lbl">主将位置</div><div class="seg">${segBtns("pg",[["front","前阵督战"],["rear","后阵坐镇"],["auto","副将自择"]],gp)}</div></div>
      <div class="note">${b.mode==="遭遇"?"遭遇战各部在行军中，不能预先布阵。":"点己方兵牌选中，再点空位、两翼或后阵即可移动。"}开战后在此下达战术。</div>`;
  } else if(ai){
    const rk=ai.ranking||[];
    body=`<div class="tac"><span class="nm">${ai.cur?ai.cur.code+" "+ai.cur.name:"—"}</span><span class="ph">${ai.forced?"你的军令":"副将自择"} · 阶段：${ai.phaseName}</span><span class="od">${ordersText(ai.orders||{})}</span></div>
      <div class="cmd-list" role="listbox" aria-label="下达战术">
        <button type="button" class="pick ${ai.forced?"":"on"}" data-pt=""><span class="cd">AI</span><span class="nm">交由副将自择</span><span class="note">${ai.persona}</span></button>
        ${rk.map(r=>{ const T=TACTIC_BY_ID[r.id]; return `<button type="button" class="pick ${ai.forced===r.id?"on":""}" data-pt="${r.id}" ${r.ok||ai.forced===r.id?"":`aria-disabled="true"`} title="${esc(r.why||T.cat)}"><span class="cd">${T.code}</span><span class="nm">${T.name} <span class="note">${T.cat}</span></span>${r.ok?`<span class="mono">${r.score.toFixed(2)}</span>`:`<span class="note">${esc(r.why||"不适用")}</span>`}</button>`; }).join("")}
      </div><div class="note">分数为副将估计的适用度；灰色为眼下不可行。</div>`;
  }
  return `<section class="card side-card ${s.toLowerCase()}"><h2><span><span class="chip">${s}</span> 军令</span><span class="lbl">你指挥${SIDE_NAME[s]}</span></h2><div class="body">${body}</div></section>`;
};
$("#brief").addEventListener("click",e=>{
  const s=PLAY.side; const t=e.target.closest("[data-pt],[data-pf],[data-pg],[data-pact]"); if(!t) return;
  if(t.dataset.pact==="again"){ resetBattle(); return; }
  if(t.dataset.pact==="back"){ $("#b-back").click(); return; }
  if(!s||!battle) return;
  if(t.dataset.pf!=null){ if(battle.rnd===0) applyForm(s,t.dataset.pf); return; }
  if(t.dataset.pg!=null){ if(battle.rnd===0){ spec[s].genPos=t.dataset.pg; custom(); resetBattle(); } return; }
  if(t.dataset.pt!=null&&t.getAttribute("aria-disabled")!=="true"){ const ai=battle.tacticAIs&&battle.tacticAIs[s]; if(!ai) return;
    const id=t.dataset.pt||null; ai.forced=id; if(!id){ ai.lastEval=-99; ai.note(battle.rnd,"军令：交由副将自择战术","pick"); }
    else ai.note(battle.rnd,`军令：改用「${TACTIC_BY_ID[id].name}」`,"pick");
    render(); }
});

/* ---------- 打开页面：游玩 · 战役开局 ---------- */
setMode("play"); showView("v-camp");
