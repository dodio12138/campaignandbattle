/* 战术 AI：条件 DSL、战术库、主将性格与智略
   脚本以全局作用域加载（浏览器 <script> 或 tools/load.js 的 vm 上下文），加载顺序见 tools/load.js。 */
/* ================= 战术层：形势判定 → 战术选择 → 命令下达 =================
   - 不改战斗结算。战术只输出一组"命令"（姿态 / 两翼 / 预备队 / 集火 / 撤退），由各引擎适配层执行。
   - 只用本方可感知的信息：敌军兵力为估计值（统帅越低误差越大），敌军组织度只能从"动摇/溃散"的外在表现推断。
   - 战术是多阶段流程：每阶段有进入条件；任一时刻可因中止条件被放弃并重新决策。
*/
const T_PERSONA = {
  "均衡":{atk:0,    def:0,    risk:0,    guile:0,    desc:"按形势取舍"},
  "进取":{atk:0.25, def:-0.15,risk:0.25, guile:0,    desc:"偏好强攻与追击，不轻易撤"},
  "谨慎":{atk:-0.15,def:0.25, risk:-0.25,guile:0,    desc:"偏好坚守，劣势时早撤，不深追"},
  "诡诈":{atk:0,    def:0,    risk:0.1,  guile:0.35, desc:"偏好佯攻、诈败、袭扰"},
};
const T_EVAL_EVERY = 3;        // 每 3 回合重新评估一次
const T_INERTIA = 0.18;        // 维持当前战术的惯性

/* 命令：所有适配层只需理解这 6 个字段 */
function defaultOrders(v){ return { stance: v.isDefender?"hold":"advance", wings:"flank", reserve:"rotate", focus:null, retreat:false, screen:false, repair:false, fire:false, lure:null, bait:false }; }
const ORDER_TEXT = {
  stance:{advance:"推进",assault:"强攻",hold:"固守",probe:"试攻",feign:"佯败后撤"},
  wings:{flank:"翼骑侧击",hold:"翼骑待命",screen:"翼骑护翼",raid:"轻骑袭扰",pursue:"骑兵追击"},
  reserve:{rotate:"按需轮换",aggressive_rotate:"勤换防",keep:"预备不动",commit:"预备全投",guard:"预备护翼"},
  focus:{weakest:"集火最弱",general:"直扑中军"},
  lure:{retreat:"佯退诱敌",taunt:"骂阵激将",challenge:"下书约战"},
};
function ordersText(o){ return [ORDER_TEXT.stance[o.stance],ORDER_TEXT.wings[o.wings],ORDER_TEXT.reserve[o.reserve],o.focus?ORDER_TEXT.focus[o.focus]:null,o.retreat?"全军撤出":null,o.screen?"张设盾网":null,o.repair?"抢修工事":null,o.fire?"火箭焚垒":null,o.lure?ORDER_TEXT.lure[o.lure]:null,o.bait?"弃辎重于道":null].filter(Boolean).join(" · "); }

/* ───────── 形势判定 ───────── */
function s0rangedEdge(v){ return (v.me.ranged-v.en.ranged)/Math.max(1,v.me.ranged+v.en.ranged); }
const LABELS=["崩溃边缘","危局","劣势","均势","优势","压倒优势"];
function assess(v){
  const me=v.me, en=v.en;
  const vis=x=>Math.max(0.15,0.95-0.6*x.wavering-0.6*x.routedShare);       // 外在可见的"阵形完整度"
  const P=(me.men*vis(me))/Math.max(1,en.menEst*vis(en));
  const cavEdge=(me.cavPow-en.cavPow)/Math.max(1,me.cavPow+en.cavPow);
  const rangedEdge=(me.ranged-en.ranged)/Math.max(1,me.ranged+en.ranged);
  const frontEdge=me.frontWidth-en.frontWidth;
  const cmdDiff=(me.cmd-en.cmd)/100;
  const trend=me.orgTrend-en.orgTrend;                                        // 每回合组织度变化差
  let score=Math.log(P)*1.1+trend*5+cmdDiff*0.5+(v.isDefender?v.terrain.defBonus*0.3:0);
  let li = score>0.6?5: score>0.2?4: score>-0.2?3: score>-0.6?2: 1;
  if((me.orgAvg<0.33||me.routedShare>0.45)&&score<-0.1) li=0;          // 自身将崩且明显劣于对方（两败俱伤时不轻言撤）
  const flags=new Set();
  if(en.cavFresh>0&&(me.flankGuard<0.45||frontEdge<=-2)) flags.add("侧翼受威胁");
  if((me.cavFresh>0&&en.cavFresh===0&&v.terrain.wing>0)||frontEdge>=2) flags.add("敌侧可乘");
  if(en.reservesInit>0&&en.reserves===0) flags.add("敌预备已尽");
  if(en.wavering>=0.3||en.routedShare>=0.25) flags.add("敌阵动摇");
  if(me.wavering>=0.35) flags.add("我阵动摇");
  if(en.pursuing) flags.add("敌军追击脱节");
  if(en.retreating) flags.add("敌军后撤");
  if(v.dayLeft<0.2) flags.add("日暮将至");
  if(!v.contact&&v.idleRounds>=8) flags.add("久峙不决");
  const w=v.works;
  if(w){ if(w.enWall>0.6) flags.add("城墙完好"); else if(w.enWall>0&&w.enWall<0.4) flags.add("城墙残破");
    if(w.enFort>=0.8||w.enWall>0) flags.add("敌据坚垒"); if(w.myFort>=0.8||w.myWall>0) flags.add("我据工事");
    if(w.myFood!=null&&w.myFood<=1) flags.add("存粮将尽"); if(w.failDays>=2) flags.add("久攻不下");
    if(v.me.woundedShare>0.06) flags.add("伤兵众多");
    if((w.myFortMax>0&&w.myFortI<0.7)||(w.myWall>0&&w.myWall<0.7)) flags.add("工事破损");
    if((w.myFoothold||0)>=0.4) flags.add("敌军登城"); if((w.enFoothold||0)>=0.4) flags.add("已登城头");
    if(["FIRE","BOMBARD","HARASS"].includes(v.enTactic)||(!v.contact&&s0rangedEdge(v)<-0.2&&(w.myFort>0||w.myWall>0))) flags.add("箭雨压制"); }
  if(!en.generalAlive) flags.add("敌主将已退");
  if(!me.generalAlive) flags.add("我主将已退");
  if(en.routedShare>=0.35&&en.wavering>=0.3) flags.add("敌将崩溃");
  const stage=!v.contact?"接敌前":(flags.has("敌将崩溃")?"敌军将溃":(li<=1?"我军危急":(v.contactRounds<4?"初接":"相持")));
  return {score,label:LABELS[li],li,stage,flags,P,cavEdge,rangedEdge,frontEdge,cmdDiff,trend};
}

/* ───────── 战术库（战斗层，14 种） ─────────
   need: 前提（true 或不满足的原因）  score: 适用度  phases: 阶段  abort: 中止条件  */
const has=(s,f)=>s.flags.has(f);
const TACTICS=[
 {id:"FRONTAL",code:"B01",name:"正面强攻",cat:"进攻",
  score:(s,v,p)=>0.3+s.score*0.7+p.atk+(v.isDefender?-0.45:0.1)-(v.isDefender?0:v.terrain.defBonus*0.4),
  phases:[{name:"全线推进",o:{stance:"advance",wings:"flank",reserve:"rotate"}},
          {name:"压上预备",when:s=>has(s,"敌阵动摇"),o:{stance:"assault",wings:"flank",reserve:"commit"}}],
  abort:s=>s.li<=1?"攻势受挫":null},
 {id:"HOLD",code:"C01",name:"坚守",cat:"防御",
  score:(s,v,p)=>0.2+(v.isDefender?0.45:0)+v.terrain.defBonus*0.5+Math.min(0.3,-s.score*0.45)+p.def+(has(s,"日暮将至")&&s.li>=3?0.2:0)+(!v.contact&&s.rangedEdge>0.2?0.15:0)-(has(s,"久峙不决")&&!v.isDefender&&s.score>=-0.05?0.45:0)-(s.li<=1&&s.trend<0&&v.contactRounds>=3?0.5:0),
  phases:[{name:"结阵固守",o:{stance:"hold",wings:"screen",reserve:"rotate"}},
          {name:"敌登城头·预备上城",when:s=>has(s,"敌军登城"),o:{stance:"hold",wings:"screen",reserve:"commit"}}],
  abort:s=>s.li===0?"阵线将破":null},
 {id:"FLANK",code:"A01",name:"侧翼包抄",cat:"机动",
  need:v=>(v.me.cavFresh>0&&v.terrain.wing>0)||v.me.frontWidth-v.en.frontWidth>=2||"无可迂回的机动兵力",
  score:(s,v,p)=>0.25+s.cavEdge*0.6+Math.max(0,s.frontEdge)*0.06+(has(s,"敌侧可乘")?0.3:0)+s.score*0.3+p.atk*0.5,
  phases:[{name:"正面牵制·翼骑待发",o:{stance:"advance",wings:"hold",reserve:"rotate"}},
          {name:"翼骑迂回侧击",when:(s,v,c)=>v.contact&&c.phaseT>=1,o:{stance:"advance",wings:"flank",reserve:"guard"}},
          {name:"扩大战果",when:s=>has(s,"敌阵动摇"),o:{stance:"assault",wings:"flank",reserve:"commit"}}],
  abort:(s,v)=>(v.me.cavFresh===0&&s.frontEdge<1)?"机动兵力耗尽":(s.li<=1?"正面不支":null)},
 {id:"ENVELOP",code:"A02",name:"双翼合击",cat:"机动",
  need:v=>(v.me.cav>=2&&v.terrain.wing>0)||"两翼骑兵不足",
  score:(s,v,p)=>0.05+s.cavEdge*0.7+Math.max(0,s.frontEdge)*0.08+(s.li>=4?0.3:-0.3)+p.atk*0.5,
  phases:[{name:"中央牵制",o:{stance:"advance",wings:"hold",reserve:"rotate"}},
          {name:"两翼合围",when:(s,v)=>v.contact,o:{stance:"advance",wings:"flank",reserve:"commit"}}],
  abort:s=>s.li<=2?"兵力不足以合围":null},
 {id:"BREAK",code:"B02",name:"集中突破",cat:"进攻",
  score:(s,v,p)=>0.12+(has(s,"敌阵动摇")?0.35:0)+s.cmdDiff*0.6+s.score*0.4+p.atk*0.6+(v.me.reserves>=2?0.12:0),
  phases:[{name:"择点施压",o:{stance:"advance",wings:"flank",reserve:"rotate",focus:"weakest"}},
          {name:"预备压上·直扑中军",when:(s,v,c)=>v.contact&&c.phaseT>=2,o:{stance:"assault",wings:"flank",reserve:"commit",focus:"general"}}],
  abort:s=>s.li<=1?"突破受阻":null},
 {id:"RESERVE",code:"B07",name:"预备队决胜",cat:"进攻",
  need:v=>v.me.reserves>=2||"预备队不足两部",
  score:(s,v,p)=>0.2+s.cmdDiff*0.4+(v.me.reserves>=3?0.2:0)-Math.abs(s.score)*0.25+p.def*0.3,
  phases:[{name:"主力接战·预备待机",o:{stance:"advance",wings:"hold",reserve:"keep"}},
          {name:"投入预备决胜",when:s=>has(s,"敌阵动摇")||has(s,"敌预备已尽")||has(s,"我阵动摇"),o:{stance:"assault",wings:"flank",reserve:"commit",focus:"weakest"}}],
  abort:s=>s.li===0?"主力崩溃":null},
 {id:"FEINT",code:"D01",name:"佯攻",cat:"欺骗",
  need:v=>true,
  score:(s,v,p)=>-0.2+p.guile+((v.me.int??60)-(v.en.int??60))/100*0.5+(Math.abs(s.score)<0.25?0.15:-0.2)+(v.en.reserves>=2?0.15:-0.35)+(v.contact?-0.15:0.05),
  phases:[{name:"试攻诱敌",o:{stance:"probe",wings:"hold",reserve:"keep"},enter:(v,c)=>{c.mem.enRes0=v.en.reserves;}},
          {name:"敌预备已动·转入主攻",when:(s,v,c)=>v.en.reserves<c.mem.enRes0||c.phaseT>=4,o:{stance:"assault",wings:"flank",reserve:"commit",focus:"weakest"}}],
  abort:s=>s.li<=1?"试攻反遭重创":null},
 {id:"FEIGN",code:"D02",name:"诈败",cat:"欺骗",
  need:v=>v.me.cavFresh>0||"需有可用骑兵接应反击",
  score:(s,v,p)=>-0.08+p.guile*1.2+((v.me.int??60)-(v.en.int??60))/100*0.5+p.risk*0.3+(s.cavEdge>0?0.2:0)+(v.me.orgAvg>0.6?0.1:-0.6)+(v.contact?0.1:-0.25),
  phases:[{name:"接战",o:{stance:"advance",wings:"hold",reserve:"rotate"}},
          {name:"佯败后撤",when:(s,v,c)=>v.contact&&c.phaseT>=2,o:{stance:"feign",wings:"hold",reserve:"keep"}},
          {name:"回身反击",when:(s,v,c)=>has(s,"敌军追击脱节")||c.phaseT>=3,o:{stance:"assault",wings:"flank",reserve:"commit"}}],
  abort:(s,v,c)=>c.phase===1&&v.me.orgAvg<0.42?"诈败弄假成真":(c.phase===2&&!c.mem.lured&&c.phaseT===0&&!has(s,"敌军追击脱节")?null:null)},
 {id:"ELASTIC",code:"C04",name:"弹性防御",cat:"防御",
  need:v=>v.me.reserves>=1||"无预备队可轮替",
  score:(s,v,p)=>0.08+(v.isDefender?0.25:0)+Math.min(0.2,-s.score*0.3)+p.def*0.6+(v.me.reserves>=2?0.15:0),
  phases:[{name:"轮替消耗",o:{stance:"hold",wings:"screen",reserve:"aggressive_rotate"}},
          {name:"转守为攻",when:s=>has(s,"敌阵动摇")||s.trend>0.03,o:{stance:"advance",wings:"flank",reserve:"commit"}}],
  abort:s=>s.li===0?"防线崩溃":null},
 {id:"REFUSE",code:"C06",name:"拒止侧翼",cat:"防御",
  need:(v,s)=>has(s,"侧翼受威胁")||"侧翼没有威胁",
  score:(s,v,p)=>0.3+0.35-s.cavEdge*0.3+p.def*0.4,
  phases:[{name:"预备护翼",o:{stance:"hold",wings:"screen",reserve:"guard"}}],
  abort:s=>!has(s,"侧翼受威胁")?"侧翼威胁解除":null},
 {id:"COUNTER",code:"C07",name:"反冲击",cat:"防御",
  need:(v,s)=>(v.contact&&(has(s,"敌阵动摇")||s.trend>0.02))||"敌攻势尚未受挫",
  score:(s,v,p)=>0.05+(has(s,"敌阵动摇")?0.45:0)+(s.trend>0.02?0.2:0)+(v.me.reserves>=1?0.15:0)+p.atk*0.3+(v.isDefender?0.1:0),
  phases:[{name:"出阵反冲",o:{stance:"assault",wings:"flank",reserve:"commit",focus:"weakest"}}],
  abort:s=>s.li<=1?"反冲受挫":null},
 {id:"RETREAT",code:"G04",name:"掩护撤退",cat:"脱离",
  score:(s,v,p)=>-1.0+(s.li===1&&s.trend<0&&v.contactRounds>=3?0.85:0)+(s.li===0?1.3:0)-p.risk*1.0+p.def*1.0+(has(s,"我阵动摇")?0.15:0)+(has(s,"我主将已退")?0.15:0),
  final:true,   // 撤退一经下令不再改变
  phases:[{name:"后卫阻击·主力撤出",o:{stance:"hold",wings:"screen",reserve:"guard",retreat:true}}]},
 {id:"PURSUE",code:"G01",name:"全力追击",cat:"追击",
  score:(s,v,p)=>-0.35+(has(s,"敌将崩溃")?0.7:0)+(has(s,"敌军后撤")?0.45:0)+(has(s,"敌阵动摇")?0.15:0)+p.atk*0.5+p.risk*0.4,
  phases:[{name:"追亡逐北",o:{stance:"assault",wings:"pursue",reserve:"commit"}}],
  abort:s=>s.li<=1?"追击遭反扑":null},
 {id:"HARASS",code:"H05",name:"轻骑袭扰",cat:"消耗",
  need:v=>(v.me.lightCav>=1&&v.terrain.wing>0)||"无轻骑或无两翼空间",
  score:(s,v,p)=>0.02+(v.contact?-0.15:0.25)+s.cavEdge*0.3+p.guile*0.5+(s.score<0?0.15:0)+(s.rangedEdge<0?0.1:0),
  phases:[{name:"轻骑袭扰·步阵待机",o:{stance:"hold",wings:"raid",reserve:"rotate"}},
          {name:"袭扰得手·全线压上",when:(s,v,c)=>has(s,"敌阵动摇")||c.phaseT>=6||(has(s,"久峙不决")&&s.score>0),o:{stance:"advance",wings:"flank",reserve:"rotate"}}],
  abort:(s,v)=>v.contact&&v.contactRounds>=3?"已全线接敌":null},
];
TACTICS.push(
 {id:"BOMBARD",code:"E06",name:"器械攻城",cat:"攻城",
  need:v=>(v.works&&(v.works.enWall>0||v.works.enFort>0.5)&&v.works.myEngines>0)||"无攻城器械或无城垒可攻",
  score:(s,v,p)=>v.works.enWall>0?0.1+v.works.enWall*0.5+Math.min(4,v.works.myEngines)*0.12+p.def*0.2:0.1+v.works.enFortI*0.35+v.works.myEngines*0.06+p.def*0.2,
  phases:[{name:"器械轰城",o:{stance:"bombard",wings:"hold",reserve:"rotate"}},
          {name:"城垒已破·蚁附强攻",when:(s,v)=>v.works.enWall>0?v.works.enWall<0.35:v.works.enFortI<0.4,o:{stance:"assault",wings:"hold",reserve:"commit"}}],
  abort:s=>s.li<=1?"攻城部队受挫":null},
 {id:"ESCALADE",code:"E01",name:"蚁附攻城",cat:"攻城",
  need:v=>(v.works&&v.works.enWall>0)||"无城可攻",
  score:(s,v,p)=>0.1+(1-v.works.enWall)*0.9-v.works.enWall*0.35+p.atk*0.5+s.score*0.3+(has(s,"已登城头")?0.4:0),
  phases:[{name:"云梯蚁附",o:{stance:"assault",wings:"hold",reserve:"aggressive_rotate"}}],
  abort:s=>s.li<=1?"登城受挫":null},
 {id:"SORTIE",code:"E09",name:"出城突击",cat:"守城",
  need:v=>(v.works&&v.works.myWall>0)||"不在城中",
  score:(s,v,p)=>-0.25+(v.works.enEngines>=2?0.3:0)+p.atk*0.4+(s.score>0?0.25:-0.2),
  phases:[{name:"开门出击",o:{stance:"assault",wings:"flank",reserve:"keep"}},
          {name:"收兵回城",when:(s,v,c)=>c.phaseT>=4||s.li<=2,o:{stance:"hold",wings:"screen",reserve:"rotate"}}]});
TACTICS.push(
 {id:"SHIELD",code:"C09",name:"张设盾网",cat:"防御",
  need:v=>(v.works&&(v.works.myFort>0.2||v.works.myWall>0))||"无工事可张网",
  score:(s,v,p)=>-0.1+(has(s,"箭雨压制")?0.5:0)+Math.max(0,-s.rangedEdge)*0.6+(v.contact?-0.3:0)+p.def*0.3,
  phases:[{name:"张网避矢",o:{stance:"hold",wings:"screen",reserve:"rotate",screen:true}}],
  abort:(s,v)=>v.contact&&v.contactRounds>=3&&!has(s,"箭雨压制")?"敌已近身，收网迎战":null},
 {id:"REPAIR",code:"C10",name:"抢修工事",cat:"防御",
  need:v=>(v.works&&((v.works.myFortMax>0&&v.works.myFortI<0.9)||(v.works.myWall>0&&v.works.myWall<0.9)))||"工事完好",
  score:(s,v,p)=>0.0+(1-Math.min(v.works.myFortMax>0?v.works.myFortI:1,v.works.myWall>0?v.works.myWall:1))*1.2+p.def*0.3-(v.contact&&v.contactRounds>2?0.25:0),
  phases:[{name:"预备抢修",o:{stance:"hold",wings:"screen",reserve:"keep",repair:true}},
          {name:"盾网护修",when:s=>has(s,"箭雨压制"),o:{stance:"hold",wings:"screen",reserve:"keep",repair:true,screen:true}}],
  abort:(s,v)=>(v.works.myFortMax>0?v.works.myFortI:1)>=0.98&&(v.works.myWall>0?v.works.myWall:1)>=0.98?"工事已修复":null},
 {id:"FIRE",code:"E07",name:"火箭焚垒",cat:"攻城",
  need:v=>(v.weather==="雨"?"雨天无法纵火":true)===true&&(v.works&&v.works.enFort>0.3&&v.me.ranged>0)||(v.weather==="雨"?"雨天无法纵火":"无可焚之营垒或无弓弩（城墙不受火）"),
  score:(s,v,p)=>0.05+(v.works.enFort>0.8?0.3:0)+s.rangedEdge*0.5+p.guile*0.3+(v.contact?-0.2:0.1),
  phases:[{name:"火箭焚垒",o:{stance:"bombard",wings:"hold",reserve:"rotate",fire:true}},
          {name:"垒毁·全线强攻",when:(s,v)=>(v.works.enFortMax>0?v.works.enFortI<0.4:true)&&(v.works.enWall===0||v.works.enWall<0.4),o:{stance:"assault",wings:"flank",reserve:"commit"}}],
  abort:(s,v,c)=>s.li<=1?"焚垒未果，攻势受挫":(c.phase===0&&c.tacT>=10&&(v.works.enFortMax>0?v.works.enFortI:v.works.enWall)>0.7?"焚烧十回合无功，改换打法":null)});
TACTICS.push(
 {id:"LURE",code:"D03",name:"佯退诱敌",cat:"计谋",minInt:50,
  need:v=>(v.works&&(v.works.enWall>0||v.works.enFort>0.5)&&!v.works.myWall)||"敌未据城垒",
  score:(s,v,p)=>0.1+(v.me.int-v.en.int)/100*1.2+p.guile*0.8+(v.works.enWall>0.6?0.3:v.works.enFort>1?0.1:0)+Math.min(0.45,(v.works.failDays||0)*0.15)+(has(s,"久峙不决")?0.15:0)-(v.contact?0.6:0)-(v.works.lureSeen||0)*0.3+(v.en.rash||0)*0.6,
  phases:[{name:"佯作退兵·伏兵于后",o:{stance:"hold",wings:"hold",reserve:"keep",lure:"retreat"}},
          {name:"伏兵四起·截击出城之敌",when:(s,v)=>v.works.enLured>0,o:{stance:"assault",wings:"flank",reserve:"commit",focus:"weakest"}}],
  abort:(s,v,c)=>v.works.lureBlown?"佯退为敌所识破":(c.phase===0&&c.tacT>=9?"敌坚守不出，佯退无功":(c.phase===1&&!v.works.enLured&&c.phaseT>=2?"出城之敌已退回城中":null))},
 {id:"TAUNT",code:"D04",name:"激怒骂阵",cat:"计谋",minInt:35,
  need:v=>(v.works&&(v.works.enWall>0||v.works.enFort>0.5)&&!v.works.myWall)||"敌未据城垒",
  score:(s,v,p)=>0.0+(v.me.int-v.en.int)/100*0.8+p.guile*0.4+p.atk*0.2+(v.en.rash||0)*1.4+(v.works.enWall>0.6?0.3:0.05)+Math.min(0.3,(v.works.failDays||0)*0.1)+(has(s,"久峙不决")?0.1:0)-(v.contact?0.6:0)-(v.works.lureSeen||0)*0.3,
  phases:[{name:"城下骂阵·辱其主将",o:{stance:"hold",wings:"hold",reserve:"keep",lure:"taunt"}},
          {name:"敌怒而出·迎头痛击",when:(s,v)=>v.works.enLured>0,o:{stance:"assault",wings:"flank",reserve:"commit"}}],
  abort:(s,v,c)=>v.works.lureBlown?"敌将不为所动":(c.phase===0&&c.tacT>=10?"骂阵终日，敌不出城":(c.phase===1&&!v.works.enLured&&c.phaseT>=2?"出城之敌已退回城中":null))},
 {id:"CHALLENGE",code:"D05",name:"下书约战",cat:"计谋",
  need:v=>(v.works&&(v.works.enWall>0||v.works.enFort>0.5)&&!v.works.myWall)||"敌未据城垒",
  score:(s,v,p)=>-0.3+(v.works.enWall>0.6?0.3:0.1)+Math.min(0.4,s.score*0.4)+p.atk*0.3+(v.en.rash||0)*0.6-(v.contact?0.6:0),
  phases:[{name:"列阵城下·遣使下书",o:{stance:"hold",wings:"hold",reserve:"rotate",lure:"challenge"}},
          {name:"敌已应战·列阵决战",when:(s,v)=>v.works.enLured>0,o:{stance:"advance",wings:"flank",reserve:"rotate"}}],
  abort:(s,v,c)=>c.phase===0&&c.tacT>=8?"敌拒不应战":(c.phase===1&&!v.works.enLured&&c.phaseT>=2?"敌已收兵回城":null)});
TACTICS.push(
 {id:"RAIDSUP",code:"M01",name:"焚粮突袭",cat:"目标",
  need:v=>(v.en.supply>0)||"敌无辎重可焚",
  score:(s,v,p)=>-0.3+p.guile*0.2,
  phases:[{name:"轻骑绕后·纵火焚粮",o:{stance:"probe",wings:"raid",reserve:"keep"}},
          {name:"全军冲阵·直扑辎重",o:{stance:"assault",wings:"raid",reserve:"commit"}}],
  abort:null},
 {id:"HOLDTIME",code:"M02",name:"坚守待时",cat:"目标",
  score:(s,v,p)=>-0.2+p.def*0.3,
  phases:[{name:"据守不出·节省兵力",o:{stance:"hold",wings:"screen",reserve:"rotate"}}],
  abort:null},
 {id:"ESCORT",code:"M03",name:"护卫辎重",cat:"目标",
  need:v=>(v.me.supply>0)||"无辎重可护",
  score:(s,v,p)=>-0.2+p.def*0.3,
  phases:[{name:"结阵护粮·翼骑护卫",o:{stance:"hold",wings:"screen",reserve:"guard"}}],
  abort:null},
 {id:"BAIT",code:"D06",name:"弃辎重诱敌",cat:"计谋",minInt:70,
  need:v=>(v.me.cavFresh>0&&!(v.works&&(v.works.myWall>0||v.works.enWall>0)))||"需有骑兵反击，且非攻守城",
  score:(s,v,p)=>-0.35+((v.me.int??60)-(v.en.int??60))/100*1.2+p.guile*0.8+(s.score<0?0.35:0)+(v.en.rash||0)*0.8+(s.cavEdge<0?0.1:0)+(v.contact?-0.1:0.1)-(v.works&&v.works.baitSeen?1:0),
  phases:[{name:"弃辎重马匹于道·佯作溃走",o:{stance:"feign",wings:"hold",reserve:"keep",bait:true}},
          {name:"上马·纵兵反击",when:(s,v,c)=>(v.en.looting||0)>0||(has(s,"敌军追击脱节")&&c.phaseT>=3),o:{stance:"assault",wings:"flank",reserve:"commit",focus:"general"}}],
  abort:(s,v,c)=>v.works&&v.works.baitSeen&&c.phase===0?"计为敌所识破":(c.phase===0&&v.me.orgAvg<0.4?"佯败弄假成真":(c.phase===0&&c.tacT>=8?"敌不来追":null))});
/* ───────── 条件语言：阶段进入条件 / 中止条件 / 适用度加成，均可在页面编辑 ─────────
   条件 = [[原子, 原子…], [原子…]]：组内"且"，组间"或"。原子 {k, v, not}。 */
const COND_MISSIONS={rout:"击溃敌军",destroy:"焚粮（毁敌辎重）",hold:"坚守",delay:"阻滞后撤",escort:"护粮"}; const COND_WEATHER=["晴","雨","大风","雾","雪","酷暑"];
const COND_FLAGS=["敌阵动摇","我阵动摇","敌预备已尽","敌侧可乘","侧翼受威胁","敌军追击脱节","敌军后撤","敌将崩溃","敌主将已退","我主将已退","日暮将至","久峙不决","久攻不下","伤兵众多","敌据坚垒","我据工事","工事破损","箭雨压制","城墙完好","城墙残破","敌军登城","已登城头","存粮将尽"];
const COND_ATOMS={
  flag:{l:"形势标志",t:"flag"}, contact:{l:"已接敌"}, contactR:{l:"接敌回合≥",t:"n"},
  phaseIs:{l:"处于第N阶段",t:"n"}, phaseT:{l:"本阶段回合≥",t:"n"}, tacT:{l:"本战术回合≥",t:"n"},
  liLE:{l:"形势等级≤（0崩溃…5压倒）",t:"n"}, liGE:{l:"形势等级≥",t:"n"}, scoreGT:{l:"形势分>",t:"x"}, trendGT:{l:"势头>",t:"x"},
  myOrgLT:{l:"我军组织度<",t:"x"}, myCavLE:{l:"我可用骑兵≤",t:"n"}, frontEdgeLT:{l:"正面宽度差<",t:"n"}, myResGE:{l:"我预备队≥",t:"n"},
  enResUsed:{l:"敌预备队已动用"}, enTactic:{l:"敌正用战术",t:"tactic"},
  enWorksLT:{l:"敌工事完好度<",t:"x"}, myWorksGE:{l:"我工事完好度≥",t:"x"},
  enLured:{l:"敌中计出城"}, enLooting:{l:"敌争抢辎重"}, lureBlown:{l:"我计被识破"}, baitSeen:{l:"弃辎重被识破"},
  dayLeftLT:{l:"今日剩余<",t:"x"}, dayGE:{l:"会战第N日≥",t:"n"},
  missionIs:{l:"本军目标是",t:"mission"}, enSupply:{l:"敌有辎重"}, burntGE:{l:"已焚敌辎重≥",t:"x"}, weatherIs:{l:"天气是",t:"weather"}, nightIs:{l:"夜战"},
};
const worksOf=(w,en)=>{ if(!w) return 1; if(en) return w.enWall>0?w.enWall:(w.enFortMax>0?w.enFortI:1); return Math.min(w.myFortMax>0?w.myFortI:1, w.myWall>0?w.myWall:1); };
function evalAtom(a,s,v,c){ const w=v.works||{}; let r=false; const n=+a.v;
  switch(a.k){
    case "flag": r=has(s,a.v); break; case "contact": r=!!v.contact; break; case "contactR": r=(v.contactRounds||0)>=n; break;
    case "phaseIs": r=c&&(c.phase+1)===n; break; case "phaseT": r=c&&c.phaseT>=n; break; case "tacT": r=c&&c.tacT>=n; break;
    case "liLE": r=s.li<=n; break; case "liGE": r=s.li>=n; break; case "scoreGT": r=s.score>n; break; case "trendGT": r=s.trend>n; break;
    case "myOrgLT": r=v.me.orgAvg<n; break; case "myCavLE": r=(v.me.cavFresh||0)<=n; break; case "frontEdgeLT": r=s.frontEdge<n; break; case "myResGE": r=(v.me.reserves||0)>=n; break;
    case "enResUsed": r=v.en.reserves<((c&&c.mem&&c.mem.enRes0!=null)?c.mem.enRes0:(v.en.reservesInit??v.en.reserves)); break;
    case "enTactic": r=v.enTactic===a.v; break;
    case "enWorksLT": r=worksOf(w,true)<n; break; case "myWorksGE": r=worksOf(w,false)>=n; break;
    case "enLured": r=(w.enLured||0)>0; break; case "enLooting": r=(v.en.looting||0)>0; break; case "lureBlown": r=!!w.lureBlown; break; case "baitSeen": r=!!w.baitSeen; break;
    case "dayLeftLT": r=(v.dayLeft??1)<n; break; case "dayGE": r=(v.day||1)>=n; break;
    case "missionIs": r=v.mission===a.v; break; case "enSupply": r=(v.en.supply||0)>0; break; case "burntGE": r=(v.burnt||0)>=n; break;
    case "weatherIs": r=v.weather===a.v; break; case "nightIs": r=!!v.night; break; }
  return a.not?!r:r; }
function evalCond(cond,s,v,c){ return !!(cond&&cond.length&&cond.some(g=>g&&g.length&&g.every(a=>evalAtom(a,s,v,c)))); }
const A=(k,v,not)=>({k,v,not:!!not}), F=f=>A("flag",f);
/* 目标导向：按本军目标调整各战术适用度（可在战术编辑中修改） */
const MI=m=>[[A("missionIs",m)]];
const T_BOOST_DEFAULTS={
  RAIDSUP:[{c:MI("destroy"),x:1.6}], HOLDTIME:[{c:MI("hold"),x:1.2},{c:MI("delay"),x:1.0}], ESCORT:[{c:MI("escort"),x:1.4}],
  FRONTAL:[{c:MI("destroy"),x:-0.6},{c:MI("hold"),x:-0.5},{c:MI("escort"),x:-0.5}], BREAK:[{c:MI("destroy"),x:-0.6},{c:MI("hold"),x:-0.5}], ENVELOP:[{c:MI("destroy"),x:-0.5}],
  RESERVE:[{c:MI("destroy"),x:-0.5}], PURSUE:[{c:MI("destroy"),x:-0.8},{c:MI("escort"),x:-0.6},{c:MI("hold"),x:-0.6}], COUNTER:[{c:MI("hold"),x:-0.2}],
  HOLD:[{c:MI("hold"),x:0.4},{c:MI("escort"),x:0.4}], ELASTIC:[{c:MI("delay"),x:0.5}], FLANK:[{c:MI("destroy"),x:-0.3}],
  BOMBARD:[{c:MI("destroy"),x:-0.8}], ESCALADE:[{c:MI("destroy"),x:-0.8}],
};
/* 默认：与原内置逻辑等价的条件 */
const T_COND_DEFAULTS={
  FRONTAL:{p:[null,[[F("敌阵动摇")]]], ab:[{c:[[A("liLE",1)]],r:"攻势受挫"}]},
  HOLD:{p:[null,[[F("敌军登城")]]], ab:[{c:[[A("liLE",0)]],r:"阵线将破"}]},
  FLANK:{p:[null,[[A("contact"),A("phaseT",1)]],[[F("敌阵动摇")]]], ab:[{c:[[A("myCavLE",0),A("frontEdgeLT",1)]],r:"机动兵力耗尽"},{c:[[A("liLE",1)]],r:"正面不支"}]},
  ENVELOP:{p:[null,[[A("contact")]]], ab:[{c:[[A("liLE",2)]],r:"兵力不足以合围"}]},
  BREAK:{p:[null,[[A("contact"),A("phaseT",2)]]], ab:[{c:[[A("liLE",1)]],r:"突破受阻"}]},
  RESERVE:{p:[null,[[F("敌阵动摇")],[F("敌预备已尽")],[F("我阵动摇")]]], ab:[{c:[[A("liLE",0)]],r:"主力崩溃"}]},
  FEINT:{p:[null,[[A("enResUsed")],[A("phaseT",4)]]], ab:[{c:[[A("liLE",1)]],r:"试攻反遭重创"}]},
  FEIGN:{p:[null,[[A("contact"),A("phaseT",2)]],[[F("敌军追击脱节")],[A("phaseT",3)]]], ab:[{c:[[A("phaseIs",2),A("myOrgLT",0.42)]],r:"诈败弄假成真"}]},
  ELASTIC:{p:[null,[[F("敌阵动摇")],[A("trendGT",0.03)]]], ab:[{c:[[A("liLE",0)]],r:"防线崩溃"}]},
  REFUSE:{p:[null], ab:[{c:[[A("flag","侧翼受威胁",true)]],r:"侧翼威胁解除"}]},
  COUNTER:{p:[null], ab:[{c:[[A("liLE",1)]],r:"反冲受挫"}]},
  RETREAT:{p:[null], ab:[]},
  PURSUE:{p:[null], ab:[{c:[[A("liLE",1)]],r:"追击遭反扑"}]},
  HARASS:{p:[null,[[F("敌阵动摇")],[A("phaseT",6)],[F("久峙不决"),A("scoreGT",0)]]], ab:[{c:[[A("contact"),A("contactR",3)]],r:"已全线接敌"}]},
  BOMBARD:{p:[null,[[A("enWorksLT",0.38)]]], ab:[{c:[[A("liLE",1)]],r:"攻城部队受挫"}]},
  ESCALADE:{p:[null], ab:[{c:[[A("liLE",1)]],r:"登城受挫"}]},
  SORTIE:{p:[null,[[A("phaseT",4)],[A("liLE",2)]]], ab:[]},
  SHIELD:{p:[null], ab:[{c:[[A("contact"),A("contactR",3),A("flag","箭雨压制",true)]],r:"敌已近身，收网迎战"}]},
  REPAIR:{p:[null,[[F("箭雨压制")]]], ab:[{c:[[A("myWorksGE",0.98)]],r:"工事已修复"}]},
  FIRE:{p:[null,[[A("enWorksLT",0.4)]]], ab:[{c:[[A("liLE",1)]],r:"焚垒未果，攻势受挫"},{c:[[A("phaseIs",1),A("tacT",10),A("enWorksLT",0.7,true)]],r:"焚烧十回合无功，改换打法"}]},
  LURE:{p:[null,[[A("enLured")]]], ab:[{c:[[A("lureBlown")]],r:"佯退为敌所识破"},{c:[[A("phaseIs",1),A("tacT",9)]],r:"敌坚守不出，佯退无功"},{c:[[A("phaseIs",2),A("enLured",0,true),A("phaseT",2)]],r:"出城之敌已退回城中"}]},
  TAUNT:{p:[null,[[A("enLured")]]], ab:[{c:[[A("lureBlown")]],r:"敌将不为所动"},{c:[[A("phaseIs",1),A("tacT",10)]],r:"骂阵终日，敌不出城"},{c:[[A("phaseIs",2),A("enLured",0,true),A("phaseT",2)]],r:"出城之敌已退回城中"}]},
  CHALLENGE:{p:[null,[[A("enLured")]]], ab:[{c:[[A("phaseIs",1),A("tacT",8)]],r:"敌拒不应战"},{c:[[A("phaseIs",2),A("enLured",0,true),A("phaseT",2)]],r:"敌已收兵回城"}]},
  RAIDSUP:{p:[null,[[A("contact")],[A("phaseT",3)]]], ab:[{c:[[A("enSupply",0,true)]],r:"敌辎重已尽"}]},
  HOLDTIME:{p:[null], ab:[]},
  ESCORT:{p:[null], ab:[{c:[[A("liGE",4),A("enSupply",0,true)]],r:"敌势已退，护粮无虞"}]},
  BAIT:{p:[null,[[A("enLooting")],[F("敌军追击脱节"),A("phaseT",3)]]], ab:[{c:[[A("baitSeen"),A("phaseIs",1)]],r:"计为敌所识破"},{c:[[A("phaseIs",1),A("myOrgLT",0.4)]],r:"佯败弄假成真"},{c:[[A("phaseIs",1),A("tacT",8)]],r:"敌不来追"}]},
};
for(const T of TACTICS){ const d=T_COND_DEFAULTS[T.id]; if(!d) continue;
  T.phases.forEach((ph,i)=>{ if(i>0){ ph.cond=JSON.parse(JSON.stringify((d.p&&d.p[i])||[])); ph.when=(s,v,c)=>evalCond(ph.cond,s,v,c); } });
  T.aborts=JSON.parse(JSON.stringify(d.ab||[])); T.abort=(s,v,c)=>{ for(const a of T.aborts) if(evalCond(a.c,s,v,c)) return a.r||"中止条件成立"; return null; };
  T.boosts=JSON.parse(JSON.stringify(T_BOOST_DEFAULTS[T.id]||[])); }
/* ───────── 战术效果与克制（可在页面"战术编辑"中修改） ─────────
   mods：战术执行期间本方的倍率。atk 攻击 / def 抵挡 / orgTaken 所受组织伤害 / orgDealt 对敌组织伤害 / stam 体力消耗 / charge 冲击
   counters：{敌方战术ID: x}——敌方正在执行该战术时，本方攻击与致组织伤 ×(1+x)
   bias：适用度修正  minCmd：统帅门槛  enabled：是否允许 AI 选用 */
let T_COUNTER_WEIGHT=1.0;
const T_MOD_DEFAULTS={
  FRONTAL:{enMods:{stam:1.05},mods:{atk:1.10,orgTaken:1.05,stam:1.10},counters:{HARASS:0.10,FEINT:0.10}},
  HOLD:{enMods:{stam:1.10},mods:{atk:0.95,def:1.15},counters:{FRONTAL:0.10,ESCALADE:0.10}},
  FLANK:{enMods:{def:0.92},mods:{orgDealt:1.10},counters:{HOLD:0.15,FRONTAL:0.10,BOMBARD:0.15}},
  ENVELOP:{enMods:{def:0.90},mods:{orgDealt:1.15,def:0.90},counters:{FRONTAL:0.15,HOLD:0.10}},
  BREAK:{enMods:{def:0.92},mods:{atk:1.0,orgDealt:1.0,def:0.85,orgTaken:1.10},counters:{ENVELOP:0.20,REFUSE:0.10,REPAIR:0.15,SHIELD:0.10}},
  RESERVE:{mods:{def:1.05},counters:{FRONTAL:0.10,BREAK:0.10}},
  FEINT:{enMods:{stam:1.15},mods:{atk:0.85,orgTaken:0.90},counters:{RESERVE:0.20,ELASTIC:0.10},minCmd:60},
  FEIGN:{mods:{orgTaken:1.10},counters:{PURSUE:0.35,FRONTAL:0.20,BREAK:0.10},minCmd:75},
  ELASTIC:{enMods:{charge:0.80,stam:1.05},mods:{def:1.10,orgTaken:0.90},counters:{BREAK:0.35,FRONTAL:0.10}},
  REFUSE:{enMods:{charge:0.85},mods:{def:1.05},counters:{FLANK:0.25,ENVELOP:0.25,HARASS:0.15}},
  COUNTER:{enMods:{orgTaken:1.05},mods:{atk:1.15,stam:1.10},counters:{FRONTAL:0.15,BREAK:0.10,ESCALADE:0.15}},
  RETREAT:{enMods:{atk:0.90},mods:{atk:0.60,def:1.10,orgTaken:0.85},counters:{}},
  PURSUE:{enMods:{orgTaken:1.10},mods:{atk:1.20,orgDealt:1.20,def:0.85},counters:{RETREAT:0.25}},
  HARASS:{enMods:{stam:1.25,def:0.95},mods:{orgDealt:1.05,stam:0.90},counters:{HOLD:0.10,BOMBARD:0.10}},
  BOMBARD:{enMods:{orgTaken:1.05},mods:{},counters:{}},
  ESCALADE:{mods:{atk:1.10,orgTaken:1.15},counters:{SHIELD:0.20}},
  SHIELD:{mods:{atk:0.90},counters:{FIRE:0.30,BOMBARD:0.15,HARASS:0.15}},
  REPAIR:{mods:{atk:0.95,stam:1.10},counters:{}},
  FIRE:{enMods:{orgTaken:1.10,stam:1.05},mods:{atk:0.90},counters:{REPAIR:0.25,HOLD:0.10}},
  LURE:{mods:{},counters:{}},
  BAIT:{mods:{orgTaken:1.05},counters:{PURSUE:0.30,FRONTAL:0.10}},
  TAUNT:{mods:{},counters:{}},
  CHALLENGE:{mods:{},counters:{}},
  SORTIE:{enMods:{def:0.90},mods:{atk:1.15},counters:{BOMBARD:0.30,ESCALADE:0.10}},
};
const MOD_KEYS=[["atk","攻击"],["def","抵挡"],["orgTaken","受组织伤"],["orgDealt","致组织伤"],["stam","体力消耗"],["charge","冲击"]];
for(const T of TACTICS){ const d=T_MOD_DEFAULTS[T.id]||{};
  T.mods={atk:1,def:1,orgTaken:1,orgDealt:1,stam:1,charge:1,...(d.mods||{})}; T.enMods={atk:1,def:1,orgTaken:1,orgDealt:1,stam:1,charge:1,...(d.enMods||{})}; T.counters={...(d.counters||{})};
  T.bias=0; T.minCmd=d.minCmd||0; T.enabled=true; }
const T_DEFAULT_SNAPSHOT=JSON.stringify(TACTICS.map(T=>({id:T.id,mods:T.mods,enMods:T.enMods,counters:T.counters,bias:T.bias,minCmd:T.minCmd,minInt:T.minInt||0,enabled:T.enabled,phases:T.phases.map(ph=>({...ph.o})),conds:T.phases.map(ph=>ph.cond||null),aborts:T.aborts||[],boosts:T.boosts||[]})));
function tacticsExport(){ return {w:T_COUNTER_WEIGHT,list:TACTICS.map(T=>({id:T.id,mods:T.mods,enMods:T.enMods,counters:T.counters,bias:T.bias,minCmd:T.minCmd,minInt:T.minInt||0,enabled:T.enabled,phases:T.phases.map(ph=>({...ph.o})),conds:T.phases.map(ph=>ph.cond||null),aborts:T.aborts||[],boosts:T.boosts||[]}))}; }
function tacticsImport(o){ if(!o||!o.list) return; if(typeof o.w==="number") T_COUNTER_WEIGHT=o.w;
  for(const d of o.list){ const T=TACTICS.find(x=>x.id===d.id); if(!T) continue;
    T.mods={...T.mods,...d.mods}; T.enMods={...T.enMods,...(d.enMods||{})}; T.counters={...d.counters}; T.bias=+d.bias||0; T.minCmd=+d.minCmd||0; if(d.minInt!=null) T.minInt=+d.minInt||0; T.enabled=d.enabled!==false;
    (d.phases||[]).forEach((po,i)=>{ if(T.phases[i]) T.phases[i].o={...T.phases[i].o,...po}; });
    if(d.conds) d.conds.forEach((c,i)=>{ if(T.phases[i]&&i>0&&c) T.phases[i].cond=JSON.parse(JSON.stringify(c)); });
    if(d.aborts) T.aborts=JSON.parse(JSON.stringify(d.aborts)); if(d.boosts) T.boosts=JSON.parse(JSON.stringify(d.boosts)); } }
function tacticsReset(){ T_COUNTER_WEIGHT=1.0; tacticsImport({w:1,list:JSON.parse(T_DEFAULT_SNAPSHOT)}); }
const PLAN_NAME={FIGHT:"再战",REST:"休整",FORTIFY:"筑垒",SIEGEWORK:"造攻城器械",SORTIE:"出城突击",WITHDRAW:"撤退",SURRENDER:"开城投降",RAID:"奇袭粮道"};
const TACTIC_BY_ID=Object.fromEntries(TACTICS.map(t=>[t.id,t]));

/* ───────── 指挥官 AI ───────── */
class TacticalAI{
  constructor(sideName, opts={}){
    this.side=sideName; this.persona=opts.persona||"均衡"; this.enabled=opts.enabled!==false; this.forced=opts.forced||null;
    this.cur=null; this.phase=0; this.tStart=0; this.phaseStart=0; this.lastEval=-99; this.cool={};
    this.mem={}; this.log=[]; this.sit=null; this.ranking=[]; this.orders=null; this.history=[];
  }
  note(t,text,kind=""){ this.log.push({t,text,kind}); if(this.log.length>200) this.log.shift(); }
  ctx(v){ return {phase:this.phase, phaseT:v.t-this.phaseStart, tacT:v.t-this.tStart, mem:this.mem}; }
  rank(s,v){
    const p=T_PERSONA[this.persona]||T_PERSONA["均衡"]; const out=[];
    const enT=v.enTactic?TACTICS.find(x=>x.id===v.enTactic):null;
    for(const T of TACTICS){
      if(T.enabled===false&&!(this.forced===T.id)) continue;
      let ok=T.need?T.need(v,s):true;
      if(ok===true&&v.me.cmd<(T.minCmd||0)) ok=`统帅不足 ${T.minCmd}`;
      if(ok===true&&(v.me.int??60)<(T.minInt||0)) ok=`智略不足 ${T.minInt}`;
      let sc=T.score(s,v,p)+(T.bias||0); for(const b of T.boosts||[]) if(evalCond(b.c,s,v,null)) sc+=+b.x||0;
      if(enT){ sc+=T_COUNTER_WEIGHT*((T.counters[enT.id]||0)-(enT.counters[T.id]||0)); }
      const w=v.works;
      if(w&&(w.enFort>0||w.enWall>0||w.myFort>0||w.myWall>0)){
        if(["进攻","机动","追击","欺骗"].includes(T.cat)) sc-=(s.score>0.6?0.15:0.3)*w.enFort+1.0*w.enWall;
        if(T.cat==="防御") sc+=0.1*w.myFort+0.6*w.myWall;
        if(T.id==="RETREAT"&&w.myWall>0) sc-=2;
        if(T.id==="RETREAT"&&w.myFort>0.5) sc-=1.0; }
      if(this.cur&&this.cur.id===T.id) sc+=T_INERTIA;
      const cooled=(this.cool[T.id]||-1)>v.t;
      out.push({id:T.id,name:T.name,code:T.code,score:sc,ok:ok===true&&!cooled,why:ok===true?(cooled?"刚被放弃，冷却中":""):ok});
    }
    out.sort((a,b)=>(b.ok-a.ok)||(b.score-a.score));
    return out;
  }
  start(T,v,reason){
    this.cur=T; this.phase=0; this.tStart=v.t; this.phaseStart=v.t; this.mem={};
    if(T.phases[0].enter) T.phases[0].enter(v,this.ctx(v));
    this.history.push({t:v.t,id:T.id});
    this.note(v.t,`选定「${T.name}」（${T.code}）：${reason}`,"pick");
  }
  update(v){
    const s=assess(v); this.sit=s;
    const forced=this.forced||this.dayForced||null;
    if(this.plan&&["REST","FORTIFY","SIEGEWORK","RAID"].includes(this.plan)&&!v.contact&&!this.forced){   // 休整/筑垒/造械之日：按兵不动
      this.cur=null; this.ranking=this.rank(s,v); this.orders={...defaultOrders(v),stance:"hold",wings:"screen",reserve:"rotate"}; return this.orders; }
    if(!this.enabled&&!forced){ this.orders=defaultOrders(v); this.ranking=this.rank(s,v); return this.orders; }
    // 当前战术：中止 / 进阶
    if(this.cur){
      const T=this.cur, c=this.ctx(v);
      const ab=!forced&&T.abort?T.abort(s,v,c):null;
      if(ab){ this.note(v.t,`放弃「${T.name}」：${ab}`,"abort"); this.cool[T.id]=v.t+6; this.cur=null; }
      else { const nx=T.phases[this.phase+1];
        if(nx&&nx.when(s,v,c)){ this.phase++; this.phaseStart=v.t; if(nx.enter) nx.enter(v,this.ctx(v)); this.note(v.t,`「${T.name}」→ ${nx.name}`,"phase"); } }
    }
    this.ranking=this.rank(s,v);
    if(forced){
      if(!this.cur||this.cur.id!==forced){ this.start(TACTIC_BY_ID[forced],v,this.forced?"玩家指定":"依夜议方略"); }
    } else if(!this.cur||(!this.cur.final&&v.t-this.lastEval>=T_EVAL_EVERY)){
      this.lastEval=v.t;
      const best=this.ranking.find(r=>r.ok);
      if(best&&(!this.cur||best.id!==this.cur.id)){
        const second=this.ranking.filter(r=>r.ok&&r.id!==best.id)[0];
        const fl=[...s.flags].slice(0,3).join("、");
        this.start(TACTIC_BY_ID[best.id],v,`形势${s.label}·${s.stage}${fl?"；"+fl:""}（适用度 ${best.score.toFixed(2)}${second?"，次选"+second.name+" "+second.score.toFixed(2):""}）`);
      }
    }
    const base=defaultOrders(v);
    this.orders=this.cur?{...base,...this.cur.phases[this.phase].o}:base;
    return this.orders;
  }
  /* 阵型：按兵种构成、形势、性格与敌阵选阵 */
  chooseFormation(v,enForm){
    const s=assess(v); const p=T_PERSONA[this.persona]||T_PERSONA["均衡"]; const me=v.me, e=v.en, w=v.works||{};
    const n=Math.max(1,me.units), cavS=me.cav/n, rngS=(me.rangedUnits||0)/n, enCavStrong=e.cavPow>me.cavPow*1.5&&e.cavPow>20;
    const sc={FANG:0.30,
      FENGSHI:0.05+(!v.isDefender?0.15:0)+s.score*0.4+p.atk*0.8+(me.cmd>=75?0.1:0),
      HEYI:-0.05+cavS*1.6+(v.terrain.wing>=4?0.15:-0.6)+(s.score>0?0.1:0)+p.guile*0.3,
      YUAN:-0.05+(v.isDefender?0.2:0)-s.score*0.5+p.def*0.8+(enCavStrong?0.25:0)+(cavS===0&&v.terrain.wing>=4?0.1:0),
      YANXING:-0.1+rngS*1.3+((w.myFort||0)>0.5||(w.myWall||0)>0?0.1:0)-(enCavStrong?0.25:0),
      YANYUE:-0.05+(me.cmd>=85?0.2:0)+p.guile*0.4+(s.score<0&&s.score>-0.5?0.15:0)+cavS*0.5,
      CHANGSHE:-0.15+(v.terrain.width>=12?0.1:-0.3)+((e.menEst||e.men)>me.men*1.25?0.25:0),
      YULIN:0.0+(me.reserves>=4?0.2:0)+p.atk*0.4+(!v.isDefender?0.1:0)};
    const why={FANG:"攻守均衡",FENGSHI:"欲中央突破",HEYI:`骑兵 ${me.cav} 部，可张两翼包抄`,YUAN:enCavStrong?"敌骑势大，结圆阵自守":"形势不利，结阵自守",YANXING:`弓弩 ${me.rangedUnits||0} 部，以远射取胜`,YANYUE:"主将坐镇中军，重兵前冲",CHANGSHE:"敌众我寡，展宽正面以防包抄",YULIN:"预备充足，层叠轮番冲击"};
    let best=null;
    for(const id of Object.keys(sc)){ if(!FORM[id]) continue; let x=sc[id]; const c=(FORM[id].counters||{})[enForm]||0, cb=(FORM[enForm]&&FORM[enForm].counters||{})[id]||0;
      x+=1.5*c-1.5*cb; if(!best||x>best.x) best={id,x,c,cb}; }
    let r=why[best.id]; if(best.c) r+=`；克制敌${FORM[enForm].name}阵`;
    return {id:best.id, why:r};
  }
  /* 主将位置：前阵督战还是后阵坐镇 */
  chooseGenPos(v){
    const s=assess(v); const p=T_PERSONA[this.persona]||T_PERSONA["均衡"]; const w=v.works||{};
    let x=0; const why=[];     // x>0 → 后阵
    x+=p.def*1.2-p.atk*1.2-p.risk*0.6; if(p.def>0.1) why.push("性情持重"); if(p.atk>0.1) why.push("性喜身先士卒");
    if(w.myWall>0||w.myFort>0.8){ x+=0.25; why.push("据城垒而守，宜居中调度"); }
    if((v.en.cavFresh||0)>=2&&(v.me.flankGuard||0)<0.4){ x-=0.25; why.push("敌骑众多，后阵易遭突袭"); }
    if(s.score>0.3){ x+=0.25; why.push("我众敌寡，不必亲冒矢石"); }
    if(s.score<-0.2){ x-=0.35; why.push("形势不利，须亲临督战以振士气"); }
    if(v.me.cmd>=85){ x+=0.1; why.push("统帅老成，坐镇足以指挥若定"); }
    if(v.dayStats&&v.dayStats.routed>=2){ x-=0.15; why.push("昨日前阵多有溃散"); }
    return {pos:x>0.05?"rear":"front", why:why.join("，")||(x>0.05?"居后统筹":"循例居前")};
  }
  /* 夜议：根据当日战况决定次日方略 */
  dayPlan(v){
    const s=assess(v); this.sit=s; const p=T_PERSONA[this.persona]||T_PERSONA["均衡"];
    const w=v.works||{}, d=v.dayStats||{}; const myOrg=v.me.orgAvg, wnd=v.me.woundedShare||0, fail=w.failDays||0;
    const besieger=(w.enWall||0)>0||(w.enFood!=null&&w.enIsCity), besieged=(w.myWall||0)>0||w.myCity;
    const opts=[]; const add=(id,sc,why)=>opts.push({id,sc,why});
    add("FIGHT",0.35+s.score*0.5+p.atk*0.4+(besieger&&w.enWall<0.4?0.35:0)+(has(s,"敌阵动摇")?0.2:0)-fail*0.22-(besieger&&w.enWall>0.6&&w.myEngines<2?0.45:0)-(myOrg<0.4?0.35:0)+(v.isDefender&&!besieged?0.1:0)+((v.mode==="决战"||v.mode==="遭遇")?0.12:0),
        fail?`虽已${fail}日攻而不下，仍有可为`:`形势${s.label}，明日再战`);
    add("REST",-0.05+(myOrg<0.5?0.3:0)+(wnd>0.1?0.2:0)+(fail>=1?0.15:0)+(s.li<=2?0.1:0)+p.def*0.3-(besieged&&w.myFood<=1?0.4:0),
        `组织度 ${(myOrg*100).toFixed(0)}%、伤兵 ${(wnd*100).toFixed(0)}%，休整一日救治伤病`);
    if(!besieged&&(w.myFort||0)<2.8) add("FORTIFY",-0.12+(v.isDefender?0.35:0)+p.def*0.7-p.atk*0.6+(s.li<=3?0.12:-0.2)-(besieger?0.4:0)-(!v.isDefender&&v.mode!=="决战"&&v.mode!=="遭遇"?0.35:0)+(has(s,"久峙不决")?0.1:0)+(fail>=1&&!besieger?0.1:0),
        `据守待敌，加筑营垒（现 ${(w.myFort||0).toFixed(1)} 级）`);
    if(besieger&&(w.myEngines||0)<4) add("SIEGEWORK",0.3+(w.enWall>0.5?0.3:0)+((w.myEngines||0)<2?0.3:-0.1)+p.def*0.2+(fail>=1?0.15:0),
        `城墙尚有 ${(w.enWall*100).toFixed(0)}%，赶造器械（现 ${w.myEngines||0} 具）`);
    if(besieged) add("SORTIE",-0.15+((w.enEngines||0)>=2?0.35:0)+p.atk*0.4+(s.score>0?0.25:-0.2)+(w.myFood!=null&&w.myFood<=2?0.15:0),
        `敌器械 ${w.enEngines||0} 具，出城焚之`);
    const rsv=((v.me.resolve??50)-50)/100, fieldFood=!besieged&&w.myFood!=null;
    // 劫粮不再是夜议方略：由战役地图上派出以"焚粮"为目标的军团、实际接战来完成
    if(!besieged) add("WITHDRAW",-0.7-rsv*1.4+(fieldFood&&w.myFood<=2?0.6:0)+(fieldFood&&w.myFood<=0?0.8:0)+(fail>=2?0.55:0)+(s.li<=1?0.5:0)+(s.li===0?0.4:0)-p.risk*0.7+p.def*0.4+((d.lossFrac||0)>0.2?0.2:0)+(fail>=3?0.3:0),
        fail>=2?`久攻不下已 ${fail} 日，伤亡持续`:`形势${s.label}，难以为继`);
    if(besieged&&w.myFood!=null&&w.myFood<=0) add("SURRENDER",-0.2+(s.li<=2?0.6:0)+(w.starving||0)*0.25-p.risk*0.3,`粮尽 ${w.starving||0} 日，军无斗志`);
    opts.sort((a,b)=>b.sc-a.sc); const best=opts[0], second=opts[1]; if(best.id==="RAID") this.raids=(this.raids||0)+1;
    this.plan=best.id; this.dayForced=best.id==="SORTIE"?"SORTIE":null; this.cur=null; this.lastEval=-99;
    this.note(v.t,`第${v.day}日夜议 → ${PLAN_NAME[best.id]}：${best.why}（${best.sc.toFixed(2)}${second?"；次选"+PLAN_NAME[second.id]+" "+second.sc.toFixed(2):""}）`,"plan");
    return {plan:best.id, reason:best.why, options:opts};
  }
  get phaseName(){ return this.cur?this.cur.phases[this.phase].name:"—"; }
}
