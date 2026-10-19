/* ================= 界面 ================= */
const $=s=>document.querySelector(s);
const pct=x=>(x*100).toFixed(x<0.1&&x>0?1:0)+"%";
const R=(o)=>({"刀盾兵":0,"长枪兵":0,"弓兵":0,"强弩兵":0,"轻骑":0,"重骑":0,"器械":0,...o});
const PRESETS=[
  {name:"遭遇战 · 骑兵先至",terrain:"平原",mode:"遭遇",days:2,A:{cmd:70,roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":4,"轻骑":4})},B:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})}},
  {name:"遭遇战 · 名将急行 对 庸将",terrain:"平原",mode:"遭遇",days:2,A:{cmd:90,roster:R({"刀盾兵":8,"长枪兵":3,"弓兵":3,"重骑":2})},B:{cmd:55,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"轻骑":2})}},
  {name:"遭遇战 · 双方纯步",terrain:"丘陵",mode:"遭遇",days:2,A:{cmd:70,roster:R({"刀盾兵":8,"长枪兵":3,"弓兵":3})},B:{cmd:70,roster:R({"刀盾兵":8,"长枪兵":3,"弓兵":3})}},
  {name:"三日鏖战 · 势均力敌",terrain:"平原",mode:"决战",days:3,A:{cmd:75,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"轻骑":2})},B:{cmd:75,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"轻骑":2})}},
  {name:"同兵同帅 · 攻守相持",terrain:"平原",mode:"攻守",hold:0,A:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})},B:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})}},
  {name:"名将以少胜多 · 1.2万 对 1.8万 决战",terrain:"平原",mode:"决战",hold:0,A:{cmd:95,roster:R({"刀盾兵":6,"长枪兵":3,"弓兵":3})},B:{cmd:60,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})}},
  {name:"名将据守 · 1.8万 攻 1.2万",terrain:"平原",mode:"攻守",hold:0,A:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})},B:{cmd:95,roster:R({"刀盾兵":6,"长枪兵":3,"弓兵":3})}},
  {name:"庸将大军 · 2.4万 对 1.8万",terrain:"平原",mode:"决战",hold:0,A:{cmd:50,roster:R({"刀盾兵":13,"长枪兵":6,"弓兵":5})},B:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})}},
  {name:"两翼轻骑袭扰 纯步兵",terrain:"平原",mode:"决战",hold:0,A:{cmd:70,roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":4,"轻骑":4})},B:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})}},
  {name:"轻骑翼 对 重骑翼",terrain:"平原",mode:"决战",hold:0,A:{cmd:70,roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":4,"轻骑":2})},B:{cmd:70,roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":4,"重骑":2})}},
  {name:"重骑正面冲 长枪阵",terrain:"平原",mode:"攻守",hold:0,A:{cmd:70,cavFront:true,roster:R({"重骑":4,"刀盾兵":4,"弓兵":4})},B:{cmd:70,roster:R({"长枪兵":12,"弓兵":4})}},
  {name:"弓阵攻 弩阵守",terrain:"平原",mode:"攻守",hold:2,A:{cmd:70,roster:R({"刀盾兵":10,"弓兵":6})},B:{cmd:70,roster:R({"刀盾兵":10,"强弩兵":6})}},
  {name:"隘口 · 5000 守 1.8万",terrain:"隘口",mode:"攻守",hold:0,A:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})},B:{cmd:70,roster:R({"长枪兵":4,"弓兵":1})}},
  {name:"纯骑兵 对 步兵方阵",terrain:"平原",mode:"决战",hold:0,A:{cmd:70,roster:R({"轻骑":10,"重骑":6})},B:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4})}},
];
const SIDE_NAME={A:"甲军",B:"乙军"}; window.campLink=null;
for(const p of PRESETS){ if(!p.days) p.days=2; if(p.mode==="决战") p.days=Math.max(p.days,4); }
const presetStart=p=>p.startPh??(p.night?5:1);   // 旧战例的"夜战"即前半夜开战
PRESETS.splice(0,0,
  {name:"阵地战 · 进取之将强攻营垒",terrain:"平原",mode:"阵地",days:6,A:{cmd:75,roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":4,"轻骑":2}),ai:{on:true,persona:"进取",forced:""}},B:{cmd:70,fort:2,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4}),ai:{on:true,persona:"均衡",forced:""}}},
  {name:"阵地战 · 1.8万 攻 1.2万营垒",terrain:"平原",mode:"阵地",days:6,A:{cmd:75,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4}),ai:{on:true,persona:"进取",forced:""}},B:{cmd:70,fort:2,roster:R({"刀盾兵":6,"长枪兵":3,"弓兵":3}),ai:{on:true,persona:"均衡",forced:""}}},
  {name:"围城战 · 2万 围 8千 · 存粮6日",terrain:"平原",mode:"围城",days:10,A:{cmd:75,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"强弩兵":2}),ai:{on:true,persona:"均衡",forced:""}},B:{cmd:70,wall:1,food:6,roster:R({"长枪兵":3,"刀盾兵":2,"弓兵":2,"强弩兵":1}),ai:{on:true,persona:"均衡",forced:""}}},
  {name:"攻坚 · 弓弩火箭 对 营垒3",terrain:"平原",mode:"阵地",days:6,A:{cmd:75,roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":6,"强弩兵":2}),ai:{on:true,persona:"均衡",forced:""}},B:{cmd:70,fort:3,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4}),ai:{on:true,persona:"均衡",forced:""}}},
  {name:"围城 · 4具器械 对 抢修守军",terrain:"平原",mode:"围城",days:6,A:{cmd:75,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"强弩兵":2,"器械":4}),ai:{on:true,persona:"均衡",forced:"BOMBARD"}},B:{cmd:70,wall:1,food:20,roster:R({"长枪兵":3,"刀盾兵":2,"弓兵":2,"强弩兵":1}),ai:{on:true,persona:"均衡",forced:""}}},
  {name:"围城 · 蚁附强登 残城",terrain:"平原",mode:"围城",days:3,A:{cmd:75,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"强弩兵":2}),ai:{on:true,persona:"进取",forced:"ESCALADE"}},B:{cmd:70,wall:0.45,food:20,roster:R({"长枪兵":3,"刀盾兵":2,"弓兵":2,"强弩兵":1}),ai:{on:true,persona:"均衡",forced:""}}},
  {name:"乌巢 · 曹操夜袭淳于琼（焚粮）",terrain:"平原",mode:"攻守",days:1,night:true,weather:"大风",A:{cmd:95,int:95,mission:{type:"destroy",retreatAt:0.5,holdRounds:0},roster:R({"轻骑":3,"重骑":1,"刀盾兵":1}),ai:{on:true,persona:"诡诈",forced:""}},B:{cmd:55,int:35,fort:1,mission:{type:"hold",retreatAt:0,holdRounds:0},roster:R({"刀盾兵":4,"长枪兵":2,"弓兵":2,"辎重":4}),ai:{on:true,persona:"进取",forced:""}}},
  {name:"截粮 · 轻骑劫运粮队（遭遇）",terrain:"丘陵",mode:"遭遇",days:1,A:{cmd:80,int:65,mission:{type:"destroy",retreatAt:0.45,holdRounds:0},roster:R({"轻骑":2,"刀盾兵":1}),ai:{on:true,persona:"诡诈",forced:""}},B:{cmd:60,int:45,mission:{type:"escort",retreatAt:0.4,holdRounds:0},roster:R({"刀盾兵":1,"轻骑":1,"辎重":3}),ai:{on:true,persona:"均衡",forced:""}}},
  {name:"阻击 · 坚守二十回合后撤",terrain:"丘陵",mode:"攻守",days:2,A:{cmd:75,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"轻骑":2}),ai:{on:true,persona:"进取",forced:""}},B:{cmd:70,mission:{type:"delay",retreatAt:0.4,holdRounds:20},roster:R({"刀盾兵":4,"长枪兵":2,"弓兵":2}),ai:{on:true,persona:"谨慎",forced:""}}},
  {name:"阵型 · 鹤翼 对 锋矢",terrain:"平原",mode:"决战",days:2,A:{cmd:80,formation:"HEYI",roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":4,"轻骑":2,"重骑":2}),ai:{on:true,persona:"均衡",forced:""}},B:{cmd:80,formation:"FENGSHI",roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":4,"重骑":2,"轻骑":2}),ai:{on:true,persona:"进取",forced:""}}},
  {name:"阵型 · 双方AI自择阵型",terrain:"平原",mode:"决战",days:3,A:{cmd:80,formation:"auto",roster:R({"刀盾兵":6,"长枪兵":3,"弓兵":3,"轻骑":4,"重骑":2}),ai:{on:true,persona:"诡诈",forced:""}},B:{cmd:75,formation:"auto",roster:R({"刀盾兵":10,"长枪兵":5,"弓兵":3,"强弩兵":2}),ai:{on:true,persona:"谨慎",forced:""}}},
  {name:"白马之战 · 延津：曹操弃辎重诱文丑",terrain:"丘陵",mode:"攻守",days:2,hold:0,A:{cmd:65,int:35,resolve:60,roster:R({"轻骑":3,"重骑":3,"刀盾兵":4,"长枪兵":2,"弓兵":2}),ai:{on:true,persona:"进取",forced:""}},B:{cmd:95,int:95,resolve:70,roster:R({"轻骑":1,"重骑":1,"刀盾兵":2,"弓兵":1}),ai:{on:true,persona:"诡诈",forced:""}}},
  {name:"白马之战 · 解围：关羽突阵斩颜良",terrain:"平原",mode:"遭遇",days:1,A:{cmd:90,int:85,roster:R({"轻骑":2,"重骑":2,"刀盾兵":4,"弓兵":2}),ai:{on:true,persona:"进取",forced:""}},B:{cmd:60,int:35,roster:R({"刀盾兵":6,"长枪兵":3,"弓兵":3}),ai:{on:true,persona:"进取",forced:""}}},
  {name:"官渡 · 两营相持（单场：无劫粮，粮尽决胜）",terrain:"平原",mode:"阵地",days:60,A:{cmd:80,int:55,resolve:85,fort:2,food:60,roster:R({"刀盾兵":9,"长枪兵":4,"弓兵":4,"强弩兵":3,"轻骑":2,"重骑":2,"器械":2}),ai:{on:true,persona:"谨慎",forced:""}},B:{cmd:95,int:95,resolve:90,fort:3,food:30,roster:R({"刀盾兵":5,"长枪兵":3,"弓兵":2,"强弩兵":2,"轻骑":1,"重骑":1,"器械":2}),ai:{on:true,persona:"诡诈",forced:""}}},
  {name:"围城 · 智将佯退诱敌 对 鲁莽守将",terrain:"平原",mode:"围城",days:8,A:{cmd:75,int:90,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"强弩兵":2,"轻骑":2,"器械":2}),ai:{on:true,persona:"诡诈",forced:""}},B:{cmd:70,int:30,wall:1,food:20,roster:R({"长枪兵":4,"刀盾兵":4,"弓兵":3,"强弩兵":1}),ai:{on:true,persona:"进取",forced:""}}},
  {name:"围城 · 骂阵激将 对 智将",terrain:"平原",mode:"围城",days:4,A:{cmd:75,int:60,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"强弩兵":2,"轻骑":2}),ai:{on:true,persona:"进取",forced:"TAUNT"}},B:{cmd:70,int:90,wall:1,food:20,roster:R({"长枪兵":4,"刀盾兵":4,"弓兵":3,"强弩兵":1}),ai:{on:true,persona:"谨慎",forced:""}}},
  {name:"阵地 · 器械轰垒 · 敌轻骑袭后",terrain:"平原",mode:"阵地",days:6,A:{cmd:75,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"器械":3}),ai:{on:true,persona:"均衡",forced:""}},B:{cmd:70,fort:2,roster:R({"刀盾兵":8,"长枪兵":3,"弓兵":3,"轻骑":4}),ai:{on:true,persona:"均衡",forced:""}}},
  {name:"决战 · 前阵督战 对 后阵坐镇",terrain:"平原",mode:"决战",days:4,A:{cmd:75,genPos:"front",roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"轻骑":2}),ai:{on:true,persona:"进取",forced:""}},B:{cmd:75,genPos:"rear",roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4,"轻骑":2}),ai:{on:true,persona:"谨慎",forced:""}}},
  {name:"决战转阵地 · 两员谨慎之将",terrain:"平原",mode:"决战",days:6,A:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4}),ai:{on:true,persona:"谨慎",forced:""}},B:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4}),ai:{on:true,persona:"谨慎",forced:""}}});
PRESETS.splice(6,0,
  {name:"战术AI · 诡诈名将 对 进取之将",terrain:"平原",mode:"决战",days:2,A:{cmd:90,roster:R({"刀盾兵":8,"长枪兵":4,"弓兵":4,"轻骑":4}),ai:{on:true,persona:"诡诈",forced:""}},B:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4}),ai:{on:true,persona:"进取",forced:""}}},
  {name:"战术AI · 弱旅谨慎避战",terrain:"平原",mode:"决战",days:1,A:{cmd:70,roster:R({"刀盾兵":10,"长枪兵":4,"弓兵":4}),ai:{on:true,persona:"进取",forced:""}},B:{cmd:70,roster:R({"刀盾兵":5,"长枪兵":2,"弓兵":3}),ai:{on:true,persona:"谨慎",forced:""}}});
for(const p of PRESETS) for(const k of ["A","B"]) if(!p[k].ai) p[k].ai={on:true,persona:"均衡",forced:""};
let spec=JSON.parse(JSON.stringify(PRESETS[2]));
let battle=null, timer=null, logRows=[], selected=null;

/* ---------- 滑杆已拖过的一段着色：把比例写入 --fill（样式见 styles.css「原生控件统一主题」） ---------- */
const fillRange=r=>r.style.setProperty("--fill",((r.value-r.min)/((r.max-r.min)||1)*100)+"%");
let fillPending=false; const fillAll=()=>{ if(fillPending) return; fillPending=true; requestAnimationFrame(()=>{ fillPending=false; document.querySelectorAll('input[type="range"]').forEach(fillRange); }); };
document.addEventListener("input",e=>{ if(e.target.type==="range") fillRange(e.target); });
new MutationObserver(fillAll).observe(document.body,{childList:true,subtree:true}); addEventListener("load",fillAll); document.addEventListener("click",fillAll); document.addEventListener("change",fillAll);

/* ---------- 存取 ---------- */
function loadSaved(){ try{ const s=JSON.parse(localStorage.getItem("hm-rules-v14")||"null"); if(s){ Object.assign(P,s.P||{}); for(const k in (s.UT||{})) if(UT[k]) Object.assign(UT[k],s.UT[k]); for(const k in (s.T||{})) if(TERRAIN[k]) Object.assign(TERRAIN[k],s.T[k]); for(const k in (s.F||{})) if(FORM[k]) Object.assign(FORM[k],s.F[k]); for(const k in (s.S||{})) if(STATUS[k]) Object.assign(STATUS[k],s.S[k]); } }catch(e){} }
function saveRules(){ try{ localStorage.setItem("hm-rules-v14",JSON.stringify({P,UT,T:TERRAIN,F:FORM,S:STATUS})); }catch(e){} }
loadSaved();

/* ---------- 军令卡 ---------- */
function buildSetup(){
  $("#preset").innerHTML=PRESETS.map((p,i)=>`<option value="${i}">${p.name}</option>`).join("")+`<option value="-1">（自定义）</option>`;
  $("#preset").value="2";
  $("#preset").onchange=e=>{const i=+e.target.value; if(i>=0){spec=JSON.parse(JSON.stringify(PRESETS[i])); syncSetup(); resetBattle();}};
  $("#terrain").innerHTML=Object.keys(TERRAIN).map(t=>`<button type="button" data-v="${t}">${t}</button>`).join("");
  $("#terrain").onclick=e=>{const v=e.target.dataset.v; if(v){spec.terrain=v; custom(); syncSetup(); resetBattle();}};
  $("#mode").innerHTML=["攻守","决战","遭遇","阵地","围城"].map(t=>`<button type="button" data-v="${t}">${t}</button>`).join("");
  $("#mode").onclick=e=>{const v=e.target.dataset.v; if(v){spec.mode=v; applyModeDefaults(); custom(); syncSetup(); resetBattle();}};
  $("#mode-extra").addEventListener("input",e=>{ const k=e.target.dataset.k; if(!k) return; const [side,f]=k.split("."); spec[side][f]=+e.target.value; if(f==="food"&&!spec[side][f]&&!(spec.mode==="围城"&&side==="B")) delete spec[side][f]; custom(); syncSetup(); resetBattle(); });
  $("#days").oninput=e=>{spec.days=+e.target.value; $("#days-o").textContent=spec.days+"日"; custom(); resetBattle();};
  $("#weather").onchange=e=>{ spec.weather=e.target.value; custom(); resetBattle(); };
  $("#startph").innerHTML=PERIODS.map((p,i)=>`<option value="${i}">${p.n}（${p.t}）${p.night?" · 夜战":""}</option>`).join("");
  $("#startph").onchange=e=>{ spec.startPh=+e.target.value; custom(); resetBattle(); };
  $("#night").onchange=e=>{ spec.night=e.target.checked; custom(); resetBattle(); };
  $("#hold").oninput=e=>{spec.hold=+e.target.value; $("#hold-o").textContent=spec.hold; custom(); resetBattle();};
  for(const s of ["A","B"]){
    const el=$("#side-"+s);
    el.innerHTML=`<h2><span><span class="chip">${s}</span> ${SIDE_NAME[s]}</span><span class="lbl" id="role-${s}"></span></h2>
      <div class="body">
        <div class="slider-row"><span class="lbl">主将统帅</span><input type="range" min="20" max="100" step="5" id="cmd-${s}"><output id="cmdo-${s}"></output></div>
        <div class="slider-row" title="智略：用计（佯退、激将、诈败、佯攻）的成功率与识破敌计的能力；也影响判断敌情的准确与看破敌战术的快慢"><span class="lbl">主将智略</span><input type="range" min="20" max="100" step="5" id="int-${s}"><output id="into-${s}"></output></div>
        <div class="slider-row" title="战役决心：越高越不肯撤军，适合长期相持（官渡）；越低越容易见势不妙即退"><span class="lbl">战役决心</span><input type="range" min="0" max="100" step="5" id="rs-${s}"><output id="rso-${s}"></output></div>
        <div class="roster">${UNIT_ORDER.map(n=>`
          <span class="nm"><span class="mini ${UT[n].width>1?"w2":""}">${GLYPH[n]}</span>${n}</span>
          <span class="meta" id="meta-${s}-${n}"></span>
          <span class="step"><button type="button" data-d="-1" data-u="${n}" aria-label="减少${n}">−</button><input id="cnt-${s}-${n}" inputmode="numeric" aria-label="${n}部数"><button type="button" data-d="1" data-u="${n}" aria-label="增加${n}">+</button></span>`).join("")}
        </div>
        <div class="st-head"><span class="lbl">合计</span><span class="mono" id="tot-${s}"></span></div>
        <label class="chk"><input type="checkbox" id="cf-${s}"> 骑兵列于前阵正面（不上两翼）</label>
        <div class="form-row"><span class="lbl">阵型</span><select id="fm-${s}" aria-label="阵型"><option value="auto">战术AI自择</option>${FORM_IDS.map(id=>`<option value="${id}">${FORM[id].key}. ${FORM[id].name}阵</option>`).join("")}</select></div>
        <div class="form-chips" id="fc-${s}" aria-label="一键布阵">${FORM_IDS.map(id=>`<button type="button" data-f="${id}" title="${FORM[id].name}阵：${FORM[id].desc}（快捷键 ${s==="A"?"":"Shift+"}${FORM[id].key}）">${FORM[id].name}</button>`).join("")}<button type="button" data-f="auto" title="交给战术AI选阵布阵">AI</button></div>
        <div class="form-note" id="fn-${s}"></div>
        <div class="ai-row">
          <span class="lbl">战术AI</span><select id="ai-${s}" aria-label="战术AI"><option value="1">开：自动判断形势与战术</option><option value="0">关：按基础战斗规则</option></select>
          <span class="lbl">主将位置</span><select id="gp-${s}" aria-label="主将位置"><option value="front">前阵督战（振前阵，易遭集火）</option><option value="rear">后阵坐镇（安全，前阵少督战）</option><option value="auto">战术AI自择</option></select>
          <span class="lbl">主将性格</span><select id="ps-${s}" aria-label="主将性格">${Object.entries(T_PERSONA).map(([k,v])=>`<option value="${k}">${k}（${v.desc}）</option>`).join("")}</select>
          <span class="lbl">战斗目标</span><select id="ms-${s}" aria-label="战斗目标"><option value="rout">击溃敌军</option><option value="destroy">焚粮（毁敌辎重即撤）</option><option value="hold">坚守</option><option value="delay">阻滞（坚守 N 回合后撤）</option><option value="escort">护粮（护卫辎重）</option></select>
          <span class="lbl">撤退阈值</span><span class="slider-row" style="margin:0"><input type="range" min="0" max="90" step="5" id="ra-${s}" aria-label="撤退阈值"><output id="rao-${s}"></output></span>
          <span class="lbl">坚守回合</span><span class="slider-row" style="margin:0"><input type="range" min="0" max="45" step="5" id="hr-${s}" aria-label="坚守回合"><output id="hro-${s}"></output></span>
          <span class="lbl">指定战术</span><select id="fo-${s}" aria-label="指定战术"><option value="">由AI自选</option>${TACTICS.map(t=>`<option value="${t.id}">${t.code} ${t.name}</option>`).join("")}</select>
        </div>
      </div>`;
    el.querySelector(".roster").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; const n=b.dataset.u; delete spec[s].layout; spec[s].roster[n]=Math.max(0,Math.min(30,(spec[s].roster[n]||0)+(+b.dataset.d))); custom(); syncSetup(); resetBattle();});
    el.querySelector(".roster").addEventListener("change",e=>{const m=e.target.id.match(/^cnt-.-(.+)$/); if(!m) return; spec[s].roster[m[1]]=Math.max(0,Math.min(30,parseInt(e.target.value)||0)); delete spec[s].layout; custom(); syncSetup(); resetBattle();});
    $("#cmd-"+s).oninput=e=>{spec[s].cmd=+e.target.value; $("#cmdo-"+s).textContent=spec[s].cmd; custom(); resetBattle();};
    $("#rs-"+s).oninput=e=>{spec[s].resolve=+e.target.value; $("#rso-"+s).textContent=spec[s].resolve; custom(); resetBattle();};
    $("#int-"+s).oninput=e=>{spec[s].int=+e.target.value; $("#into-"+s).textContent=spec[s].int; custom(); resetBattle();};
    $("#cf-"+s).onchange=e=>{spec[s].cavFront=e.target.checked; delete spec[s].layout; custom(); resetBattle();};
    $("#fm-"+s).onchange=e=>{ applyForm(s,e.target.value); };
    $("#fc-"+s).onclick=e=>{ const b=e.target.closest("button[data-f]"); if(b) applyForm(s,b.dataset.f); };
    $("#ai-"+s).onchange=e=>{spec[s].ai.on=e.target.value==="1"; syncSetup(); resetBattle();};
    $("#ps-"+s).onchange=e=>{spec[s].ai.persona=e.target.value; resetBattle();};
    $("#gp-"+s).onchange=e=>{spec[s].genPos=e.target.value; custom(); resetBattle();};
    const mi=()=>{ spec[s].mission=spec[s].mission||{type:"rout",retreatAt:0,holdRounds:0}; return spec[s].mission; };
    $("#ms-"+s).onchange=e=>{ mi().type=e.target.value; custom(); syncSetup(); resetBattle(); };
    $("#ra-"+s).oninput=e=>{ mi().retreatAt=+e.target.value/100; $("#rao-"+s).textContent=e.target.value>0?e.target.value+"%":"不退"; custom(); resetBattle(); };
    $("#hr-"+s).oninput=e=>{ mi().holdRounds=+e.target.value; $("#hro-"+s).textContent=e.target.value>0?e.target.value:"—"; custom(); resetBattle(); };
    $("#fo-"+s).onchange=e=>{spec[s].ai.forced=e.target.value; resetBattle();};
  }
}
function custom(){ $("#preset").value="-1"; }
/* 一键布阵：选定阵型并按其规则自动排兵（清除手动布阵） */
function applyForm(s,id){ spec[s].formation=id; delete spec[s].layout; custom(); syncSetup(); resetBattle(); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-clr]"); if(!b) return; delete spec[b.dataset.clr].layout; syncSetup(); resetBattle(); });
function applyModeDefaults(){
  for(const k of ["A","B"]) for(const f of ["fort","wall","food","engines"]) delete spec[k][f];
  if(spec.mode==="阵地"){ spec.B.fort=2; spec.days=Math.max(spec.days||1,6); }
  else if(spec.mode==="围城"){ spec.B.wall=1; spec.B.food=6; spec.days=Math.max(spec.days||1,10); }
  else if(spec.mode==="决战"){ spec.days=Math.max(spec.days||1,4); }
}
function syncSetup(){
  for(const b of $("#terrain").children) b.setAttribute("aria-pressed",b.dataset.v===spec.terrain);
  for(const b of $("#mode").children) b.setAttribute("aria-pressed",b.dataset.v===spec.mode);
  $("#mode-note").textContent={"攻守":"甲军进攻，乙军守阵：守方以阵坚抵挡并享地形加成。",
    "决战":"两军同时压上：都按进攻方结算，无守方与地形加成。日暮收兵，夜间回复与收拢溃部，次日黎明再战；战力不足对方一半者乘夜遁走。",
    "遭遇":"两军在行军中相遇：各部按速度和统帅陆续展开。骑兵先到，可突袭尚未展开的行军队列，对方抵挡极低、组织度损失×"+P.ENC_ORG+"。全部展开后转为决战。",
    "阵地":"乙军据营垒而守：工事提高阵坚、削弱白刃与冲击、护住两翼。双方每夜议定次日方略——再战、休整救治伤兵、加筑营垒或撤退；久攻不下者应及时退兵。",
    "围城":"乙军守城：城墙完好时攻方只能在少数城段展开，蚁附登城代价高昂。攻方可夜造器械、白日轰城；守方可修城、出城焚毁器械。城中存粮按日消耗，粮尽军心瓦解。"}[spec.mode];
  const ex=[]; const sl=(k,lbl,min,max,step,val,fmt)=>`<div class="slider-row"><span class="lbl">${lbl}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${lbl}"><output>${fmt(val)}</output></div>`;
  const fd=v=>v?v+"日":"不计";
  if(spec.mode==="阵地"){ ex.push(sl("B.fort","乙军营垒",0,3,0.5,spec.B.fort??2,v=>v+"级")); ex.push(sl("A.fort","甲军营垒",0,3,0.5,spec.A.fort??0,v=>v+"级")); ex.push(sl("A.food","甲军军粮",0,90,1,spec.A.food??0,fd)); ex.push(sl("B.food","乙军军粮",0,90,1,spec.B.food??0,fd)); }
  if(spec.mode==="围城"){ ex.push(sl("B.wall","城墙完整",0.4,1,0.05,spec.B.wall??1,v=>Math.round(v*100)+"%")); ex.push(sl("B.food","城中存粮",1,60,1,spec.B.food??6,v=>v+"日")); ex.push(sl("A.food","攻方军粮",0,90,1,spec.A.food??0,fd)); }
  if($("#mode-extra").dataset.mode!==spec.mode||!ex.length){ $("#mode-extra").innerHTML=ex.join(""); $("#mode-extra").dataset.mode=spec.mode; }
  else for(const i of $("#mode-extra").querySelectorAll("input")){ i.nextElementSibling.textContent=i.closest(".slider-row").querySelector("output").textContent; }
  for(const i of $("#mode-extra").querySelectorAll("input")){ const [side,f]=i.dataset.k.split("."); const v=spec[side][f]; i.nextElementSibling.textContent= f==="wall"?Math.round(v*100)+"%":f==="fort"?(v||0)+"级":f==="food"?(v?v+"日":"不计"):v+"具"; }
  $("#days").value=spec.days||1; $("#days-o").textContent=(spec.days||1)+"日";
  $("#weather").value=spec.weather||"晴"; $("#night").checked=!!spec.night; $("#startph").value=presetStart(spec);
  for(const s of ["A","B"]){ const m=spec[s].mission||{type:"rout",retreatAt:0,holdRounds:0}; $("#ms-"+s).value=m.type; $("#ra-"+s).value=Math.round((m.retreatAt||0)*100); $("#rao-"+s).textContent=m.retreatAt>0?Math.round(m.retreatAt*100)+"%":"不退"; $("#hr-"+s).value=m.holdRounds||0; $("#hro-"+s).textContent=m.holdRounds||"—"; }
  $("#hold").value=spec.hold||0; $("#hold-o").textContent=spec.hold||0; $("#hold-row").hidden= spec.mode!=="攻守";
  for(const s of ["A","B"]){
    $("#cmd-"+s).value=spec[s].cmd; $("#cmdo-"+s).textContent=spec[s].cmd;
    if(spec[s].resolve==null) spec[s].resolve=50; $("#rs-"+s).value=spec[s].resolve; $("#rso-"+s).textContent=spec[s].resolve;
    if(spec[s].int==null) spec[s].int=60; $("#int-"+s).value=spec[s].int; $("#into-"+s).textContent=spec[s].int;
    $("#cf-"+s).checked=!!spec[s].cavFront;
    if(!spec[s].ai) spec[s].ai={on:true,persona:"均衡",forced:""};
    $("#gp-"+s).value=spec[s].genPos||"front";
    const fmv=spec[s].formation||"FANG"; $("#fm-"+s).value=fmv; for(const b of $("#fc-"+s).children) b.setAttribute("aria-pressed",b.dataset.f===fmv);
    $("#fn-"+s).innerHTML=(fmv==="auto"?"战术AI按形势选阵、布阵，夜间可改阵。":`${FORM[fmv].desc}。`)+(spec[s].layout?` <b>手动布阵</b> <button type="button" class="linkbtn" data-clr="${s}">恢复按阵型自动</button>`:"");
    $("#ai-"+s).value=spec[s].ai.on?"1":"0"; $("#ps-"+s).value=spec[s].ai.persona; $("#fo-"+s).value=spec[s].ai.forced||"";
    $("#ps-"+s).disabled=$("#fo-"+s).disabled=!spec[s].ai.on;
    $("#role-"+s).textContent= ({攻守:["进攻","守阵"],阵地:["攻营","据营垒"],围城:["攻城","守城"]}[spec.mode]||[spec.mode,spec.mode])[s==="A"?0:1];
    let n=0, ne=0; for(const u of UNIT_ORDER){ const c=spec[s].roster[u]||0; if(UT[u].engine) ne+=c; else n+=c; $(`#cnt-${s}-${u}`).value=c; $(`#meta-${s}-${u}`).textContent=c?(UT[u].engine?`${c}具·${c*P.ENGINE_CREW}人`:`${c*1000/10000}万`):""; }
    const cap=spec[s].cmd/P.CMD_CAP_DIV;
    $("#tot-"+s).innerHTML=`${n} 部${ne?" ＋器械 "+ne+" 具":""} · ${((n*1000+ne*P.ENGINE_CREW)/10000).toFixed(1)}万 <span style="color:${n>cap?"var(--bad)":"var(--ink-2)"}">（统御上限 ${cap.toFixed(0)}）</span>`;
  }
}

/* ---------- 沙盘 ---------- */
function ctrHTML(u){
  const cls=["ctr",u.side.name.toLowerCase()];
  if(u.t.width>1) cls.push("w2");
  if(u.isEngine) cls.push("eng");
  if(u.orgp<P.SHAKEN) cls.push("shaken");
  if(u.stamina<40) cls.push("tired");
  if(u.lastOd>2.5) cls.push("hit");
  if(u.flank) cls.push("flank");
  if(u.pos==="rear") cls.push("rest");
  if(u.pos==="column") cls.push("march");
  if(u.raid) cls.push("raid");
  if(selected===u.id) cls.push("sel");
  const tip=`${SIDE_NAME[u.side.name]} ${u.name}${u.isEngine?"（持久 "+Math.round(u.hp)+"/"+P.ENGINE_HP+(u.destroyed?"，已毁":"")+"）":""}${u.isGeneral?(u.pos==="rear"?"（主将坐镇·中军亲卫）":"（主将督战）"):""}${u.pos==="column"?"（行军中，第"+u.deployAt+"回合展开）":""}｜兵员 ${Math.round(u.men)}｜组织度 ${Math.max(0,u.org).toFixed(1)}/${u.maxOrg}｜体力 ${Math.round(u.stamina)}`;
  return `<div class="${cls.join(" ")}" data-id="${u.id}" title="${tip}" role="button" tabindex="0" aria-label="${tip}">
    <div class="face">${u.isGeneral&&u.side.generalAlive?'<span class="gen">帅</span>':""}${u.pos==="column"?`<span class="eta">T${u.deployAt}</span>`:""}<span class="gl">${GLYPH[u.name]}</span><span class="men">${u.isEngine?"持"+Math.round(u.hp):Math.round(u.men)}</span></div>
    <div class="bars"><i class="o" style="--v:${Math.max(0,Math.min(1,u.orgp)).toFixed(3)}"></i><i class="${u.isEngine?"h":"s"}" style="--v:${(u.isEngine?u.hp/P.ENGINE_HP:u.stamina/100).toFixed(3)}"></i></div></div>`;
}
function renderSide(s){
  const k=s.name;
  const front=s.aliveFront(); const used=front.reduce((a,u)=>a+u.t.width,0);
  let html=front.map(ctrHTML).join("");
  for(let i=used;i<s.width;i++) html+=`<span class="ghost" data-zone="front" data-side="${k}"></span>`;
  const fb=$("#front"+k); fb.innerHTML=html;
  fb.dataset.l=`${SIDE_NAME[k]} 前阵 ${used}/${s.width}`+(s.stretch>1.001?`  疏阵×${s.stretch.toFixed(2)}`:"");
  const w=s.aliveWings(); const L=[],Rr=[]; w.forEach((u,i)=>((u.wingSide?u.wingSide==="R":i%2)?Rr:L).push(u));
  const wl=$("#wl"+k), wr=$("#wr"+k);
  wl.innerHTML=L.map(ctrHTML).join(""); wr.innerHTML=Rr.map(ctrHTML).join("");
  const showW=s.wingCap>0; wl.hidden=!showW; wr.hidden=!showW;
  const col=s.aliveColumn();
  $("#rear"+k).innerHTML=(s.rear.filter(u=>!u.routed).map(ctrHTML).join("")+col.map(ctrHTML).join(""))||'<span class="note">（无预备）</span>';
  const routed=s.units.filter(u=>u.routed);
  $("#rout"+k).innerHTML=routed.length?`<span>溃兵 ${routed.length} 部</span>`+routed.map(()=>'<span class="r"></span>').join(""):"";
}
function fitSlot(){
  const map=$("#map"), field=$("#field"); if(!map||!field||!battle) return;
  const root=document.documentElement; let cur=parseFloat(getComputedStyle(root).getPropertyValue("--slot"))||44;
  const tall=innerWidth>=1100&&innerHeight>=620;
  for(let i=0;i<2;i++){                       // 按沙盘实际排布尺寸缩放，使其恰好填满画面
    const fw=field.scrollWidth, fh=field.scrollHeight; if(!fw||!fh) return;
    const r=Math.min((map.clientWidth-4)/fw, tall?(map.clientHeight-4)/fh:9);
    const nx=Math.max(30,Math.min(96,Math.floor(cur*r*0.985)));
    if(Math.abs(nx-cur)<1) break; cur=nx; root.style.setProperty("--slot",cur+"px");
  }
}
addEventListener("resize",()=>{fitSlot();});
function setLeft(hide){ document.body.classList.toggle("noleft",hide); const b=$("#b-side"); b.textContent=hide?"军令 ⟩":"⟨ 军令"; b.setAttribute("aria-pressed",hide);
  try{localStorage.setItem("hm-noleft",hide?"1":"0");}catch(e){} requestAnimationFrame(()=>{fitSlot();}); }
$("#b-side").onclick=()=>setLeft(!document.body.classList.contains("noleft"));
try{ if(localStorage.getItem("hm-noleft")==="1") setLeft(true); }catch(e){}
function renderBrief(){ const el=$("#brief"); if(!el||!battle) return; const b=battle, cl=window.campLink;
  const MS={rout:"击溃敌军",destroy:"焚粮（毁敌辎重）",hold:"坚守",delay:"阻滞后撤",escort:"护粮"};
  const side=s=>{ const m=s.mission, en=b.other(s); let prog="";
    if(m.type==="destroy") prog=`<div class="mbar" title="已焚敌辎重"><i style="width:${Math.min(100,en.supplyBurnt()/m.goal*100)}%"></i></div><span class="note">已焚敌辎重 ${Math.round(en.supplyBurnt()*100)}% / 目标 ${Math.round(m.goal*100)}%</span>`;
    else if((m.type==="hold"||m.type==="delay")&&m.holdRounds) prog=`<span class="note">坚守 ${Math.min(b.rnd,m.holdRounds)} / ${m.holdRounds} 回合</span>`;
    return `<section class="card side-card ${s.name.toLowerCase()}"><h2><span><span class="chip">${s.name}</span> ${SIDE_NAME[s.name]}${window.PLAY&&PLAY.side===s.name?"（你）":""}</span><span class="lbl">${s.baseAttacker&&!b.bothAtk?"攻":"守"}</span></h2><div class="body">
      ${s.label?`<div class="note">${s.label}</div>`:""}
      <dl class="brief-row"><dt>统帅 / 智略</dt><dd>${s.cmd} / ${s.int}</dd><dt>目标</dt><dd><b>${MS[m.type]||m.type}</b></dd>
      <dt>撤退阈值</dt><dd>${m.retreatAt>0?"战力 < "+Math.round(m.retreatAt*100)+"%":"死战不退"}</dd>
      ${s.supply0?`<dt>辎重</dt><dd>${s.units.filter(u=>u.isSupply).length} 部 · 损 ${Math.round(s.supplyBurnt()*100)}%</dd>`:""}
      ${s.missionDone?`<dt>结果</dt><dd>${s.missionDone==="success"?"目标达成":"未达成"}</dd>`:""}</dl>${prog}</div></section>`; };
  el.innerHTML=`<section class="card"><h2>${cl?"战役战斗":"战例推演"} <span class="lbl">${cl?"第 "+cl.spec.campaign.day+" 日":""}</span></h2><div class="body">
    <dl class="brief-row"><dt>地点</dt><dd>${cl?cl.spec.campaign.nodeName:($("#preset").selectedOptions[0]||{}).textContent||"自定义"}</dd><dt>地形 / 模式</dt><dd>${spec.terrain} · ${b.mode}</dd>
    <dt>天气</dt><dd>${b.weather}</dd><dt>开战</dt><dd>${PERIODS[b.startPh].n}${b.dawnRaid?"·拂晓奇袭":PERIODS[b.startPh].night?"·夜战":""}</dd></dl>
    ${cl?`<div class="controls" style="padding:0"><button class="btn${b.done?" primary":""}" id="b-camp-ret">${b.done?"返回战役 · 结算":"速决余下并返回战役"}</button></div>`:`<button class="linkbtn" data-goto="v-setup">在编辑器中调整兵力、目标与天气 →</button>`}</div></section>`+(window.cmdHTML?cmdHTML(b):"")+side(b.A)+side(b.B); }
document.addEventListener("click",e=>{ const g=e.target.closest("[data-goto]"); if(g) showView(g.dataset.goto); });
function render(){
  if(!battle) return; renderBrief(); if(document.body.classList.contains("vw")) renderDebug();
  fitSlot();
  renderSide(battle.A); renderSide(battle.B); renderHint();
  $("#rnd").textContent=battle.dayRound+(battle.days>1?"":"");
  $("#day").textContent=`第${battle.day}日${battle.days>1?" / "+battle.days:""} · ${PERIODS[battle.ph].n}`;
  $("#bph").innerHTML=PERIODS.map((p,i)=>`<span class="${i===battle.ph?"on":""}${p.night?" night":""}" title="${p.n} ${p.t}">${p.n.slice(-2,-1)==="半"?p.n[0]+"夜":p.n}</span>`).join("");
  $("#stage").textContent=battle.stage; $("#stage").dataset.s=battle.stage;
  renderWorks(battle.B,"worksB"); renderWorks(battle.A,"worksA"); renderDaily();
  const dep=battle.mode==="遭遇"&&battle.deploying;
  const clb=battle.phase===2&&battle.climbing!=null&&battle.climbing<0.999;
  const pn=dep?"展开":clb?(battle.climbing>0.02?"城头接战":"蚁附登城"):["远距","接近","白刃"][battle.phase]; const pe=$("#phase"); pe.textContent=pn; pe.dataset.p=dep?"d":battle.phase;
  const gap=$("#gap"); gap.dataset.p=dep?"d":battle.phase; 
  gap.innerHTML=battle.events.filter(e=>!e.minor).map(e=>`<span class="ev ${e.s?e.s.toLowerCase():""} ${e.big?"big":""} ${e.night?"night":""}">${e.s?SIDE_NAME[e.s]+" ":""}${e.t}</span>`).join("")||`<span class="ev">${battle.rnd===0?(battle.mode==="遭遇"?"两军行军中相遇":"两军列阵"):pn}</span>`;
  const bn=$("#banner");
  if(battle.done){
    const r=battle.result(); const w=r.winner;
    bn.hidden=false; bn.className="banner "+(w==="A"?"a":w==="B"?"b":"");
    const loserN=w==="A"?"B":"A";
    const why=r.reason;
    bn.innerHTML=`<b>${why==="目标达成撤出"&&battle.retreatSide?SIDE_NAME[battle.retreatSide.name]+"目标达成 · 撤出战场":w==="相持"?(why==="期满对峙"?"期满 · 两军对峙":"日暮收兵 · 相持"):SIDE_NAME[w]+"胜 · "+why}</b><span class="mono">第 ${battle.day} 日 · 共 ${r.rounds} 回合</span>
      <span>${SIDE_NAME.A}损失 <b class="mono" style="font:600 14px var(--f-mono)">${pct(r.A.loss)}</b>（阵亡 ${pct(r.A.dead)}，逃散 ${pct(r.A.fled)}）</span>
      <span>${SIDE_NAME.B}损失 <b class="mono" style="font:600 14px var(--f-mono)">${pct(r.B.loss)}</b>（阵亡 ${pct(r.B.dead)}，逃散 ${pct(r.B.fled)}）</span>
      ${w==="相持"?"":(why==="开城投降"?`<span class="note">守军出降，城中兵员尽数计入逃散（俘降）</span>`:`<span class="note">追击损失系数 ${pct(battle.pursuit)}，逃散者战后可收拢</span>`)}`;
  } else bn.hidden=true;
  renderStatus(); renderLog();
  $("#b-step").disabled=$("#b-end").disabled=$("#b-play").disabled=battle.done;
}
function renderWorks(s,id){
  const el=$("#"+id); const cw=`calc(var(--slot)*${s.width} + var(--gapx)*${Math.max(0,s.width-1)} + 8px)`; let h="";
  const o=s.orders||{}; const tags=[o.screen?"盾网":null,o.repair?"抢修":null,o.fire?"火箭":null].filter(Boolean).map(t=>`<span class="engine wk">${t}</span>`).join("");
  if(s.wall){ const W=s.wall.W, F=s.wall.F||0; h+=`<div class="wallbar" style="width:${cw}" title="城墙持久 ${Math.round(W*100)}%（只受攻城器械损伤）${F>0?" · 敌登城进度 "+Math.round(F*100)+"%":""}"><i style="width:${W*100}%"></i>${F>0?`<b class="climb" style="width:${F*100}%"></b>`:""}<span>城墙 ${Math.round(W*100)}%${F>0.02?` · 敌登城 ${Math.round(F*100)}%`:""}${s.food!=null?` · 存粮 ${s.food} 日`:""}</span></div>`; }
  else if(s.fortMax>0.05){ const I=s.fortMax?s.fort/s.fortMax:0; h+=`<div class="palisade ${I<0.5?"hurt":""}" style="width:${cw};--dur:${Math.round(I*100)}%" title="营垒 ${s.fort.toFixed(2)} / ${s.fortMax.toFixed(1)} 级，持久 ${Math.round(I*100)}%"><span>${s.fort<=0.05?"营垒尽毁":s.fort>=2?"营垒 · 壕沟 · 鹿角":s.fort>=1?"营垒 · 鹿角":"初筑营垒"} ${s.fort.toFixed(1)}/${s.fortMax.toFixed(1)} · 持久 ${Math.round(I*100)}%${s.food!=null?" · 军粮 "+s.food+" 日":""}</span></div>`; }
  if(s.engines>0||s.engineHP>0){ const cap=Math.max(1,s.engines)*P.ENGINE_HP; h+=`<span class="engine" title="器械持久 ${Math.round(s.engineHP)} / ${cap}">攻城器械 ×${s.engines} · 持久 ${Math.round(s.engineHP/cap*100)}%</span>`; }
  h+=tags;
  if(el.innerHTML!==h) el.innerHTML=h;
}
const PLAN_SHORT={FIGHT:"再战",REST:"休整",FORTIFY:"筑垒",SIEGEWORK:"造械",SORTIE:"出击",WITHDRAW:"撤退",SURRENDER:"投降",RAID:"劫粮"};
function renderDaily(){
  const el=$("#daily"); if(!battle||el.hidden&&el.dataset.n==String(battle.daily.length)) return; el.dataset.n=battle.daily.length;
  if(!battle.daily.length){ el.innerHTML='<p class="note" style="padding:6px 10px">第一日结束后，这里逐日列出双方伤亡、伤兵、组织度、进攻回合、交换比、工事与夜议方略。</p>'; return; }
  const side=(r,k)=>`<td class="p${k.toLowerCase()}">${r[k].dead}</td><td>${r[k].wounded}</td><td>${Math.round(r[k].org*100)}%</td><td>${r[k].attack}</td><td>${r[k].exchange.toFixed(2)}</td><td>${r[k].wall!=null?"墙"+Math.round(r[k].wall*100)+"%":r[k].fortMax>0.05?"垒"+r[k].fort.toFixed(1)+"/"+r[k].fortMax.toFixed(1):(r[k].engines?"械"+r[k].engines+"·"+Math.round(r[k].engineHP):"—")}${r[k].food!=null?" 粮"+r[k].food:""}</td><td class="plan p${k.toLowerCase()}">${r.final?"终局":(PLAN_SHORT[r[k].plan]||"—")}${r[k].failDays>=2?" ·久攻不下":""}</td>`;
  el.innerHTML=`<table><thead><tr><th>日</th><th class="pa">甲亡</th><th>伤兵</th><th>组织</th><th>攻回合</th><th>交换比</th><th>工事</th><th>次日</th><th class="pb">乙亡</th><th>伤兵</th><th>组织</th><th>攻回合</th><th>交换比</th><th>工事</th><th>次日</th></tr></thead><tbody>${battle.daily.slice().reverse().map(r=>`<tr><td>第${r.day}日 <span class="note">${r.stage}</span></td>${side(r,"A")}${side(r,"B")}</tr>`).join("")}</tbody></table>`;
}
document.querySelector(".logtabs").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; const d=b.dataset.lt==="daily";
  for(const x of document.querySelectorAll(".logtabs button")) x.setAttribute("aria-pressed",x===b);
  $("#log").hidden=d; $("#daily").hidden=!d; $("#log-hint").textContent=d?"逐日汇总 · 最新在上":"最新在上"; $("#daily").dataset.n=""; renderDaily(); });
function renderLog(){
  const tb=$("#log tbody");
  tb.innerHTML=logRows.slice(-160).reverse().map(r=>`<tr class="${r.night?"night":""} ${r.tac?"tacrow":""}"><td>${r.r}</td><td>${r.h}</td></tr>`).join("");
}
function pushLog(){
  const b=battle;
  for(const k of ["A","B"]){ const ai=b.tacticAIs&&b.tacticAIs[k]; if(!ai) continue;
    for(const l of ai.log.slice(aiSeen[k])) logRows.push({tac:true,r:`${b.days>1||b.day>1?"D"+b.day+" ":""}${PERIODS[b.roundPh??b.ph].n}${b.roundIdx||0}·令`,h:`<span class="t${k}">${SIDE_NAME[k]}主将</span> ${l.text}`});
    aiSeen[k]=ai.log.length; } const parts=b.events.map(e=>{const who=e.s?`<span class="t${e.s}">${SIDE_NAME[e.s]}</span> `:""; return e.big?`<span class="hl">${who.replace(/<[^>]+>/g,"")}${e.t}</span>`:who+e.t;});
  const sum=s=>{const f=s.units.filter(u=>!u.routed); const o=f.length?f.reduce((a,u)=>a+Math.max(0,u.orgp),0)/f.length:0; return `<span class="t${s.name}">${SIDE_NAME[s.name]}</span> 组织 ${pct(o)}`;};
  const isNight=b.events.some(e=>e.night)||PERIODS[b.roundPh??b.ph].night;
  const dep=b.mode==="遭遇"&&(b.deploying||b.events.some(e=>e.t.startsWith("展开")));
  logRows.push({night:isNight, r:`${b.days>1||b.day>1?"D"+b.day+" ":""}${PERIODS[b.roundPh??b.ph].n}${b.roundIdx||0}·${dep?"展":(b.phase===2&&b.climbing!=null&&b.climbing<0.999)?(b.climbing>0.02?"城":"登"):["远","近","刃"][b.phase]}`, h:(parts.length?parts.join("；")+"　":"")+`<span class="note">${sum(b.A)} · ${sum(b.B)}</span>`});
  if(b.done){ const r=b.result(); logRows.push({r:"终", h:r.winner==="相持"?`第${b.day}日${PERIODS[b.ph].n}，${b.endReason&&b.endReason!=="期满对峙"?b.endReason:"两军各自收兵"}，相持不下。`:`<b>${SIDE_NAME[r.winner]}获胜</b>，${b.nightRetreat?"敌军夜遁，追击受夜色所限":"败军遭追击"}，损失系数 ${pct(b.pursuit)}。`}); }
}
const GOODF=new Set(["已登城头","城墙残破","我据工事","敌侧可乘","敌预备已尽","敌阵动摇","敌军追击脱节","敌军后撤","敌主将已退","敌将崩溃"]);
function fxStr(m,onEnemy){ return MOD_KEYS.filter(([k])=>Math.abs((m[k]??1)-1)>0.001).map(([k,l])=>{ const v=m[k]; let good=(k==="orgTaken"||k==="stam")?v<1:v>1; if(onEnemy) good=!good; return `<span class="${good?"up":"dn"}">${l}×${v.toFixed(2)}</span>`; }).join(" "); }
function tfxHTML(b,s){
  const T=s.tactic, en=b.other(s), E=en.tactic; if(!T) return "";
  let h=`<span class="tfx">${fxStr(T.mods)||"无额外效果"}</span>`;
  if(T.enMods&&fxStr(T.enMods,true)) h+=`<span class="tfx">对敌：${fxStr(T.enMods,true)}</span>`;
  if(s.countering&&E) h+=`<span class="tfx cgood">克制敌「${E.name}」：攻、致组织伤 +${Math.round(T.counters[E.id]*100)}%</span>`;
  if(en.countering===T.id&&E) h+=`<span class="tfx cbad">被敌「${E.name}」克制 +${Math.round(E.counters[T.id]*100)}%</span>`;
  return h; }
function sitHTML(b,s){
  const ai=b.tacticAIs&&b.tacticAIs[s.name];
  if(!ai) return `<div class="note" style="border-top:1px dotted var(--rule);padding-top:6px">战术AI 关闭：按基础战斗规则作战。</div>`;
  const st=ai.sit; if(!st) return `<div class="note" style="border-top:1px dotted var(--rule);padding-top:6px">战术AI（${ai.persona}）待命，开战后判断形势。</div>`;
  const top=ai.ranking.filter(r=>r.ok).slice(0,4); const mx=Math.max(0.05,...top.map(r=>r.score));
  return `<div class="sit" style="border-top:1px dotted var(--rule);padding-top:6px">
    <div class="lab"><span class="lbl">形势判定 · ${ai.persona}</span><b data-li="${st.li}">${st.label}</b></div>
    <div class="note">${st.stage} · 战力比 ${st.P.toFixed(2)} · 势头 ${(st.trend*100).toFixed(1)}</div>
    <div class="flags">${[...st.flags].map(f=>`<span class="${GOODF.has(f)?"good":"bad"}">${f}</span>`).join("")||'<span>无特别征候</span>'}</div>
    <div class="tac"><span class="nm">${ai.cur?ai.cur.code+" "+ai.cur.name:"—"}${ai.forced?"（指定）":""}</span><span class="ph">阶段：${ai.phaseName}</span><span class="od">${ordersText(ai.orders||{})}</span>${tfxHTML(b,s)}</div>
    <div class="rank">${top.map(r=>`<span>${r.name}</span><i style="width:${Math.max(2,r.score/mx*100)}%"></i><span class="mono">${r.score.toFixed(2)}</span>`).join("")}</div>
  </div>`;
}
function renderStatus(){
  const b=battle; const el=$("#status");
  const card=s=>{
    const k=s.name, e=s.eff; const alive=s.units.filter(u=>!u.routed);
    const men=s.men(); const init=s.units.length*1000;
    const o=alive.length?alive.reduce((a,u)=>a+Math.max(0,u.org),0)/s.units.reduce((a,u)=>a+u.maxOrg,0):0;
    const dead=s.units.reduce((a,u)=>a+u.dead,0), fled=s.units.reduce((a,u)=>a+u.fled,0);
    return `<section class="card side-card ${k.toLowerCase()}"><h2><span><span class="chip">${k}</span> ${SIDE_NAME[k]}战况</span><span class="lbl">统帅 ${s.cmd} · 智略 ${s.int}${s.generalAlive?"":" · 主将已退"}</span></h2>
      <div class="body">
        <div class="st-head"><span class="lbl">现存兵员</span><span class="big-num">${Math.round(men).toLocaleString()}</span></div>
        <div><div class="st-head"><span class="lbl">全军组织度</span><span class="mono">${pct(o)}</span></div><div class="meter" style="--side:var(--${k.toLowerCase()})"><i style="width:${Math.min(100,o*100)}%"></i></div></div>
        <dl class="kv">
          <dt>阵亡 / 逃散</dt><dd>${Math.round(dead)} / ${Math.round(fled)}</dd>
          <dt>伤兵（可救治）</dt><dd>${Math.round(s.wounded())}</dd>
          ${s.wall?`<dt>城墙持久 / 存粮</dt><dd>${Math.round(s.wall.W*100)}% / ${s.food}日</dd>`:""}
          ${!s.wall&&s.food!=null?`<dt style="color:${s.food<=3?"var(--bad)":"inherit"}">军粮</dt><dd style="color:${s.food<=3?"var(--bad)":"inherit"}">${s.food} 日</dd>`:""}
          <dt>战役决心</dt><dd>${s.resolve}</dd>
          ${s.looting>0?`<dt style="color:var(--bad)">争抢辎重</dt><dd style="color:var(--bad)">余 ${s.looting} 回合</dd>`:""}
          ${s.wall&&s.wall.F>0?`<dt style="color:var(--bad)">敌登城进度</dt><dd style="color:var(--bad)">${Math.round(s.wall.F*100)}%</dd>`:""}
          ${s.fortMax>0.05?`<dt>营垒（现/原）</dt><dd>${s.fort.toFixed(1)} / ${s.fortMax.toFixed(1)} 级 · ${Math.round(s.fort/s.fortMax*100)}%</dd>`:""}
          ${s.engines||s.engineHP>0?`<dt>攻城器械 / 持久</dt><dd>${s.engines} 具 / ${Math.round(s.engineHP)}</dd>`:""}
          ${s.orders&&(s.orders.screen||s.orders.repair||s.orders.fire)?`<dt>工事令</dt><dd>${[s.orders.screen?"张设盾网":null,s.orders.repair?"抢修工事":null,s.orders.fire?"火箭焚垒":null].filter(Boolean).join("、")}</dd>`:""}
          ${s.failDays?`<dt style="color:var(--bad)">久攻不下</dt><dd style="color:var(--bad)">${s.failDays} 日</dd>`:""}
          ${b.day>1||b.daily.length?`<dt>今日方略</dt><dd>${b.planName(s.plan)}</dd>`:""}
          ${b.mode==="遭遇"?`<dt>已展开</dt><dd style="color:${s.aliveColumn().length?"var(--warn)":"inherit"}">${s.units.length-s.aliveColumn().length-s.units.filter(u=>u.routed&&u.pos==="column").length} / ${s.units.length}</dd>`:""}
          <dt>战力（兵员×组织度）</dt><dd>${Math.round(s.power()).toLocaleString()}</dd>
          <dt>溃散部数</dt><dd>${s.units.length-alive.length} / ${s.units.length}</dd>
          <dt>统御上限</dt><dd style="color:${e.overload>0?"var(--bad)":"inherit"}">${s.units.length}/${e.cap.toFixed(0)}${e.overload>0?" 超"+pct(e.overload):""}</dd>
          <dt>调度（每回合轮换）</dt><dd>${e.swaps}</dd>
          ${s.lured>0?`<dt style="color:var(--bad)">中计出城</dt><dd style="color:var(--bad)">${{retreat:"追击佯退",taunt:"被激出城",challenge:"应战"}[s.lureKind]||""} · 余 ${s.lured} 回合</dd>`:""}
          ${s.ambush>0?`<dt style="color:var(--good)">伏兵</dt><dd style="color:var(--good)">余 ${s.ambush} 回合</dd>`:""}
          ${s.lureSeen?`<dt>计被识破</dt><dd>${s.lureSeen} 次</dd>`:""}
          ${(s.statuses||[]).length?`<dt>状态</dt><dd style="white-space:normal;text-align:right">${s.statuses.map(id=>STATUS[id].name).join("、")}</dd>`:""}
          <dt title="${s.fm.desc}">阵型</dt><dd title="${s.fm.desc}">${s.fm.name}阵${s.formCfg==="auto"?"（AI）":""}${(s.fm.counters||{})[b.other(s).formation]?" · 克敌"+b.other(s).fm.name:""}</dd>
          <dt>主将位置</dt><dd>${s.generalAlive?(s.genPos==="rear"?"后阵坐镇":"前阵督战"):"已退"}${s.genPosCfg==="auto"?"（AI）":""}</dd>
          <dt>护翼</dt><dd>${pct(s.flankGuard())}</dd>
          <dt>择弱而击</dt><dd>${pct(e.focus)}</dd>
          <dt>以寡击众</dt><dd>${b.few[k]>0?"k="+b.few[k].toFixed(2):"—"}</dd>
          <dt>临阵状态</dt><dd>×${b.luck[k].toFixed(2)}</dd>
          <dt>弩分番轮射</dt><dd>${e.rotate_fire?"可":"否"}</dd>
        </dl>
        ${sitHTML(b,s)}
        <div class="pen">${s.notes.length?s.notes.map(n=>`<span class="${n.startsWith("无骑兵")?"":""}">${n}</span>`).join(""):'<span class="ok">编成均衡</span>'}</div>
      </div></section>`;
  };
  let det="";
  const u=selected&&[...b.A.units,...b.B.units].find(x=>x.id===selected);
  if(u){ const t=u.t;
    det=`<section class="card"><h2>${SIDE_NAME[u.side.name]} · ${u.name}${u.isGeneral?" · 中军":""}<span class="lbl">${{front:"前阵",rear:"后阵",wing:"两翼",column:"行军中"}[u.pos]||""}${u.routed?" · 已溃":""}</span></h2><div class="body unit-detail">
      <table><tr><td>兵员</td><td>${Math.round(u.men)}</td><td>组织度</td><td>${Math.max(0,u.org).toFixed(1)}/${u.maxOrg}</td></tr>
      <tr><td>体力</td><td>${Math.round(u.stamina)}</td><td>本回合受创</td><td>${u.lastOd.toFixed(1)}</td></tr>
      <tr><td>远程</td><td>${t.ranged}</td><td>杀伤/破阵</td><td>${t.soft}/${t.hard}</td></tr>
      <tr><td>阵坚/锐气</td><td>${t.defense}/${t.bt}</td><td>披甲率</td><td>${t.hardness}</td></tr>
      <tr><td>甲胄/破甲</td><td>${t.armor}/${t.pierce}</td><td>冲击</td><td>${t.charge}</td></tr>
      <tr><td>速度</td><td>${t.speed}</td><td>展开回合</td><td>${b.mode==="遭遇"?u.deployAt:"—"}</td></tr>${u.isEngine?`<tr><td>器械持久</td><td>${Math.round(u.hp)}/${P.ENGINE_HP}</td><td>状态</td><td>${u.destroyed?"已毁":"可用"}</td></tr>`:""}</table></div></section>`; }
  el.innerHTML=card(b.A)+card(b.B)+det;
}
function makeAIs(sp){ const ais={}; for(const k of ["A","B"]){ const a=sp[k].ai; if(a&&a.on) ais[k]=new TacticalAI(k,{persona:a.persona,forced:a.forced||null}); } return ais; }
let aiSeen={A:0,B:0};
function resetBattle(seed){
  stop(); const sd=seed??spec.seed??Math.floor(Math.random()*1e9); battle=new Battle(spec,sd); battle.seedUsed=sd; attachRoundAI(battle,makeAIs(spec)); aiSeen={A:0,B:0}; logRows=[]; selected=null;
  logRows.push({r:"00", h:`${spec.mode==="遭遇"?"两军行军中遭遇于":"两军列阵于"}${spec.terrain}，${({"决战":"决战","攻守":SIDE_NAME.A+"来攻","遭遇":"各部抢先展开","阵地":SIDE_NAME.A+"攻营","围城":SIDE_NAME.A+"攻城"}[spec.mode]||spec.mode)}，预定 ${battle.days} 日。正面宽 ${battle.terr.width}，两翼各 ${battle.terr.wing/2} 格。`});
  render();
}
function step(){ if(!battle||battle.done) return; battle.step(); pushLog(); render(); playFx(); if(battle.done){ stop(); playRetreat(); } }
/* ---------- 攻击动画：箭矢、弩矢、抛石飞向目标；白刃与骑兵冲击时兵牌原地轻震、交锋处迸出火花 ---------- */
const RM=matchMedia("(prefers-reduced-motion: reduce)");
function playFx(){
  const fx=battle&&battle.fx; if(!fx||!fx.length||RM.matches) return;
  const dur=timer?Math.min(900,(+$("#speed").value)*0.85):800; if(dur<200) return;
  const map=$("#map"); let layer=$("#fxlayer"); if(!layer){ layer=document.createElement("div"); layer.id="fxlayer"; map.appendChild(layer); }
  layer.style.width=$("#field").scrollWidth+"px"; layer.style.height=$("#field").scrollHeight+"px";
  const mr=map.getBoundingClientRect();
  const ctr=el=>{ const r=el.getBoundingClientRect(); return {x:r.left-mr.left+map.scrollLeft+r.width/2, y:r.top-mr.top+map.scrollTop+r.height/2, w:r.width, h:r.height}; };
  const elOf=id=>id.startsWith("WALL")?($("#works"+id.slice(4)+" .wallbar")||$("#works"+id.slice(4)+" .palisade")):document.querySelector(`#field .ctr[data-id="${id}"]`);
  const shots=new Map(), melee=new Map(), charges=[];
  for(const [a,b,k] of fx){ if(k==="r"||k==="e"){ if(!shots.has(a)) shots.set(a,{b,k}); } else if(k==="m"){ if(!melee.has(a)) melee.set(a,b); } else charges.push([a,b]); }
  let n=0;
  for(const [a,{b,k}] of shots){ if(n++>36) break; const ea=elOf(a), eb=elOf(b); if(!ea||!eb) continue; const p0=ctr(ea), p1=ctr(eb);
    const u=[...battle.A.units,...battle.B.units].find(x=>x.id===a); const cnt=k==="e"?1:(u&&u.t.reload>1?2:3);
    for(let i=0;i<cnt;i++){ const d=document.createElement("i"); d.className="fx-"+(k==="e"?"stone":(u&&u.t.reload>1?"bolt":"arrow"))+" "+(u?u.side.name.toLowerCase():"");
      layer.appendChild(d);
      const jx=(Math.random()-0.5)*p0.w*0.6, tx=p1.x+(Math.random()-0.5)*p1.w*0.7, ty=p1.y+(Math.random()-0.5)*p1.h*0.5, x0=p0.x+jx, y0=p0.y;
      const lift=k==="e"?Math.max(60,Math.abs(ty-y0)*0.7):(u&&u.t.reload>1?Math.abs(ty-y0)*0.12:Math.max(24,Math.abs(ty-y0)*0.35));
      const kf=[]; for(let j=0;j<=8;j++){ const t=j/8; const x=x0+(tx-x0)*t, y=y0+(ty-y0)*t-lift*4*t*(1-t);
        const dx=(tx-x0), dy=(ty-y0)-lift*4*(1-2*t); const ang=Math.atan2(dy,dx)*180/Math.PI;
        kf.push({transform:`translate(${x}px,${y}px) rotate(${ang}deg)`,opacity:j===8?0:1,offset:t}); }
      const an=d.animate(kf,{duration:dur*(k==="e"?0.95:0.75),delay:i*dur*0.08+Math.random()*dur*0.08,easing:"linear",fill:"both"}); an.onfinish=()=>d.remove(); } }
  const shake=(el,amp,d)=>{ if(!el) return; const j=()=>`translate(${((Math.random()-0.5)*2*amp).toFixed(2)}px,${((Math.random()-0.5)*2*amp*0.8).toFixed(2)}px)`;   // 兵牌不移动，原地轻微震动
    el.animate([{transform:"translate(0,0)"},{transform:j(),offset:0.2+d},{transform:j(),offset:0.35+d},{transform:j(),offset:0.5+d},{transform:j(),offset:0.65+d},{transform:"translate(0,0)"}],{duration:dur,easing:"linear"}); };
  const spark=(p0,p1,ph,cls)=>{ const sp=document.createElement("i"); sp.className=cls; layer.appendChild(sp); const mx=(p0.x+p1.x)/2, my=(p0.y+p1.y)/2;
    sp.animate([{transform:`translate(${mx}px,${my}px) scale(.2)`,opacity:0},{transform:`translate(${mx}px,${my}px) scale(1)`,opacity:.85,offset:0.35+ph},{transform:`translate(${mx}px,${my}px) scale(1.3)`,opacity:0}],{duration:dur*0.9}).onfinish=()=>sp.remove(); };
  for(const [a,b] of charges){ const ea=elOf(a), eb=elOf(b); if(!ea||!eb) continue; const p0=ctr(ea), p1=ctr(eb);
    shake(ea,1,0); shake(eb,1.2,0.1); spark(p0,p1,0.05,"fx-dust"); spark(p0,p1,0.1,"fx-clash"); }
  for(const [a,b] of melee){ const ea=elOf(a), eb=elOf(b); if(!ea||!eb) continue; const p0=ctr(ea), p1=ctr(eb); const ph=Math.random()*0.2;
    shake(ea,0.8,ph); spark(p0,p1,ph,"fx-clash"); }
}
/* 撤退：撤出一方的兵牌向己方后方滑出画面；溃败仍按原样归入溃兵栏 */
function playRetreat(){
  if(!battle||!battle.done||RM.matches) return; const why=battle.endReason; if(!["撤退","撤围","夜遁"].includes(why)||!battle.winner) return;
  const los=battle.other(battle.winner), dir=los.name==="A"?1:-1;
  const els=[...document.querySelectorAll(`#front${los.name} .ctr, #wl${los.name} .ctr, #wr${los.name} .ctr, #rear${los.name} .ctr`)];
  els.forEach((el,i)=>{ const delay=(los.name==="A"?(el.closest(".rear")?0:180):(el.closest(".rear")?0:180))+Math.random()*160;
    el.animate([{transform:"translateY(0)",opacity:1},{transform:`translateY(${dir*14}px)`,opacity:1,offset:0.25},{transform:`translateY(${dir*140}px)`,opacity:0}],{duration:1300,delay,easing:"cubic-bezier(.45,0,.75,.6)",fill:"forwards"}); });
  const bn=$("#banner"); if(bn) bn.animate([{opacity:0},{opacity:0,offset:0.6},{opacity:1}],{duration:1800,easing:"ease-out"});
}
function stop(){ if(timer){clearInterval(timer); timer=null;} $("#b-play").textContent="自动推演"; }
$("#b-play").onclick=()=>{ if(timer){stop();return;} timer=setInterval(step,+$("#speed").value); $("#b-play").textContent="暂停"; };
$("#speed").onchange=()=>{ if(timer){stop(); $("#b-play").click();} };
$("#b-step").onclick=step;
$("#b-end").onclick=()=>{ stop(); while(battle&&!battle.done){battle.step(); pushLog();} render(); playRetreat(); };
$("#b-reset").onclick=resetBattle;
/* ---------- 布阵：开战前（第 0 回合）可在沙盘上调整各部位置 ---------- */
const canDeploy=()=>battle&&battle.rnd===0&&!battle.done&&battle.mode!=="遭遇";
function exportLayout(sd){ return {front:sd.front.filter(u=>u&&!u.routed).map(u=>u.id), wl:sd.wings.filter(u=>u.wingSide!=="R").map(u=>u.id), wr:sd.wings.filter(u=>u.wingSide==="R").map(u=>u.id), rear:sd.rear.filter(u=>!u.routed).map(u=>u.id), gen:sd.genUnit?sd.genUnit.id:null}; }
function zoneOf(L,id){ for(const z of ["front","wl","wr","rear"]){ const i=L[z].indexOf(id); if(i>=0) return [z,i]; } return [null,-1]; }
function commitLayout(k,L,msg){ const sd=battle[k]; if(spec[k].formation==="auto"||!spec[k].formation) spec[k].formation=sd.formation; spec[k].layout=L; custom(); const keep=selected; resetBattle(); selected=keep; syncSetup(); render(); if(msg) flashHint(msg); }
function moveUnit(id,zone,idx){ const k=id[0], sd=battle[k], u=sd.units.find(x=>x.id===id); if(!u) return;
  if(u.isEngine&&zone!=="rear"){ flashHint("攻城器械只能居后阵"); return; }
  const L=exportLayout(sd); const [z0,i0]=zoneOf(L,id); if(z0) L[z0].splice(i0,1);
  const wUse=z=>L[z].reduce((a,x)=>a+(sd.units.find(v=>v.id===x)||{t:{width:1}}).t.width,0);
  if(zone==="front"&&wUse("front")+u.t.width>sd.width){ flashHint(`前阵已满（${sd.width} 格），可与前阵某部互换`); return; }
  if((zone==="wl"||zone==="wr")&&wUse("wl")+wUse("wr")+u.t.width>sd.wingCap){ flashHint(sd.wingCap?`两翼已满（共 ${sd.wingCap} 格）`:"此地形/阵型无两翼"); return; }
  L[zone].splice(idx==null?L[zone].length:Math.min(idx,L[zone].length),0,id); commitLayout(k,L); }
function swapUnits(a,b){ const k=a[0]; if(b[0]!==k) return; const sd=battle[k]; const L=exportLayout(sd); const [za,ia]=zoneOf(L,a), [zb,ib]=zoneOf(L,b); if(!za||!zb) return;
  const ua=sd.units.find(x=>x.id===a), ub=sd.units.find(x=>x.id===b);
  if((ua.isEngine&&zb!=="rear")||(ub.isEngine&&za!=="rear")){ flashHint("攻城器械只能居后阵"); return; }
  L[za][ia]=b; L[zb][ib]=a;
  const wUse=z=>L[z].reduce((q,x)=>q+sd.units.find(v=>v.id===x).t.width,0);
  if(wUse("front")>sd.width||wUse("wl")+wUse("wr")>sd.wingCap){ flashHint("宽度不足，无法互换（骑兵占 2 格）"); return; }
  commitLayout(k,L); }
function setGeneral(id){ const k=id[0]; const L=exportLayout(battle[k]); L.gen=id; commitLayout(k,L,"已设为中军（主将所在）"); }
let hintT=null; function flashHint(t){ const el=$("#deploy-hint"); if(!el) return; el.dataset.msg=t; el.classList.add("flash"); renderHint(); clearTimeout(hintT); hintT=setTimeout(()=>{ el.dataset.msg=""; el.classList.remove("flash"); renderHint(); },2200); }
function renderHint(){ const el=$("#deploy-hint"); if(!el) return; document.body.classList.toggle("deploy-on",!!canDeploy());
  el.innerHTML=el.dataset.msg?`<b>${el.dataset.msg}</b>`:(canDeploy()?`布阵：点兵牌选中，再点同军另一兵牌互换，或点空位/两翼/后阵移动 · <kbd>W</kbd>前阵 <kbd>S</kbd>后阵 <kbd>A</kbd>左翼 <kbd>D</kbd>右翼 <kbd>←</kbd><kbd>→</kbd>移位 <kbd>G</kbd>设中军 · <kbd>1</kbd>–<kbd>8</kbd>甲军阵型 <kbd>Shift</kbd>+数字 乙军`:`<kbd>空格</kbd>下一回合 <kbd>P</kbd>自动 <kbd>E</kbd>直至结束 <kbd>R</kbd>重新布阵 · 第 0 回合可布阵`); }
$("#field").addEventListener("click",e=>{
  const c=e.target.closest(".ctr");
  if(canDeploy()){
    if(c){ const id=c.dataset.id; if(window.PLAY&&PLAY.side&&id[0]!==PLAY.side){ flashHint("只能调动己方兵牌"); return; } if(selected&&selected!==id&&selected[0]===id[0]){ const a=selected; selected=null; swapUnits(a,id); return; } selected=selected===id?null:id; render(); return; }
    if(selected){ const g=e.target.closest(".ghost"), wing=e.target.closest(".wingbox"), rear=e.target.closest(".zone.rear"), front=e.target.closest(".frontbox");
      const side=(g||wing||rear||front)?((g&&g.dataset.side)||((wing||rear||front).id.slice(-1))):null;
      if(side&&side===selected[0]){ const z=g||front?"front":wing?(wing.id.startsWith("wl")?"wl":"wr"):"rear"; const id=selected; selected=null; moveUnit(id,z); return; } }
    return; }
  if(!c) return; selected=selected===c.dataset.id?null:c.dataset.id; render();});
document.addEventListener("keydown",e=>{
  const tg=e.target; if(tg&&(tg.tagName==="INPUT"||tg.tagName==="SELECT"||tg.tagName==="TEXTAREA"||tg.isContentEditable)) return; if(e.ctrlKey||e.metaKey||e.altKey) return;
  if(!document.body.classList.contains("vb")&&!document.body.classList.contains("vw")) return;   // 快捷键只在战场与调试台生效
  const m=e.code.match(/^Digit([1-8])$/); if(m){ const id=FORM_IDS[+m[1]-1]; if(id){ e.preventDefault(); applyForm(e.shiftKey?"B":"A",id); flashHint(`${e.shiftKey?"乙":"甲"}军改列${FORM[id].name}阵`); } return; }
  const key=e.key.toLowerCase();
  if(canDeploy()&&selected){ const k=selected[0]; const sd=battle[k];
    if(key==="w"){ e.preventDefault(); moveUnit(selected,"front"); return; } if(key==="s"){ e.preventDefault(); moveUnit(selected,"rear"); return; }
    if(key==="a"){ e.preventDefault(); moveUnit(selected,"wl"); return; } if(key==="d"){ e.preventDefault(); moveUnit(selected,"wr"); return; }
    if(key==="g"){ e.preventDefault(); setGeneral(selected); return; }
    if(e.key==="ArrowLeft"||e.key==="ArrowRight"){ e.preventDefault(); const L=exportLayout(sd); const [z,i]=zoneOf(L,selected); if(!z) return; const j=i+(e.key==="ArrowLeft"?-1:1); if(j<0||j>=L[z].length) return; [L[z][i],L[z][j]]=[L[z][j],L[z][i]]; commitLayout(k,L); return; }
    if(e.key==="Escape"){ selected=null; render(); return; } }
  if(e.key===" "){ e.preventDefault(); step(); return; }
  if(key==="p"){ e.preventDefault(); $("#b-play").click(); return; } if(key==="e"){ e.preventDefault(); $("#b-end").click(); return; } if(key==="r"){ e.preventDefault(); resetBattle(); return; }
  if(e.key==="Escape"&&selected){ selected=null; render(); }
});
$("#field").addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){const c=e.target.closest(".ctr"); if(c){e.preventDefault(); c.click();}}});

/* ---------- 模式与页签：游玩（战役 / 战斗）· 编辑器 ---------- */
const TAB_OF={"v-clobby":"v-camp","v-blobby":"v-board"};
let curMode="play"; const lastView={play:"v-camp",edit:"v-campedit"};
function setMode(m){ curMode=m;
  for(const x of document.querySelectorAll("nav.modes button")) x.setAttribute("aria-selected",x.dataset.mode===m);
  for(const x of document.querySelectorAll("nav.tabs button")) x.hidden=x.dataset.mode!==m; }
function showView(id){
  if(window.routeView) id=window.routeView(id);
  const tabId=TAB_OF[id]||id, tb=document.querySelector(`nav.tabs button[data-view="${tabId}"]`);
  if(tb&&tb.dataset.mode!==curMode) setMode(tb.dataset.mode);
  lastView[curMode]=tabId;
  for(const x of document.querySelectorAll("nav.tabs button")) x.setAttribute("aria-selected",x===tb);
  for(const v of document.querySelectorAll(".view")) v.classList.toggle("on",v.id===id);
  const wb=id==="v-setup"; document.body.classList.toggle("vb",id==="v-board"); document.body.classList.toggle("vw",wb); placeBoard(wb);
  if(id!=="v-board"&&!wb) stop(); else { render(); requestAnimationFrame(()=>{ fitSlot(); render(); }); }   // 先同步画一次（窗口不可见时 rAF 不触发）
  if(id==="v-camp"&&window.renderCamp) renderCamp();
  if(window.onView) window.onView(id);
}
document.querySelector("nav.tabs").addEventListener("click",e=>{ const b=e.target.closest("button[data-view]"); if(b) showView(b.dataset.view); });
document.querySelector("nav.modes").addEventListener("click",e=>{ const b=e.target.closest("button[data-mode]"); if(!b||b.dataset.mode===curMode) return; setMode(b.dataset.mode); showView(lastView[b.dataset.mode]); });

/* ---------- 编辑器 · 战斗调试台：战场挪进「战斗编辑」中栏，右栏放调试面板与战况 ---------- */
const boardWrap=document.querySelector("#v-board .board-wrap"), statusEl=$("#status"), statusHome=statusEl.parentNode;
function placeBoard(wb){ if(wb){ if(boardWrap.parentNode.id!=="se-board"){ $("#se-board").appendChild(boardWrap); $(".wb-right").appendChild(statusEl); } }
  else if(boardWrap.parentNode.id==="se-board"){ $("#v-board").appendChild(boardWrap); statusHome.appendChild(statusEl); } }
/* 快进：不播动画，逐回合推进到条件成立 */
function fastStep(until){ stop(); let n=0; while(battle&&!battle.done&&n++<2000){ battle.step(); pushLog(); if(until&&until()) break; } render(); }
let dbgBatch=null, dbgN=200;
function renderDebug(){ const el=$("#dbg"); if(!el||!battle) return; const ae=document.activeElement; if(ae&&el.contains(ae)&&(ae.tagName==="INPUT"||ae.tagName==="SELECT")) return;   // 正在输入时不重绘
  const b=battle, u=selected&&[...b.A.units,...b.B.units].find(x=>x.id===selected);
  const ue=u?`<div class="dbg-unit"><b>${SIDE_NAME[u.side.name]} · ${u.name}${u.isGeneral?" · 中军":""}</b>${u.routed?' <span class="cbad">已溃</span>':""}
      <label class="prow"><span>兵员<small>上限 ${u.maxMen}</small></span><input type="number" data-ue="men" value="${Math.round(u.men)}"></label>
      <label class="prow"><span>组织度<small>上限 ${u.maxOrg}</small></span><input type="number" data-ue="org" step="0.5" value="${Math.max(0,u.org).toFixed(1)}"></label>
      <label class="prow"><span>体力<small>0–100</small></span><input type="number" data-ue="stamina" value="${Math.round(u.stamina)}"></label>
      <div class="note">改动只作用于这一场，重新布阵即恢复。</div></div>`:`<div class="note">点战场上的兵牌，可直接改它的兵员、组织度、体力。</div>`;
  el.innerHTML=`<h2>调试 <span class="lbl">DEBUG</span></h2><div class="body">
    <div class="form-row"><span class="lbl">随机种子</span><input id="dbg-seed" class="mono" inputmode="numeric" placeholder="留空则每次随机" value="${spec.seed??""}"></div>
    <div class="toolbar"><button class="btn sm" id="dbg-same" title="用本场的种子重来，结果完全相同">同种子重来</button><button class="btn sm" id="dbg-new" title="清除固定种子，换一个随机种子重来">换种子</button><span class="note mono">本场 ${b.seedUsed}</span></div>
    <div><div class="lbl">快进</div><div class="toolbar"><button class="btn sm" data-jump="ph">下一时段</button><button class="btn sm" data-jump="day">下一日</button><button class="btn sm" data-jump="end">到结束</button></div>
      <div class="note">${b.done?"已结束："+(b.endReason||(b.winner?"溃败":"相持")):`${b.timeText()} · 回合 ${b.rnd} · 已用 ${b.periodsUsed} 时段`}</div></div>
    <div><div class="lbl">选中兵牌</div>${ue}</div>
    <div><div class="lbl">快速批量（种子 1–N，用当前编成）</div><div class="toolbar"><select id="dbg-n" aria-label="场数">${[50,200,500].map(n=>`<option ${n===dbgN?"selected":""}>${n}</option>`).join("")}</select><button class="btn sm primary" id="dbg-batch">${dbgBatch&&dbgBatch.running?"推演中…":"开始"}</button><div class="progress" style="flex:1;min-width:60px"><i id="dbg-prog" style="width:${dbgBatch?dbgBatch.pct:0}%"></i></div></div>
      <div id="dbg-bres">${dbgBatch&&dbgBatch.html||""}</div><button type="button" class="linkbtn" data-goto="v-batch">完整批量推演（直方图、兵种损失）→</button></div>
  </div>`; }
function quickBatch(N){ if(dbgBatch&&dbgBatch.running) return; const s0=JSON.parse(JSON.stringify(spec)); delete s0.seed; const res=[]; dbgBatch={running:true,pct:0,html:""}; renderDebug();
  const chunk=()=>{ const t0=performance.now(); while(res.length<N&&performance.now()-t0<30){ const i=res.length, bt=new Battle(s0,i+1); attachRoundAI(bt,makeAIs(s0)); const r=bt.run(); res.push({r,per:bt.periodsUsed,day:bt.day}); }
    dbgBatch.pct=res.length/N*100; const pr=$("#dbg-prog"); if(pr) pr.style.width=dbgBatch.pct+"%";
    if(res.length<N){ setTimeout(chunk,0); return; }
    const n=res.length, f=k=>res.filter(x=>x.r.winner===k).length/n, avg=g=>res.reduce((t,x)=>t+g(x),0)/n, why={};
    for(const x of res){ const k=x.r.reason; why[k]=(why[k]||0)+1; }
    dbgBatch={running:false,pct:100,html:`<div class="stack">${[["A",f("A")],["相持",f("相持")],["B",f("B")]].filter(x=>x[1]>0).map(([k,v])=>`<div style="width:${v*100}%;background:${k==="A"?"var(--a)":k==="B"?"var(--b)":"var(--ink-2)"}">${Math.round(v*100)}%</div>`).join("")}</div>
      <dl class="kv"><dt>甲胜 / 相持 / 乙胜</dt><dd>${Math.round(f("A")*100)} / ${Math.round(f("相持")*100)} / ${Math.round(f("B")*100)}%</dd><dt>平均回合 · 时段 · 日</dt><dd>${avg(x=>x.r.rounds).toFixed(1)} · ${avg(x=>x.per).toFixed(1)} · ${avg(x=>x.day).toFixed(1)}</dd>
      <dt>甲损 / 乙损</dt><dd>${pct(avg(x=>x.r.A.loss))} / ${pct(avg(x=>x.r.B.loss))}</dd></dl>
      <div class="flags">${Object.entries(why).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`<span>${k} ${Math.round(v/n*100)}%</span>`).join("")}</div>`};
    renderDebug(); };
  chunk(); }
$("#v-setup").addEventListener("click",e=>{ const t=e.target;
  if(t.id==="dbg-same"){ resetBattle(battle.seedUsed); return; }
  if(t.id==="dbg-new"){ delete spec.seed; resetBattle(); return; }
  if(t.id==="dbg-batch"){ quickBatch(+$("#dbg-n").value); return; }
  const j=t.closest("[data-jump]"); if(j){ const b=battle; if(j.dataset.jump==="ph"){ const c0=b.clock; fastStep(()=>b.clock!==c0); } else if(j.dataset.jump==="day"){ const d0=b.day; fastStep(()=>b.day!==d0); } else { fastStep(null); playRetreat(); } return; } });
$("#v-setup").addEventListener("change",e=>{ const t=e.target;
  if(t.id==="dbg-n"){ dbgN=+t.value; return; }
  if(t.id==="dbg-seed"){ const v=t.value.trim(); if(/^\d+$/.test(v)) spec.seed=+v; else delete spec.seed; resetBattle(); return; }
  const k=t.dataset&&t.dataset.ue; if(k&&selected){ const u=[...battle.A.units,...battle.B.units].find(x=>x.id===selected); const v=parseFloat(t.value); if(!u||!isFinite(v)) return;
    if(k==="men") u.men=Math.max(0,Math.min(u.maxMen,v)); else if(k==="org") u.org=Math.max(0,Math.min(u.maxOrg,v)); else if(k==="stamina") u.stamina=Math.max(0,Math.min(100,v)); render(); } });

/* ---------- 批量推演 ---------- */
let batchRunning=false;
$("#b-batch").onclick=()=>{
  if(batchRunning) return; batchRunning=true; $("#b-batch").disabled=true;
  const N=+$("#bn").value; const res=[]; const s=JSON.parse(JSON.stringify(spec)); const use={A:{},B:{}};
  const chunk=()=>{ const t0=performance.now(); while(res.length<N&&performance.now()-t0<30){ const bt=new Battle(s); const ais=makeAIs(s); attachRoundAI(bt,ais); res.push(bt.run());
      for(const k of ["A","B"]) if(ais[k]) for(const h of ais[k].history) use[k][h.id]=(use[k][h.id]||0)+1; }
    $("#bprog").style.width=(res.length/N*100)+"%";
    if(res.length<N) setTimeout(chunk,0); else { batchRunning=false; $("#b-batch").disabled=false; showBatch(res,s,use); } };
  chunk();
};
function showBatch(res,s,use={A:{},B:{}}){
  const n=res.length; const c=k=>res.filter(r=>r.winner===k).length/n;
  const a=c("A"), b=c("B"), d=c("相持");
  const avg=f=>res.reduce((x,r)=>x+f(r),0)/n;
  const maxR=Math.max(...res.map(r=>r.rounds)); const bins=Math.min(30,maxR); const hist=new Array(bins).fill(0).map(()=>({A:0,B:0,D:0}));
  for(const r of res){ const i=Math.min(bins-1,Math.floor((r.rounds-1)/maxR*bins)); hist[i][r.winner==="A"?"A":r.winner==="B"?"B":"D"]++; }
  const hmax=Math.max(...hist.map(h=>h.A+h.B+h.D));
  const types=k=>{ const keys=Object.keys(res[0][k].types); return keys.map(t=>`<dt>${t}</dt><dd>${pct(avg(r=>r[k].types[t]))}</dd>`).join(""); };
  const dd=k=>res.filter(r=>r.winner!=="相持"&&!r.night&&r.day===k).length/n;
  const nt=res.filter(r=>r.night).length/n;
  $("#bres").innerHTML=`
   <div class="stack" aria-label="胜率">${a?`<div style="width:${a*100}%;background:var(--a)">甲 ${pct(a)}</div>`:""}${d?`<div style="width:${d*100}%;background:var(--ink-2)">相持 ${pct(d)}</div>`:""}${b?`<div style="width:${b*100}%;background:var(--b)">乙 ${pct(b)}</div>`:""}</div>
   <div class="batch-grid" style="margin-top:12px">
    <section class="card"><h2>概况</h2><div class="body"><dl class="kv">
      <dt>场数</dt><dd>${n}</dd><dt>平均回合</dt><dd>${avg(r=>r.rounds).toFixed(1)}</dd><dt>平均天数</dt><dd>${avg(r=>r.day).toFixed(1)}</dd>
      <dt>转入阵地/围城</dt><dd>${pct(res.filter(r=>r.stage!=="野战").length/n)}</dd>
      ${(()=>{ const c={}; for(const r of res) c[r.reason]=(c[r.reason]||0)+1; return Object.entries(c).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`<dt>结局：${k}</dt><dd>${pct(v/n)}</dd>`).join(""); })()}

      <dt>甲军平均损失</dt><dd>${pct(avg(r=>r.A.loss))}</dd><dt>乙军平均损失</dt><dd>${pct(avg(r=>r.B.loss))}</dd></dl></div></section>
    <section class="card side-card a"><h2>甲军分兵种损失</h2><div class="body"><dl class="kv">${types("A")}</dl></div></section>
    <section class="card side-card b"><h2>乙军分兵种损失</h2><div class="body"><dl class="kv">${types("B")}</dl></div></section>
   </div>
   <div class="batch-grid" style="margin-top:12px">${["A","B"].map(k=>{ const e=Object.entries(use[k]).sort((x,y)=>y[1]-x[1]); const mx=e.length?e[0][1]:1;
     return `<section class="card side-card ${k.toLowerCase()}"><h2>${k==="A"?"甲":"乙"}军采用的战术 <span class="lbl">每场平均次数</span></h2><div class="body">${e.length?`<div class="rank">${e.map(([id,c])=>`<span>${TACTIC_BY_ID[id].name}</span><i style="width:${c/mx*100}%"></i><span class="mono">${(c/n).toFixed(2)}</span>`).join("")}</div>`:'<span class="note">未启用战术AI</span>'}</div></section>`; }).join("")}</div>
   <section class="card" style="margin-top:12px"><h2>决出回合分布 <span class="lbl">柱色＝胜方</span></h2><div class="body">
     <div class="hist">${hist.map((h,i)=>{const tot=h.A+h.B+h.D; const lo=Math.floor(i*maxR/bins)+1, hi=Math.floor((i+1)*maxR/bins);
       return `<div title="第${lo}–${hi}回合：甲胜${h.A} 乙胜${h.B} 相持${h.D}" style="height:${tot/hmax*100}%;background:linear-gradient(to top,var(--a) 0 ${h.A/Math.max(1,tot)*100}%,var(--b) ${h.A/Math.max(1,tot)*100}% ${(h.A+h.B)/Math.max(1,tot)*100}%,var(--ink-2) 0)"></div>`;}).join("")}</div>
     <div class="hist-axis"><span>1</span><span>${Math.round(maxR/2)}</span><span>${maxR} 回合</span></div></div></section>`;
}

/* ---------- 规则编辑 ---------- */
const UCOLS=[["ranged","远程"],["soft","杀伤"],["hard","破阵"],["defense","阵坚"],["bt","锐气"],["hardness","披甲率"],["armor","甲胄"],["pierce","破甲"],["charge","冲击"],["width","宽度"],["org","组织度"],["reload","装填"],["far","远距"],["speed","速度"]];
const PGROUPS=[
  ["命中与伤害",[["HIT_ABSORBED","抵挡内命中率"],["HIT_EXCESS","超出抵挡命中率"],["ORG_SCALE","组织度伤害倍率"],["MEN_SCALE","兵员伤害倍率"],["ARMOR_MEN_MULT","甲胄：兵员伤害×"],["ARMOR_ORG_MULT","甲胄：组织伤害×"],["LOW_PIERCE_ATK","破甲不足：攻击×"],["ATK_ABSORB_MIX","进攻方抵挡中阵坚占比"]]],
  ["组织度与溃散",[["SHAKEN","动摇线"],["SHAKEN_ATK","动摇时攻击×"],["BREAK","溃散检定线"],["CONTAGION","相邻溃散传染"],["GENERAL_LOST","中军溃散全军打击"],["MOMENTUM","势：敌溃我振"]]],
  ["统帅",[["CMD_ORG","统帅100减组织伤害"],["CMD_HOLD","统帅100稳阵概率"],["CMD_CONTAGION","统帅100减传染"],["CMD_REAR","后阵每回合恢复"],["CMD_CAP_DIV","统御上限＝统帅÷"],["OVERLOAD_ORG","超编：组织伤害加成"],["FOCUS_CMD","择弱而击起始统帅"],["FOCUS_MAX","择弱而击上限"],["CENTER_STRIKE","其中直扑中军占比"],["GENERAL_GUARD","主将亲卫减伤"],["STRETCH_CMD","疏阵延展上限"],["STRETCH_ABSORB_EXP","疏阵阵坚衰减指数"]]],
  ["以寡击众与临阵",[["FEW_CMD","以寡击众起始统帅"],["FEW_ORG","以寡击众减组织伤"],["FEW_ATK","以寡击众加攻击"],["BATTLE_LUCK_SD","临阵状态波动"]]],
  ["侧翼",[["FLANK_ATK","侧击攻击×"],["FLANK_ORG","侧击组织伤害×"],["FLANK_GUARD_CMD","统帅100护翼"],["FLANK_GUARD_RESERVE","预备队护翼"],["FLANK_GUARD_MAX","护翼上限"],["WING_COUNTER","被侧击部队转身反击率"]]],
  ["远程",[["RF_FAR","前阵·远距"],["RF_NEAR","前阵·接近"],["RF_MELEE","前阵·白刃"],["RR_FAR","后阵·远距"],["RR_NEAR","后阵·接近"],["RR_MELEE","后阵·白刃抛射"],["VOLLEY_MULT","弩齐射威力×"],["ROTATE_FIRE_CMD","弩轮射所需统帅"],["ROTATE_FIRE_MULT","轮射每回合×"],["NO_RANGED_FIRE","无远程：对射挨打×"],["NO_RANGED_MELEE","无远程：白刃×"]]],
  ["骑兵",[["ANTI_CAV_MULT","冲击正面枪阵×"],["ANTI_CAV_FLANK_MULT","冲击侧面枪阵×"],["ANTI_CAV_MELEE","长枪白刃对骑×"],["ANTI_CAV_PIERCE","长枪对骑破甲＋"],["LIGHT_CAV_EVADE","冲击轻骑×（规避）"],["SKIRMISH_EVADE","步兵反击轻骑命中×"],["SKIRMISH_EVADE_CAV","重骑追打轻骑×"],["SKIRMISH_MELEE","轻骑白刃输出×"],["SKIRMISH_RECHARGE","轻骑再冲间隔"],["SKIRMISH_WITHDRAW","轻骑脱离线"],["SKIRMISH_PURSUIT_TAKEN","轻骑被追击损失×"],["SKIRMISH_PURSUIT_POWER","轻骑追击力×"]]],
  ["时段与多日会战",[["PH_ROUNDS_DAY","清晨/上午/下午每时段回合"],["PH_ROUNDS_DUSK","傍晚回合"],["PH_ROUNDS_NIGHT","夜间每时段回合"],["NIGHT_ORG","夜间组织度回复"],["NIGHT_STAM","夜间体力回复"],["NIGHT_RALLY","溃部收拢概率×统帅"],["NIGHT_RALLY_ORG","收拢后组织度"],["NIGHT_RALLY_LOSS","收拢时散失兵员"],["NIGHT_RETREAT_RATIO","战力低于对方此比例则夜遁"],["NIGHT_PURSUIT","夜遁追击损失×"]]],
  ["遭遇战",[["ENC_DEPLOY_BASE","展开耗时基数（÷速度）"],["ENC_CMD_SPEED","统帅加快展开"],["ENC_RAID","骑兵突袭行军队列倾向"],["ENC_ABSORB","行军队列抵挡×"],["ENC_ORG","行军队列组织伤害×"]]],
  ["阵地与围城",[["FORT_ABSORB","营垒每级：阵坚+"],["FORT_ATK","营垒每级：敌白刃-"],["FORT_CHARGE","营垒每级：冲击-"],["FORT_BUILD_NIGHT","筑垒一夜进度"],["WALL_ABSORB","城墙：阵坚×(1+x·W)"],["WALL_ATK","城墙完好时攻方白刃×"],["WALL_CLIMB","蚁附登城组织伤害+"],["WALL_WIDTH_MIN","城墙完好时可展开正面"],["ENGINE_DMG","每具器械每回合损城"],["ENGINE_ASSAULT_DMG","强攻时器械损城比例"],["WALL_REPAIR","守方每夜修城"],["STARVE_ORG","断粮每日组织打击"]]],
  ["蚁附登城（城墙只受器械损伤）",[["CLIMB_SHOT","守方矢石对登城者×(1+x·W)"],["CLIMB_ABSORB","登城者抵挡×(1-x·W)"],["CLIMB_MEN","登城者兵员伤亡×(1+x·W)"],["CLIMB_STAM","登城者体力消耗×"],["CLIMB_CAV","骑兵对城上白刃×"],["CLIMB_RATE","每回合登城进度基数"],["CLIMB_REPEL","守方每回合击退"],["CLIMB_BREACH","先登后城墙加成×(1-x·进度)"],["CLIMB_GAP_W","城墙低于此值出现缺口可白刃"],["CLIMB_STONE","未登城：守军擂石推梯×白刃攻击"],["CLIMB_RESERVE","守方有预备队时击退×"]]],
  ["工事与器械持久",[["STRUCT_MELEE","每部步卒每回合拆垒"],["FIRE_FORT","火箭每点远程每回合焚垒"],["ENGINE_FORT","每具器械每回合轰垒"],["ENGINE_HP","每具器械持久"],["ENGINE_SHOT","守方每点远程损器械"],["SORTIE_ENGINE","出城突击每部损器械"],["ENGINE_REPAIR_NIGHT","每夜修器械"],["NIGHT_FORT_REPAIR","守方每夜修垒"]]],
  ["攻城器械（兵种）",[["ENGINE_CREW","每具随营工匠"],["ENGINE_WEAR","每发射一回合自损持久"],["ENGINE_RAID","敌翼骑突入后阵概率"],["ENGINE_RAID_DMG","骑兵突袭损器械"],["ENGINE_CREW_LOSS","器械被毁工匠阵亡比例"],["ENGINE_MAX","最多器械（造械上限）"],["ENGINE_BUILD_NIGHT","造械方略每夜造成"]]],
  ["智略与计谋",[["INT_SCALE","智略差每此值，中计/识破×2"],["LURE_TAKE_RETREAT","佯退：敌每回合中计率"],["LURE_TAKE_TAUNT","激将：敌每回合出城率"],["LURE_TAKE_CHALLENGE","约战：敌每回合应战率"],["LURE_SEE_RETREAT","佯退：敌每回合识破率"],["LURE_SEE_TAUNT","激将：敌每回合看穿率"],["LURE_RASH","敌将鲁莽：中计×(1+x·鲁莽)"],["LURE_REPEAT","每被识破一次再中计×"],["LURE_ROUNDS","中计后城外作战回合"],["CHALLENGE_ROUNDS","应战出城回合"],["LURE_DISORDER","追击佯退之敌脱节回合"],["LURE_AMBUSH_ROUNDS","伏兵加成回合"],["TAUNT_ORG","骂阵不出：每回合受辱组织伤"],["FEIGN_SEE","诈败：智略差/40×此值＝识破率"]]],
  ["弃辎重诱敌（白马·延津）",[["BAIT_TAKE","追兵每回合争抢概率"],["BAIT_SEE","追兵主将每回合识破概率"],["BAIT_ROUNDS","争抢散乱回合"],["BAIT_ORG","争抢时组织度骤降"],]],
  ["辎重与战斗目标",[["SUPPLY_BURN","对辎重打击×（焚烧）"],["SUPPLY_RAID","翼骑突入后阵焚辎重概率"],["RAID_FOCUS","以焚粮为目标时上项×"],["RAID_FRONT","焚粮：前阵越隙扑辎重概率"],["MISSION_GOAL","焚粮目标默认比例"],["FORT_CLOSED","营垒达此级则翼骑不能迂回"],["RESOLVE_DEFAULT","战役决心默认"]]],
  ["主将位置",[["GEN_REAR_RAID","敌翼骑突入中军概率"],["GENERAL_GUARD","前阵督战：主将所在部减伤"]]],
  ["盾网与抢修",[["REPAIR_FORT","抢修：每部每回合修垒"],["REPAIR_WALL","抢修：每部每回合修城"],["REPAIR_STAM","抢修者体力消耗"]]],
  ["伤兵与休整",[["WOUNDED_SHARE","阵亡中可救治比例"],["HEAL_NIGHT","每夜救回伤兵"],["HEAL_REST","休整日救回伤兵"],["REST_ORG_MULT","休整日组织回复×"],["FAIL_EXCHANGE","交换比低于此记久攻不下"]]],
  ["节奏与追击",[["STAM_MELEE","白刃体力消耗"],["STAM_WING","两翼体力消耗"],["PURSUIT_BASE","追击基础损失"],["PURSUIT_MAX_EXTRA","骑兵追击额外上限"],["PURSUIT_K","追击系数"],["FLED_SHARE","追击损失中逃散占比"]]],
];
const SKEYS=[["atk","攻击×"],["def","抵挡×"],["orgTaken","受组织伤×"],["orgDealt","致组织伤×"],["stam","体力耗×"],["charge","冲击×"],["ranged","远程输出×"],["rangedTaken","所受远程×"],["hold","稳阵×"],["recover","后阵恢复×"],["contagion","溃散传染×"],["guard","护翼＋"],["swaps","调度＋"]];
function statusHTML(){ return Object.keys(STATUS).map(id=>{ const S=STATUS[id], D=DEFAULT_STATUS[id];
  const row=(side,lbl)=>`<div class="strow"><span class="sl">${lbl}</span>${SKEYS.map(([k,l])=>{ const def=k==="guard"||k==="swaps"?0:1; const v=(S[side]||{})[k]??def, d=(D[side]||{})[k]??def;
    return `<label class="${v!==def?"on":""}">${l}<input type="number" step="0.05" data-st="${id}" data-ss="${side}" data-k="${k}" value="${v}" class="${v!==d?"changed":""}"></label>`; }).join("")}</div>`;
  return `<div class="stcard ${S.off?"off":""}"><div class="sth"><label><input type="checkbox" data-st="${id}" data-k="off" ${S.off?"":"checked"}> <b>${S.name}</b></label><span class="note">激发：${S.when}</span></div>${row("self","对本方")}${row("enemy","对敌方")}</div>`; }).join(""); }
const FCOLS=[["width","正面宽"],["wing","两翼±"],["atk","攻击"],["def","抵挡"],["orgTaken","受组织伤"],["orgDealt","致组织伤"],["stam","体力耗"],["charge","冲击"],["ranged","远程"],["guard","护翼±"],["swaps","调度±"]];
const fmtCnt=c=>Object.entries(c||{}).map(([k,v])=>(FORM[k]?FORM[k].name:k)+":"+v).join(" ");
function buildRules(){
  $("#status-table").innerHTML=statusHTML();
  $("#form-table").innerHTML=`<table class="edit"><thead><tr><th>阵型</th>${FCOLS.map(c=>`<th>${c[1]}</th>`).join("")}<th>克制</th></tr></thead><tbody>${FORM_IDS.map(id=>`<tr><th title="${FORM[id].desc}">${FORM[id].name}</th>${FCOLS.map(([k])=>`<td><input type="number" step="0.05" data-fm="${id}" data-k="${k}" value="${FORM[id][k]}" class="${FORM[id][k]!==DEFAULT_FORM[id][k]?"changed":""}"></td>`).join("")}<td><input type="text" data-fm="${id}" data-k="counters" value="${fmtCnt(FORM[id].counters)}" style="width:150px;text-align:left"></td></tr>`).join("")}</tbody></table>`;
  $("#unit-table").innerHTML=`<table class="edit"><thead><tr><th>兵种</th>${UCOLS.map(c=>`<th>${c[1]}</th>`).join("")}</tr></thead><tbody>${UNIT_ORDER.map(n=>`<tr><th>${n}</th>${UCOLS.map(([k])=>`<td><input type="number" step="${["hardness","far","speed"].includes(k)?0.5:1}" id="u-${n}-${k}" data-u="${n}" data-k="${k}" value="${UT[n][k]}"></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $("#terrain-table").innerHTML=`<table class="edit"><thead><tr><th>地形</th><th>正面宽度</th><th>两翼宽度</th><th>守方抵挡×</th><th>攻方攻击×</th></tr></thead><tbody>${Object.keys(TERRAIN).map(t=>`<tr><th>${t}</th>${["width","wing","def_mult","atk_mult"].map(k=>`<td><input type="number" step="${k.includes("mult")?0.05:1}" id="t-${t}-${k}" data-t="${t}" data-k="${k}" value="${TERRAIN[t][k]}"></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $("#params").innerHTML=PGROUPS.map(([g,items])=>`<div><div class="lbl" style="margin-bottom:4px">${g}</div>${items.map(([k,l])=>`<label class="prow" for="p-${k}"><span>${l}<small>${k}</small></span><input type="number" step="any" id="p-${k}" data-k="${k}" value="${P[k]}" class="${P[k]!==DEFAULT_P[k]?"changed":""}"></label>`).join("")}</div>`).join("");
}
document.querySelector("#v-rules").addEventListener("change",e=>{
  const i=e.target; if(i.tagName!=="INPUT") return;
  if(i.dataset.st){ const S=STATUS[i.dataset.st]; if(i.dataset.k==="off"){ S.off=!i.checked; } else { const v=parseFloat(i.value); if(!isFinite(v)) return; S[i.dataset.ss]=S[i.dataset.ss]||{}; S[i.dataset.ss][i.dataset.k]=v; } saveRules(); $("#status-table").innerHTML=statusHTML(); resetBattle(); return; }
  if(i.dataset.fm){ const F=FORM[i.dataset.fm]; if(i.dataset.k==="counters"){ const o={}; for(const part of i.value.split(/[\s,，]+/)){ const [n,x]=part.split(/[:：]/); const id=FORM_IDS.find(k=>FORM[k].name===n||FORM[k].name+"阵"===n||k===n); if(id&&isFinite(parseFloat(x))) o[id]=parseFloat(x); } F.counters=o; i.value=fmtCnt(o); }
    else { const v=parseFloat(i.value); if(!isFinite(v)) return; F[i.dataset.k]=v; } saveRules(); resetBattle(); return; }
  const v=parseFloat(i.value); if(!isFinite(v)) return;
  if(i.dataset.u) UT[i.dataset.u][i.dataset.k]=v;
  else if(i.dataset.t) TERRAIN[i.dataset.t][i.dataset.k]=v;
  else if(i.dataset.k){ P[i.dataset.k]=v; i.classList.toggle("changed",v!==DEFAULT_P[i.dataset.k]); }
  saveRules(); syncSetup(); resetBattle();
});
/* ---------- 战术编辑 ---------- */
let tSel=TACTICS[0].id;
function loadTactics(){ try{ const o=JSON.parse(localStorage.getItem("hm-tactics-v3")||"null"); if(o) tacticsImport(o); }catch(e){} }
function saveTactics(){ try{ localStorage.setItem("hm-tactics-v3",JSON.stringify(tacticsExport())); }catch(e){} }
loadTactics();
const T_DEF=Object.fromEntries(JSON.parse(T_DEFAULT_SNAPSHOT).map(d=>[d.id,d]));
const PH_COND={FLANK:["—","接敌后一回合","敌阵动摇"],ENVELOP:["—","接敌"],FRONTAL:["—","敌阵动摇"],BREAK:["—","接敌两回合后"],RESERVE:["—","敌阵动摇 / 敌预备已尽 / 我阵动摇"],
  FEINT:["—","敌预备队已动用，或试攻满四回合"],FEIGN:["—","接敌两回合后","敌军追击脱节，或后撤满三回合"],ELASTIC:["—","敌阵动摇或势头转好"],HARASS:["—","敌阵动摇、袭扰满六回合或久峙不决"],
  BOMBARD:["—","城墙低于 35%"],SORTIE:["—","出击四回合或形势转劣"],HOLD:["—","敌军登城（登城进度 ≥40%）"],LURE:["—","敌中计出城"],BAIT:["—","追兵争抢辎重，或追击脱节三回合后"],TAUNT:["—","敌被激怒出城"],CHALLENGE:["—","敌应战出城"],REPAIR:["—","敌箭雨压制"],FIRE:["—","敌营垒残破（<40%）"]};
function buildTactics(){
  $("#t-cw").value=T_COUNTER_WEIGHT;
  $("#t-list").innerHTML=TACTICS.map(T=>`<div class="ti ${T.id===tSel?"on":""} ${T.enabled===false?"off":""}" data-id="${T.id}"><input type="checkbox" data-en="${T.id}" ${T.enabled!==false?"checked":""} aria-label="启用${T.name}"><span class="cd">${T.code}</span><span>${T.name}</span><span class="ct">${T.cat}</span></div>`).join("");
  const T=TACTIC_BY_ID[tSel], D=T_DEF[T.id];
  const opt=(map,v,allowNull)=>(allowNull?`<option value="">—</option>`:"")+Object.entries(map).map(([k,l])=>`<option value="${k}" ${k===v?"selected":""}>${l}</option>`).join("");
  const counteredBy=TACTICS.filter(X=>X.counters[T.id]).map(X=>`${X.name} +${Math.round(X.counters[T.id]*100)}%`).join("、")||"无";
  $("#t-detail").innerHTML=`<h3>${T.name}<small>${T.code} · ${T.cat}</small></h3>
    <div class="tgrid">
      <label>适用度修正<input type="number" step="0.05" data-f="bias" value="${T.bias}" class="${T.bias!==D.bias?"chg":""}"></label>
      <label>统帅门槛<input type="number" step="5" min="0" max="100" data-f="minCmd" value="${T.minCmd}" class="${T.minCmd!==D.minCmd?"chg":""}"></label>
      <label>智略门槛<input type="number" step="5" min="0" max="100" data-f="minInt" value="${T.minInt||0}" class="${(T.minInt||0)!==(D.minInt||0)?"chg":""}"></label>
    </div>
    <div><div class="lbl" style="margin-bottom:4px">战术效果（执行期间本方倍率，1 为无变化）</div><div class="tgrid">${MOD_KEYS.map(([k,l])=>`<label>${l}<input type="number" step="0.05" min="0" data-m="${k}" value="${T.mods[k]}" class="${T.mods[k]!==D.mods[k]?"chg":""}"></label>`).join("")}</div></div>
    <div><div class="lbl" style="margin-bottom:4px">对敌效果（执行期间敌方倍率，1 为无变化；如袭扰使敌体力消耗 ×1.25）</div><div class="tgrid">${MOD_KEYS.map(([k,l])=>`<label>敌${l}<input type="number" step="0.05" min="0" data-em="${k}" value="${(T.enMods||{})[k]??1}" class="${((T.enMods||{})[k]??1)!==((D.enMods||{})[k]??1)?"chg":""}"></label>`).join("")}</div></div>
    <div class="tcnt"><div class="lbl">克制（敌方正用此战术时，本方攻击与致组织伤 ×(1+值)）</div>
      ${Object.entries(T.counters).map(([id,v])=>`<div class="row2"><select data-cid="${id}">${TACTICS.filter(X=>X.id!==T.id).map(X=>`<option value="${X.id}" ${X.id===id?"selected":""}>${X.code} ${X.name}</option>`).join("")}</select><input type="number" step="0.05" min="0" data-cv="${id}" value="${v}"><button class="btn" data-cdel="${id}" style="padding:0" aria-label="删除">×</button></div>`).join("")||'<span class="note">尚无克制对象</span>'}
      <div><button class="btn" id="t-cadd" style="padding:1px 8px;font-size:12px">＋ 添加克制对象</button> <span class="note">被克制于：${counteredBy}</span></div></div>
    <div class="tph"><div class="lbl">阶段与命令（命令与进入条件均可改）</div>
      ${T.phases.map((ph,i)=>`<div class="pr"><span class="pn">${i+1}. ${ph.name}</span>
        <select data-pi="${i}" data-pk="stance" aria-label="姿态">${opt(ORDER_TEXT.stance,ph.o.stance)}<option value="bombard" ${ph.o.stance==="bombard"?"selected":""}>器械轰城</option></select>
        <select data-pi="${i}" data-pk="wings" aria-label="两翼">${opt(ORDER_TEXT.wings,ph.o.wings)}</select>
        <select data-pi="${i}" data-pk="reserve" aria-label="预备队">${opt(ORDER_TEXT.reserve,ph.o.reserve)}</select>
        <select data-pi="${i}" data-pk="focus" aria-label="集火">${opt(ORDER_TEXT.focus,ph.o.focus||"",true)}</select>
        <select data-pi="${i}" data-pk="lure" aria-label="计谋">${opt(ORDER_TEXT.lure,ph.o.lure||"",true)}</select>
        <span class="pchk">${[["screen","盾网"],["repair","抢修"],["fire","火箭"],["bait","弃辎重"]].map(([k,l])=>`<label><input type="checkbox" data-pi="${i}" data-pk="${k}" ${ph.o[k]?"checked":""}>${l}</label>`).join("")}</span>
        <div class="cond">${i===0?"进入条件：选定即执行":`进入条件（满足任一组即进入本阶段）：${condHTML(ph.cond||[],"p:"+i)}`}${ph.o.retreat?" · 全军撤出":""}</div></div>`).join("")}
    </div>
    <div class="tph"><div class="lbl">中止条件（按顺序检查，任一成立即放弃本战术，并以所填理由记入战报）</div><div class="ablist">
      ${(T.aborts||[]).map((a,j)=>`<div class="abitem"><div class="hd">理由<input type="text" data-abr="${j}" value="${(a.r||"").replace(/"/g,"&quot;")}"><button class="cbtn" data-cact="delab" data-j="${j}">删除</button></div>${condHTML(a.c||[],"ab:"+j)}</div>`).join("")||'<span class="note">无（一旦选定，除非形势重评换战术）</span>'}
      <div><button class="cbtn" data-cact="addab">＋ 中止条件</button></div></div></div>
    <div class="tph"><div class="lbl">适用度加成（条件成立时 AI 评估本战术 +值，可为负）</div><div class="ablist">
      ${(T.boosts||[]).map((a,j)=>`<div class="abitem"><div class="hd">加成<input type="number" step="0.05" data-bx="${j}" value="${a.x}" style="width:64px"><button class="cbtn" data-cact="delbo" data-j="${j}">删除</button></div>${condHTML(a.c||[],"bo:"+j)}</div>`).join("")}
      <div><button class="cbtn" data-cact="addbo">＋ 适用度加成</button></div></div></div>`;
  const keys=TACTICS.map(X=>X.id);
  $("#t-matrix").innerHTML=`<table><thead><tr><th></th>${TACTICS.map(X=>`<th title="${X.name}">${X.code}</th>`).join("")}</tr></thead><tbody>${TACTICS.map(X=>`<tr><th title="${X.name}">${X.code} ${X.name}</th>${keys.map(k=>{ const v=X.counters[k]; return `<td style="${v?`background:color-mix(in srgb,var(--good,#3f6b2a) ${Math.min(80,v*200)}%,transparent);color:${v>=0.2?"#fff":"inherit"}`:""}">${v?Math.round(v*100):""}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`;
}
/* 条件编辑器 */
function condHTML(cond,path){
  const atomSel=a=>`<select data-cp="${path}" data-cf="k">${Object.entries(COND_ATOMS).map(([k,d])=>`<option value="${k}" ${k===a.k?"selected":""}>${d.l}</option>`).join("")}</select>`;
  const valIn=a=>{ const t=(COND_ATOMS[a.k]||{}).t; if(t==="flag") return `<select data-cp="${path}" data-cf="v">${COND_FLAGS.map(f=>`<option ${f===a.v?"selected":""}>${f}</option>`).join("")}</select>`;
    if(t==="tactic") return `<select data-cp="${path}" data-cf="v">${TACTICS.map(X=>`<option value="${X.id}" ${X.id===a.v?"selected":""}>${X.name}</option>`).join("")}</select>`;
    if(t==="n"||t==="x") return `<input type="number" step="${t==="n"?1:0.05}" data-cp="${path}" data-cf="v" value="${a.v??0}">`; return ""; };
  return `<div class="ced">${(cond||[]).map((g,gi)=>`${gi?'<span class="cor">或者</span>':""}<div class="cgrp">${g.map((a,ai)=>`<div class="cat" data-g="${gi}" data-a="${ai}">${ai?'<span class="cor">且</span>':""}<label title="取反"><input type="checkbox" data-cp="${path}" data-cf="not" ${a.not?"checked":""}>非</label>${atomSel(a)}${valIn(a)}<button class="cbtn" data-cp="${path}" data-cact="del">×</button></div>`).join("")}<div><button class="cbtn" data-cp="${path}" data-cact="and" data-g="${gi}">＋且</button></div></div>`).join("")}<div><button class="cbtn" data-cp="${path}" data-cact="or">＋或者（新条件组）</button></div></div>`; }
function condRef(T,path){ const [t,i]=path.split(":"); const n=+i;
  if(t==="p"){ const ph=T.phases[n]; if(!ph.cond) ph.cond=[]; if(!ph.when) ph.when=(s,v,c)=>evalCond(ph.cond,s,v,c); return ph.cond; }
  if(t==="ab") return T.aborts[n].c=T.aborts[n].c||[]; return T.boosts[n].c=T.boosts[n].c||[]; }
const newAtom=()=>({k:"flag",v:"敌阵动摇",not:false});
function ensureAbort(T){ if(!T.aborts) T.aborts=[]; if(!T.boosts) T.boosts=[]; T.abort=(s,v,c)=>{ for(const a of T.aborts) if(evalCond(a.c,s,v,c)) return a.r||"中止条件成立"; return null; }; }
document.querySelector("#v-tactics").addEventListener("click",e=>{
  const cb=e.target.closest("[data-cact]"); if(cb){ const T=TACTIC_BY_ID[tSel]; ensureAbort(T); const act=cb.dataset.cact;
    if(act==="addab") T.aborts.push({c:[[newAtom()]],r:"新的中止条件"}); else if(act==="delab") T.aborts.splice(+cb.dataset.j,1);
    else if(act==="addbo") T.boosts.push({c:[[newAtom()]],x:0.2}); else if(act==="delbo") T.boosts.splice(+cb.dataset.j,1);
    else { const C=condRef(T,cb.dataset.cp); if(act==="or") C.push([newAtom()]); else if(act==="and") C[+cb.dataset.g].push(newAtom());
      else if(act==="del"){ const at=cb.closest(".cat"); const g=+at.dataset.g, a=+at.dataset.a; C[g].splice(a,1); if(!C[g].length) C.splice(g,1); } }
    saveTactics(); buildTactics(); return; }
  const en=e.target.closest("[data-en]"); if(en){ TACTIC_BY_ID[en.dataset.en].enabled=en.checked; saveTactics(); buildTactics(); return; }
  const it=e.target.closest(".ti"); if(it){ tSel=it.dataset.id; buildTactics(); return; }
  const del=e.target.closest("[data-cdel]"); if(del){ delete TACTIC_BY_ID[tSel].counters[del.dataset.cdel]; saveTactics(); buildTactics(); return; }
  if(e.target.id==="t-cadd"){ const T=TACTIC_BY_ID[tSel]; const free=TACTICS.find(X=>X.id!==T.id&&!(X.id in T.counters)); if(free){ T.counters[free.id]=0.1; saveTactics(); buildTactics(); } return; }
  if(e.target.id==="t-reset"){ tacticsReset(); saveTactics(); buildTactics(); return; }
});
document.querySelector("#v-tactics").addEventListener("change",e=>{
  const T=TACTIC_BY_ID[tSel]; const t=e.target;
  if(t.id==="t-cw"){ const v=parseFloat(t.value); if(isFinite(v)) T_COUNTER_WEIGHT=v; }
  else if(t.dataset.f){ const v=parseFloat(t.value); if(isFinite(v)) T[t.dataset.f]=v; }
  else if(t.dataset.m){ const v=parseFloat(t.value); if(isFinite(v)) T.mods[t.dataset.m]=v; }
  else if(t.dataset.em){ const v=parseFloat(t.value); if(isFinite(v)){ T.enMods=T.enMods||{}; T.enMods[t.dataset.em]=v; } }
  else if(t.dataset.cv){ const v=parseFloat(t.value); if(isFinite(v)) T.counters[t.dataset.cv]=v; }
  else if(t.dataset.cid){ const old=t.dataset.cid, nv=t.value; if(nv!==old&&!(nv in T.counters)){ T.counters[nv]=T.counters[old]; delete T.counters[old]; } }
  else if(t.dataset.cp){ const C=condRef(T,t.dataset.cp); const at=t.closest(".cat"); const a=C[+at.dataset.g][+at.dataset.a]; const f=t.dataset.cf;
    if(f==="not") a.not=t.checked; else if(f==="k"){ a.k=t.value; const ty=(COND_ATOMS[a.k]||{}).t; a.v=ty==="flag"?COND_FLAGS[0]:ty==="tactic"?TACTICS[0].id:(ty?0:null); } else { const ty=(COND_ATOMS[a.k]||{}).t; a.v=(ty==="n"||ty==="x")?parseFloat(t.value)||0:t.value; } }
  else if(t.dataset.abr!=null){ ensureAbort(T); T.aborts[+t.dataset.abr].r=t.value; }
  else if(t.dataset.bx!=null){ ensureAbort(T); const v=parseFloat(t.value); if(isFinite(v)) T.boosts[+t.dataset.bx].x=v; }
  else if(t.dataset.pk){ const ph=T.phases[+t.dataset.pi]; ph.o={...ph.o,[t.dataset.pk]:t.type==="checkbox"?t.checked:(t.value||null)}; }
  else return;
  saveTactics(); buildTactics();
});
buildTactics();
$("#b-defaults").onclick=()=>{ Object.assign(P,DEFAULT_P); for(const k in DEFAULT_FORM) FORM[k]=JSON.parse(JSON.stringify(DEFAULT_FORM[k])); for(const k in DEFAULT_STATUS) STATUS[k]=JSON.parse(JSON.stringify(DEFAULT_STATUS[k])); for(const k in DEFAULT_UNITS) Object.assign(UT[k],DEFAULT_UNITS[k]); for(const k in DEFAULT_TERRAIN) Object.assign(TERRAIN[k],DEFAULT_TERRAIN[k]); saveRules(); buildRules(); syncSetup(); resetBattle(); };

buildSetup(); syncSetup(); buildRules(); resetBattle();
