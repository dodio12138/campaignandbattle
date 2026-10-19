/* 战役层：大地图、补给、军团、交战→战斗、战略 AI、历史模式。依赖 round_engine / tactics / round_adapter；剧本数据在 src/data/scenarios.js。 */
/* ================= 战役层：大地图、军团、目标、补给、气候 =================
   每个军团由若干兵棋（部）组成，带主将、目标（任务）与撤退阈值。两军相遇即转入战斗界面（回合引擎），
   战斗结果写回军团。截粮不是写死的系统：派出以"截粮"为目标的军团，到达敌粮仓或撞上运粮队时实际接战，
   战斗中焚毁多少辎重，粮仓就损失多少。 */
const CP = {
  SUPPLY_RANGE:3,      // 军团距己方粮仓（路程日数）在此之内、且路上无敌军，方可就粮
  FOOD_CAP_DAYS:5,     // 军团随军粮草上限（日）
  EAT_PER_10:1,        // 每 10 部（约 1 万人）每日食粮 1 单位
  RAID_UNGUARDED:0.7,  // 敌军占据无人守卫的粮仓：每日焚毁比例
  // —— 烧粮仓（屯粮被焚：一次即可重挫全军军心）与 截粮（截运粮队：断其后继，主要伤粮不伤心） ——
  BURN_TRIGGER:0.3,    // 一次焚毁该仓存粮此比例以上（或占全军存粮此比例以上）即"军心大震"
  BURN_ORG:0.55,       // 军心大震：依赖该仓的军团组织度打击（×严重度）
  BURN_FAR:0.5,        // 不就食于该仓的其余军团，打击打此折扣
  BURN_DESERT:0.07,    // 军心大震：逃亡比例（×严重度）
  BURN_SEV_BASE:0.45, BURN_SEV_SHARE:1.4,   // 严重度 = 基数 + 焚粮占全军存粮之比 × 系数（上限 1）
  SHAKEN_DAYS:4,       // 军心动摇持续日数
  SHAKEN_REC:0.7,      // 动摇期间夜间组织恢复减少此比例
  SHAKEN_CAP:0.65,     // 动摇期间组织度上限（占满额比例）
  SHAKEN_FLEE:0.5,     // 军心动摇时主力每日议退的倾向（×(1.2−统帅/100)）
  EXPLOIT_RATIO:0.8,   // 乘乱击之：我可用兵力 ≥ 敌（动摇后）战力×此倍数×营垒系数
  CUT_ORG:0.06,
  // —— 火攻营寨（火烧连营）：天时 × 林木 × 主将智略；可沿相邻营寨蔓延 ——
  FIRE_INT:80,         // 战略 AI 智略达此方会谋划火攻
  FIRE_BASE:0.4,       // 火势基数
  FIRE_ORG:0.6, FIRE_MEN:0.1, FIRE_FORT:2,   // 被焚营寨：组织打击、伤亡、营垒毁损（×火势）
  FIRE_SPREAD:0.8,     // 向相邻（1 日路程内）己方营寨蔓延的概率（×火势），每蔓延一营火势 ×0.75
  FIRE_SHOCK_CAMPS:2,  // 一次焚营达此数，全军军心大震
  WX_PERSIST:0.4,      // 天气延续概率（使"择天时"有意义）        // 截粮：运粮队辎重损失过半，全军组织小挫
  STARVE_ORG:0.15, STARVE_MEN:0.02, STARVE_COLLAPSE:8,   // 断粮每日减员 = 2%×断粮日数；满 8 日全军溃散
  NIGHT_ORG:0.45, NIGHT_STAM:60, HEAL:0.10, RALLY:0.5, RALLY_LOSS:0.2,
  CAMP_BUILD:0.5, CAMP_MAX:2,   // 驻于敌前，每日加筑营垒
  DEPOT_UNITS_PER:15,
  HOLD_AFTER_LOSS:0.4, // 守方据城垒失利：残余战力不低于战前此比例则退入营垒坚守，不弃营
  RAID_GOAL:0.8,       // 截粮军团的焚粮目标（焚毁敌辎重比例）
  // —— 战略 AI ——
  STRAT_VISION:2,      // 视野（日程）：己方军团与据点此距离内的敌军可见（智略 ≥80 再 +1，雾天 −1）
  STRAT_NOISE:0.4,     // 兵力/存粮估计误差上限（×(1−智略/100)）
  STRAT_LAG:0.45,      // 迟疑：每日不决的概率上限（×(1−统帅/100)）
  RAID_INT:50,         // 智略达此方能谋划截粮、截运粮
  FORESIGHT_INT:70,    // 智略达此方能预设防备、择天时出奇
  SPY_INT:75,          // 智略达此能大致探知敌之存粮
  COUNTER_INT:60,      // 智略低于此，粮仓告急时可能误判而"围魏救赵"
  COUNTER_P:0.9,       // 上项误判倾向
  CONVOY_LOAD:25,      // 运粮队每趟装粮
  WITHDRAW_FOOD:5,     // 主力前线粮草（日）低于此即议退兵（×(0.6+智略/125)，进取者更晚）
  SCOUT_P:0.35,        // 斥候发现相邻敌军（将袭我粮仓）的概率（×智略差）
  ASSAULT_RATIO:2.2,            // AI 攻方：战力达守方此倍数且士气充足才强攻城垒
  ASSAULT_P:0.2,                // 否则每日以此概率（×战力比÷工事）试攻，其余日子对垒不战
  STANDOFF_LOSS:0.004,
  // —— 时段：一日六时段，行军、接敌、夜袭按时段推进 ——
  LATE_ENGAGE_PH:2,             // 抵达敌前若已过此时段（上午）且非奇袭、非途中遭遇：隔营相望，次日清晨再战
  NIGHT_ROUNDS:12,              // 夜战回合数（截粮、火攻多在夜间）
  NEAR_DAYS:1,                  // 敌军进入己方据点或军团此路程（日）之内即为"敌情"          // 对垒不战之日，双方零星矢石伤亡           // 粮仓入战时，每 15 单位存粮化为一部"辎重"（粮垛）
};
/* 一日六时段：每段约四个时辰。行军默认走清晨、上午、下午三段；截粮、火攻夜行（前半夜、后半夜、清晨） */
const PERIODS=[{n:"后半夜",t:"00–04",night:true},{n:"清晨",t:"04–08"},{n:"上午",t:"08–12"},{n:"下午",t:"12–16"},{n:"傍晚",t:"16–20"},{n:"前半夜",t:"20–24",night:true}];
const PERIOD_ROUNDS=[12,15,11,8,4,12];   // 某时段开战时，到日暮（或夜战结束）可打的回合数
const MARCH_DAY=[1,2,3], MARCH_NIGHT=[5,0,1];
const MISSION_NAME={hold:"驻守",attack:"进攻",fire:"火攻营寨",raid:"截粮·焚粮",delay:"阻击（坚守后撤回）",reinforce:"增援",escort:"护粮运粮",retreat:"撤回"};
const FIRE_WX={大风:1.6,酷暑:1.4,晴:1,雾:0.7,雪:0.2,雨:0};
const WEATHER_TABLE={春:{晴:0.5,雨:0.25,大风:0.15,雾:0.1},夏:{晴:0.4,雨:0.25,酷暑:0.3,大风:0.05},秋:{晴:0.5,雨:0.2,大风:0.15,雾:0.15},冬:{晴:0.45,雪:0.3,大风:0.15,雾:0.1}};



/* ================= 战略抉择 AI：主帅的统帅与智略决定其"看得到什么、想得到什么、做得成什么" =================
   智略 → 情报与谋划：视野、对敌兵力与存粮判断的误差、能否想到截粮与截运粮、能否预先设防、会否误判而"围魏救赵"、会否择天时出奇。
   统帅 → 决断与执行：每日是否迟疑不决、可同时展开几路行动、强攻城垒所需的兵力比、阵前是否敢于强攻。
   性格 → 偏好：进取者门槛低、谨慎者重守、诡诈者重奇兵。 */
class StrategicAI{
  constructor(c,side){ this.c=c; this.side=side; this.en=side==="A"?"B":"A"; this.seen={}; this.intent="静观其变"; this.posture="hold"; this.lastAdvice=[]; }
  get lord(){ return this.c.sideInfo[this.side].lord||{name:"主帅",cmd:70,int:60,persona:"均衡"}; }
  get P(){ return T_PERSONA[this.lord.persona]||T_PERSONA["均衡"]; }
  noise(){ return Math.max(0.3,1+(this.c.rand()*2-1)*CP.STRAT_NOISE*(1-this.lord.int/100)); }
  style(){ const L=this.lord; return (L.int>=85?"深谋":L.int>=65?"多谋":L.int>=45?"中智":"寡谋")+"·"+(L.cmd>=85?"善将":L.cmd>=65?"能将":"庸将"); }
  /* 情报：己方军团、据点视野之内的敌军可见（智略高者视野更远，雾天缩短）；兵力估计带误差；视野外沿用旧情报 */
  intel(){ const c=this.c, L=this.lord, vis=CP.STRAT_VISION+(L.int>=80?1:0)-(c.weather==="雾"?1:0);
    const eyes=new Set([...c.armies.filter(a=>a.side===this.side&&!a.gone).map(a=>a.at),...Object.values(c.nodes).filter(n=>n.owner===this.side).map(n=>n.id)]);
    const dist={}; for(const e of eyes){ for(const n of Object.keys(c.nodes)){ const r=e===n?{days:0}:c.route(e,n,this.side); if(r&&(dist[n]==null||r.days<dist[n])) dist[n]=r.days; } }
    for(const a of c.armies) if(a.side===this.en&&!a.gone&&c.alive(a)&&((dist[a.at]??99)<=vis||c.intelAll[this.side]))
      this.seen[a.id]={id:a.id,at:a.at,power:c.power(a)*this.noise(),day:c.day,dest:a.path.length?a.path[a.path.length-1]:a.at,fast:c.speed(a)>=2,convoy:a.cargo>0,next:a.path[0]||null,name:a.name};
    for(const id in this.seen){ const a=c.army(id); if(!a||a.gone||!c.alive(a)) delete this.seen[id]; }
    return this.seen; }
  enemyPowerAt(node,within=0){ const c=this.c; return Object.values(this.seen).filter(s=>s.at===node||(within>0&&c.route(s.at,node,this.en)&&c.route(s.at,node,this.en).days<=within&&s.day>=c.day-1)).reduce((t,s)=>t+s.power*(s.at===node?1:0.7),0); }
  foodDays(side){ const c=this.c; const arms=c.armies.filter(a=>a.side===side&&!a.gone&&c.alive(a)); const eat=arms.reduce((t,a)=>t+c.eat(a),0)||1;
    const stock=Object.values(c.nodes).filter(n=>n.depot&&n.owner===side).reduce((t,n)=>t+n.depot.food,0)+arms.reduce((t,a)=>t+(a.food||0),0);
    const est=side===this.side||this.lord.int>=CP.SPY_INT||c.intelAll[this.side]?1:this.noise(); return stock*est/eat; }
  idle(a){ return !(a.histLock>=this.c.day)&&!a.gone&&this.c.alive(a)&&!a.path.length&&["hold"].includes(a.mission.type)&&!this.c.pending.some(e=>e.armies[a.side].includes(a.id)); }
  /* 候选方略：每条带评分与理由 */
  options(){ const c=this.c, L=this.lord, P=this.P, side=this.side; const seen=this.intel(); const opts=[];
    const mine=c.armies.filter(a=>a.side===side&&!a.gone&&c.alive(a));
    const myFood=this.foodDays(side), enFood=this.foodDays(this.en);
    const depots=Object.values(c.nodes).filter(n=>n.depot&&n.owner===side);
    // ① 告急：所见之敌已到或正扑向我粮仓/城营
    for(const n of Object.values(c.nodes).filter(n=>n.owner===side&&(n.depot||n.wall!=null||n.fort>0))){
      const th=Object.values(seen).filter(s=>s.at===n.id||(s.dest===n.id&&c.route(s.at,n.id,this.en)&&c.route(s.at,n.id,this.en).days<=2));
      if(!th.length) continue; const ep=th.reduce((t,s)=>t+s.power,0), here=mine.filter(a=>a.at===n.id).reduce((t,a)=>t+c.power(a),0);
      if(here>=ep*1.3) continue;
      const helpers=mine.filter(a=>this.idle(a)&&a.at!==n.id&&["reserve","raider"].includes(a.ai)).map(a=>({a,r:c.route(a.at,n.id,side)})).filter(x=>x.r&&x.r.days/c.speed(x.a)<=2.01).sort((x,y)=>x.r.days-y.r.days);
      if(!helpers.length) continue; const h=helpers[0].a;
      const imp=(n.depot?1.2:0)+(n.wall!=null||n.fort>0?0.6:0);
      const hd=c.anchors("decision").find(x=>x.side===side&&(!x.node||x.node===n.id)&&c.trig(x));
      const histChoice=hd?(c.control[side]==="player"?hd.choose:(c.histTry(hd)?hd.choose:null)):null;
      if(histChoice==="relieve"){ opts.push({type:"relieve",score:3+imp,army:h.id,target:n.id,text:`令${h.name.split(" · ")[0]}驰援${n.name}`,why:`史实：${hd.text}`}); continue; }
      if(histChoice==="counter"||(L.int<CP.COUNTER_INT&&this.c.rand()<(CP.COUNTER_INT-L.int)/CP.COUNTER_INT*CP.COUNTER_P)){
        const base=Object.values(seen).filter(s=>!s.fast&&!s.convoy).sort((x,y)=>y.power-x.power)[0];
        if(base) { opts.push({type:"counter",score:(histChoice?3:1.6)+imp,army:h.id,target:base.at,text:`令${h.name.split(" · ")[0]}直攻${c.nodes[base.at].name}`,why:histChoice?`史实：${hd.text}`:`${n.name}告急，主帅以为敌倾巢来袭，欲攻其必救（围魏救赵）`}); continue; } }
      opts.push({type:"relieve",score:1.8+imp,army:h.id,target:n.id,text:`令${h.name.split(" · ")[0]}驰援${n.name}`,why:`斥候报敌${th.map(s=>s.name.split(" · ")[0]).join("、")}${th.some(s=>s.at===n.id)?"已至":"将至"}${n.name}，守军不足`}); }
    // ② 截粮：智略足以谋及敌之粮道
    const hp=c.postureOf(side);
    if(L.int>=CP.RAID_INT&&!(hp&&hp.noRaid)){ const raiders=mine.filter(a=>this.idle(a)&&(a.ai==="raider"||c.speed(a)>=2));
      const enArms=c.armies.filter(a=>a.side===this.en&&!a.gone&&c.alive(a)); const enEat=enArms.reduce((t,a)=>t+c.eat(a),0)||1;
      for(const d of Object.values(c.nodes).filter(n=>n.depot&&n.owner===this.en&&n.depot.food>2)){
        const dep=enArms.filter(a=>{ const r=a.at===d.id?{days:0}:c.route(a.at,d.id,this.en); return r&&r.days<=CP.SUPPLY_RANGE; }).reduce((t,a)=>t+c.eat(a),0)/enEat;
        for(const a of raiders){ const r=c.route(a.at,d.id,side,true); if(!r) continue; const eta=r.days/c.speed(a); if(eta>3.01) continue;
          const def=(this.enemyPowerAt(d.id)+0.7*this.enemyPowerAt(d.id,1))*(1+(d.fort||0)*0.25)+(d.wall!=null?3000:0);
          let wx=1, wxWhy=""; if(L.int>=CP.FORESIGHT_INT){ wx={雨:0.25,大风:1.35,雾:1.15}[c.weather]||1; wxWhy={雨:"（雨天不利纵火，宜缓）",大风:"（大风利火攻，正其时）",雾:"（大雾可掩行踪）"}[c.weather]||""; }
          const rp=c.power(a)*1.3*wx*((c.raidBonus&&c.raidBonus[side])||1), p=Math.max(0.05,Math.min(0.95,rp/(rp+def*0.8+1)));
          const urg=(myFood<8?0.5:0)+(myFood<enFood?0.2:0);
          const enTot=Object.values(c.nodes).filter(x=>x.depot&&x.owner===this.en).reduce((s,x)=>s+x.depot.food,0)||1, shockV=L.int>=CP.FORESIGHT_INT?Math.min(1,CP.BURN_SEV_BASE+d.depot.food/enTot*CP.BURN_SEV_SHARE)*CP.BURN_ORG*0.6:0;
          const sc=(dep*1.4+urg+shockV)*p*1.7-0.25+P.guile*0.5+P.risk*0.2-(eta>1.5?0.15:0);
          opts.push({type:"raid",score:sc,army:a.id,target:d.id,text:`令${a.name.split(" · ")[0]}奇袭${d.name}`,why:`${d.name}供敌${Math.round(dep*100)}%之粮；估守军约${Math.round(def/1000)}千，得手可能${Math.round(p*100)}%${wxWhy}`}); } }
      // ③ 截运粮队
      for(const s of Object.values(seen).filter(s=>s.convoy&&s.next)) for(const a of raiders){ const r=c.route(a.at,s.next,side,true); if(!r||r.days/c.speed(a)>1.01) continue;
        const p=Math.max(0.1,Math.min(0.95,c.power(a)/(c.power(a)+s.power*0.8)));
        opts.push({type:"intercept",score:0.6+p*0.9+P.guile*0.3,army:a.id,target:s.next,text:`令${a.name.split(" · ")[0]}截击运粮队于${c.nodes[s.next].name}`,why:`探得敌${s.name.split(" · ")[0]}运粮经${c.nodes[s.next].name}，护卫薄弱`}); } }
    // ④ 预设防备：深谋者料敌奇兵将至，先遣兵守粮仓
    if(L.int>=CP.FORESIGHT_INT) for(const d of depots){ const fast=Object.values(seen).filter(s=>s.fast&&c.route(s.at,d.id,this.en)&&c.route(s.at,d.id,this.en).days<=2);
      if(!fast.length) continue; const here=mine.filter(a=>a.at===d.id).reduce((t,a)=>t+c.power(a),0); const ep=fast.reduce((t,s)=>t+s.power,0); if(here>=ep*1.2) continue;
      const g=mine.filter(a=>this.idle(a)&&a.ai==="reserve"&&a.at!==d.id)[0]; if(g) opts.push({type:"guard",score:1.0+(L.int-70)/60,army:g.id,target:d.id,text:`令${g.name.split(" · ")[0]}移屯${d.name}`,why:`敌轻骑${fast.map(s=>s.name.split(" · ")[0]).join("、")}距${d.name}不过两日，预为之备`}); }
    // ⑤ 主力：强攻 / 对峙 / 退兵
    for(const a of mine.filter(a=>a.ai==="main")){ const tgt=a.mission.type==="attack"?a.mission.target:(a.planTarget||null); if(!tgt) continue;
      const ep=this.enemyPowerAt(tgt)||1, r=c.power(a)/ep, T=this.assaultRatio();
      // 前线就粮：可达粮仓的存粮 + 随军粮，按本军食量折日（深谋者看得更远，更早退兵保全）
      const dep=c.supplyDepot(a), ff=((dep?dep.depot.food:0)+(a.food||0))/Math.max(0.1,c.eat(a)), thr=CP.WITHDRAW_FOOD*(0.6+L.int/125)-this.P.risk*2;
      const convoyComing=c.armies.some(x=>x.side===side&&!x.gone&&x.cargo>0&&x.mission.type==="escort");
      const outlast=L.int>=CP.SPY_INT&&enFood<ff*0.9;   // 深谋者知敌粮更少，咬牙坚持
      if((myFood<2.5||(ff<thr&&!convoyComing&&!outlast))&&a.mission.type!=="retreat") opts.push({type:"withdraw",score:2.5,army:a.id,target:a.retreatHome||a.home,text:`${a.name.split(" · ")[0]}退兵`,why:`前线粮草仅支约 ${ff.toFixed(1)} 日${convoyComing?"":"，后续无粮可继"}`});
      else if(a.mission.type==="hold"&&a.planTarget&&c.nodes[a.planTarget].owner!==side&&r>=T*0.75&&!(hp&&(hp.assaultMul??1)<0.5)&&a.at!==a.planTarget)
        opts.push({type:"assault",score:0.7+P.atk*2+(r-T)*0.4,army:a.id,target:a.planTarget,text:`${a.name.split(" · ")[0]}进逼${c.nodes[a.planTarget].name}`,why:`${r>20?"敌营空虚":`我军战力约敌 ${r.toFixed(1)} 倍`}，${P.atk>0?"主帅锐意进取":"可以一战"}`});
      else if(r<0.5&&a.mission.type==="attack") opts.push({type:"withdraw",score:1.5,army:a.id,target:a.home,text:`${a.name.split(" · ")[0]}退守本营`,why:`敌众我寡（约 ${r.toFixed(2)} 倍）`}); }
    // ⑥ 乘乱击之：敌屯粮被焚、军心动摇（智略足以察之）
    if(L.int>=CP.RAID_INT) for(const sv of Object.values(seen)){ const ea=c.army(sv.id); if(!ea||!(ea.shaken>0)||sv.day<c.day-1||sv.convoy||ea.mission.type==="retreat") continue;   // 已在退走者不追（归师勿遏）
      const fortF=1+(c.nodes[sv.at].fort||0)*0.25+(c.nodes[sv.at].wall!=null?0.8:0);
      const grp=mine.filter(a=>this.idle(a)&&["main","reserve","raider"].includes(a.ai)).map(a=>({a,r:a.at===sv.at?{days:0}:c.route(a.at,sv.at,side)})).filter(x=>x.r&&x.r.days/c.speed(x.a)<=2.01);
      const pw=grp.reduce((t,x)=>t+c.power(x.a),0); if(!grp.length||pw<sv.power*fortF*CP.EXPLOIT_RATIO) continue;
      for(const x of grp) opts.push({type:"exploit",score:1.4+(L.int>=CP.FORESIGHT_INT?0.4:0)+P.risk*0.3,army:x.a.id,target:sv.at,text:`令${x.a.name.split(" · ")[0]}乘乱击${sv.name.split(" · ")[0]}于${c.nodes[sv.at].name}`,why:`敌屯粮被焚，军心动摇（估战力仅约 ${Math.round(sv.power/1000)} 千），我可用之兵约 ${Math.round(pw/1000)} 千`}); }
    // ⑧ 火攻营寨：深谋者察敌结营于林木、连营相接，待酷暑大风而纵火
    if(L.int>=CP.FIRE_INT&&!(hp&&hp.noRaid)){ const cand=Object.values(c.nodes).filter(n=>n.owner===this.en&&Object.values(seen).some(sv=>sv.at===n.id&&!sv.convoy)&&(n.cover==="林"||n.type==="camp")&&n.wall==null);
      for(const n of cand){ const chain=c.nbrs(n.id).filter(x=>x.d<=1&&c.nodes[x.n].owner===this.en&&(c.nodes[x.n].cover==="林"||c.nodes[x.n].type==="camp")&&Object.values(seen).some(sv=>sv.at===x.n)).length;
        const ep=this.enemyPowerAt(n.id);
        for(const a of mine.filter(a=>this.idle(a)&&["main","reserve","raider"].includes(a.ai))){ const r=a.at===n.id?{days:0}:c.route(a.at,n.id,side,true); if(!r||r.days/c.speed(a)>1.01) continue;
          const f=c.fireStrength(n.id,a.gen), fNow=f; if(fNow<0.3||(L.int>=CP.FORESIGHT_INT&&(FIRE_WX[c.weather]??1)<1.4)) continue;   // 天时不利则不发：深谋者必待酷暑、大风
          const pw=c.power(a)+mine.filter(x=>x!==a&&x.at===a.at&&this.idle(x)).reduce((t,x)=>t+c.power(x),0)*0.5;
          const sc=0.4+fNow*1.6+chain*0.35+P.guile*0.4+(pw>ep*(1-fNow*0.6)*0.7?0.3:-0.4);
          opts.push({type:"fire",score:sc,army:a.id,target:n.id,text:`令${a.name.split(" · ")[0]}火攻${n.name}`,why:`敌依${n.cover==="林"?"林木":"营寨"}结营${chain?`，与 ${chain} 营相连`:""}；今日${c.weather}，火势可达 ${Math.round(fNow*100)}%`}); } } }
    // ⑦ 我军军心动摇：主帅统帅不足则议退
    for(const a of mine.filter(a=>a.ai==="main"&&a.shaken>0&&a.mission.type!=="retreat")){ const near=Object.values(seen).filter(sv=>{ const r=sv.at===a.at?{days:0}:c.route(sv.at,a.at,this.en); return r&&r.days<=2; }).reduce((t,sv)=>t+sv.power,0);
      if(near>0&&c.rand()<CP.SHAKEN_FLEE*(1.2-L.cmd/100)) opts.push({type:"withdraw",score:2.2,army:a.id,target:a.retreatHome||a.home,text:`${a.name.split(" · ")[0]}退兵`,why:`粮屯被焚，军心动摇，众不可用（统帅 ${L.cmd}）`}); }
    this.posture=(L.int>=60&&myFood>=1.5*enFood&&myFood>8)?"wait":"press";
    this.food={my:myFood,en:enFood};
    return opts.sort((x,y)=>y.score-x.score); }
  assaultRatio(){ const L=this.lord; return CP.ASSAULT_RATIO*(1.25-L.cmd/200)-this.P.atk*0.6; }
  /* 阵前：是否强攻城垒（统帅高者敢攻；料敌粮少的深谋者宁愿困之） */
  assaultDecision(pa,pd,mode,n){ const L=this.lord, T=this.assaultRatio(), r=pa/Math.max(1,pd);
    if(this.posture==="wait") return this.c.rand()<0.05;
    const hp=this.c.postureOf(this.side);
    const fortF=mode==="围城"?1.5:1+(n.fort||0)*0.15; const p=1/(1+Math.exp(-(r-T)*4))*(0.4+L.cmd/160)/fortF*(hp?hp.assaultMul??1:1);
    return this.c.rand()<p; }
  /* 下令 */
  decide(){ const c=this.c, L=this.lord, side=this.side;
    const mine=c.armies.filter(a=>a.side===side&&!a.gone&&(c.alive(a)||a.cargo>0));
    // 例行：运粮队往返、断粮就食（不受迟疑影响）
    for(const a of mine){ const m=a.mission;
      if(a.food<=c.eat(a)&&!c.supplyDepot(a)&&m.type!=="retreat"&&a.ai!=="convoy"){ const dep=Object.values(c.nodes).filter(n=>n.depot&&n.owner===side&&n.depot.food>0).map(n=>({n,r:c.route(a.at,n.id,side)})).filter(x=>x.r).sort((x,y)=>x.r.days-y.r.days)[0];
        if(dep){ c.setOrder(a,"retreat",dep.n.id); c.decision(side,`${a.name} 粮尽，退往${dep.n.name}就食`,"粮尽"); } }
      if(a.ai==="convoy"&&m.type==="hold"&&!a.path.length){ const hd=c.nodes[a.home]; if(a.at===a.home&&hd.depot&&hd.depot.food>=10){ const load=Math.min(CP.CONVOY_LOAD,hd.depot.food); hd.depot.food-=load; a.cargo=load; const su=a.units.filter(u=>u.n==="辎重"&&!u.gone); su.forEach(u=>u.cargo=load/Math.max(1,su.length)); c.setOrder(a,"escort",a.convoyTo,{retreatAt:0.4}); c.note(`${a.name} 自 ${hd.name} 装粮 ${Math.round(load)} 起运`,""); } else if(a.at!==a.home) c.setOrder(a,"retreat",a.home); }
      if(["reserve","raider"].includes(a.ai)&&m.type==="hold"&&a.at!==a.home&&!this.enemyPowerAt(a.at)&&!c.nodes[a.at].depot&&!(c.nodes[a.at].owner===side&&(c.nodes[a.at].fort>0||c.nodes[a.at].wall!=null))) c.setOrder(a,"retreat",a.home); }
    const opts=this.options(); this.lastAdvice=opts.slice(0,4);
    // 迟疑：统帅低者常议而不决
    if(this.c.rand()<CP.STRAT_LAG*(1-L.cmd/100)){ if(opts.length&&opts[0].score>0.6){ c.decision(side,`${L.name}议而未决`,`众议纷纭（统帅 ${L.cmd}）：${opts[0].text}之议被搁置`,"hesitate"); } this.intent="迟疑未决"; return; }
    const cap=Math.max(1,Math.floor((L.cmd-30)/25)); let active=mine.filter(a=>["raid","guard","counter","fire"].includes(a.task)&&a.mission.type!=="hold"&&a.mission.type!=="retreat").length;
    const used=new Set(); const done=[];
    // 根本之地：敌方胜负条件中要夺的我方据点，若敌军两日内可至，至少留一军驻守（不令倾巢而出）
    const vital=new Set((c.sc.victory||[]).filter(v=>v.side===this.en&&v.type==="nodeOwner").map(v=>v.node).filter(id=>c.nodes[id]&&c.nodes[id].owner===side&&Object.values(this.seen).some(sv=>{ const r=sv.at===id?{days:0}:c.route(sv.at,id,this.en); return r&&r.days<=2; })));
    const stay={}; for(const a of mine) if(vital.has(a.at)&&!a.path.length&&c.alive(a)&&a.mission.type!=="retreat"&&!a.cargo) stay[a.at]=(stay[a.at]||0)+1;
    for(const o of opts){ if(o.score<0.35) break; if(used.has(o.army)) continue; const a=c.army(o.army); if(!a) continue;
      if(vital.has(a.at)&&o.target!==a.at&&o.type!=="withdraw"){ if((stay[a.at]||0)<=1) continue; stay[a.at]--; }
      const isOp=["raid","intercept","counter","guard","fire"].includes(o.type); if(isOp&&active>=cap) continue;
      this.exec(o); used.add(o.army); done.push(o); if(isOp) active++; }
    this.intent=done.length?done.map(o=>o.text).join("；"):(c.postureOf(side)?"坚壁相持（史）":this.posture==="wait"?"坚壁不战，待敌粮尽":"静观其变");
  }
  exec(o){ const c=this.c, a=c.army(o.army);
    const map={assault:["attack",{retreatAt:0.55}],fire:["fire",{retreatAt:0.5}],exploit:["attack",{retreatAt:0.45}],relieve:["reinforce",{retreatAt:0.4}],counter:["attack",{retreatAt:0.45}],raid:["raid",{retreatAt:0.5}],intercept:["raid",{retreatAt:0.45}],guard:["reinforce",{retreatAt:0.3}],withdraw:["retreat",{}]};
    const [ty,opt]=map[o.type]; c.setOrder(a,ty,o.target,opt); a.task=o.type; c.decision(this.side,o.text,o.why,o.type); }
}

class Campaign{
  constructor(sc,opts={}){
    const S=JSON.parse(JSON.stringify(sc));
    this.sc=S; this.name=S.name; this.season=S.season; this.sideInfo=S.sides; this.day=1; this.ph=0; this.log=[]; this.pending=[]; this.over=null; this.frames=[]; this.fought={}; this.alerts=[]; this.alertAI={A:false,B:false}; this.reDecided={A:false,B:false}; this.near={A:[],B:[]};
    this.nodes=S.nodes; for(const id in this.nodes){ const n=this.nodes[id]; n.id=id; if(n.depot) n.depot.food0=n.depot.food; if(n.wall!=null) n.wall0=n.wall; }
    this.edges=S.edges.map(([a,b,d])=>({a,b,d}));
    this.control=opts.control||{A:"player",B:"ai"};
    this.seed=(opts.seed!=null&&opts.seed!=="")?(+opts.seed>>>0):Math.floor(Math.random()*1e9); this.rs=this.seed>>>0;   // 随机种子：同种子同设置 → 同一场推演
    const H=S.history||{}; this.hist={on:!!opts.history, tend:opts.tendency??0.7, anchors:(opts.anchors||H.anchors||[]).map(a=>({...a})), outcomes:H.outcomes||[], startDate:H.startDate||(S.calendar&&S.calendar.startDate)||null, dayScale:H.dayScale||(S.calendar&&S.calendar.dayScale)||1};
    this.histFired=[]; this.histDone={}; this.intelAll={A:false,B:false}; this.defected=[];
    let k=0; this.armies=S.armies.map(a=>{ const units=[]; for(const n of UNIT_ORDER) for(let i=0;i<(a.roster[n]||0);i++){ const t=UT[n]; const u={cid:a.id+"-"+(++k),n,men:t.engine?P.ENGINE_CREW:1000,maxMen:t.engine?P.ENGINE_CREW:1000,org:t.org,stam:100,wounded:0}; if(t.engine) u.hp=P.ENGINE_HP; units.push(u); }
      const ar={...a,units,path:[],prog:0,held:0,fort:0,prev:a.at,cargo:a.cargo||0,siegeDays:0,mission:{retreatAt:0,holdDays:2,...a.mission},home:a.home||a.at};
      if(ar.cargo&&units.some(u=>u.n==="辎重")){ const su=units.filter(u=>u.n==="辎重"); su.forEach(u=>u.cargo=ar.cargo/su.length); }
      return ar; });
    this.battles=[]; this.decisions=[]; this.stats=[]; this.events=[]; this.initMen={A:this.sideMen("A"),B:this.sideMen("B")};
    for(const a of this.armies) a.men0=this.combatUnits(a).reduce((t,u)=>t+u.men,0);
    this.strat={A:new StrategicAI(this,"A"),B:new StrategicAI(this,"B")};
    this.rollWeather(); this.note(`${this.name}：${S.desc}`); this.snapshot();
    for(const a of this.armies) if(a.mission.type!=="hold"&&a.mission.target) this.setOrder(a,a.mission.type,a.mission.target,a.mission);
  }
  sideMen(s){ return this.armies.filter(a=>a.side===s&&!a.gone).reduce((t,a)=>t+this.combatUnits(a).reduce((q,u)=>q+u.men,0),0); }
  snapshot(){ const d={day:this.day,men:{A:this.sideMen("A"),B:this.sideMen("B")},power:{A:0,B:0},depots:{},weather:this.weather};
    for(const a of this.armies) if(!a.gone) d.power[a.side]+=this.power(a); for(const n of Object.values(this.nodes)) if(n.depot) d.depots[n.id]=Math.round(n.depot.food*10)/10;
    // 逐日态势：军团位置与据点归属（战役报告的每日战况图用；旧存档没有这两项）
    d.armies=this.armies.map(a=>{ const cu=this.combatUnits(a); return {id:a.id,side:a.side,at:a.at,nx:a.path[0]||null,prog:Math.round((a.prog||0)*100)/100,path:a.path.slice(),
      men:Math.round(cu.reduce((t,u)=>t+u.men,0)),org:cu.length?Math.round(cu.reduce((t,u)=>t+Math.max(0,u.org)/UT[u.n].org,0)/cu.length*100)/100:0,n:cu.length,gone:!!a.gone,mt:a.mission.type,sh:a.shaken>0?1:0}; });
    d.owners={}; for(const n of Object.values(this.nodes)) d.owners[n.id]=n.owner||null;
    const i=this.stats.findIndex(x=>x.day===this.day); if(i>=0) this.stats[i]=d; else this.stats.push(d); }
  decision(side,text,why,kind=""){ this.decisions.push({day:this.day,side,lord:this.sideInfo[side].lord?this.sideInfo[side].lord.name:"",text,why,kind}); this.note(`【${this.sideInfo[side].lord?this.sideInfo[side].lord.name:this.sideName(side)}】${text}——${why}`,kind==="hesitate"?"":"ai"); }
  rand(){ let t=(this.rs+=0x6D2B79F5)|0; t=Math.imul(t^(t>>>15),1|t); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }
  randInt(){ return Math.floor(this.rand()*4294967296); }
  /* ───── 历史模式：史实锚点按"史实倾向"的概率把随机推向史实 ───── */
  histTry(a,extra=1){ if(!this.hist.on||a.off||this.histDone[a.id]) return false; const p=Math.min(1,(a.weight??1)*this.hist.tend*extra); const ok=this.rand()<p; this.histDone[a.id]=ok?"fired":"missed";
    if(ok){ this.histFired.push({day:this.day,id:a.id,text:a.text}); this.note(`〔史〕${a.text}`,"hist"); } return ok; }
  postureOf(side){ const p=this.histPosture&&this.histPosture[side]; return p&&(p.until==null||this.day<=p.until)?p:null; }
  anchors(type){ return this.hist.on?this.hist.anchors.filter(a=>a.type===type&&!a.off&&!this.histDone[a.id]):[]; }
  trig(a){ if(a.day!=null&&this.day<a.day) return false; if(a.trigger){ const [k,node,f]=a.trigger.split(":"); if(k==="fire"){ return this.events.some(e=>e.type==="fire"&&e.node===node&&e.f>0); } if(k==="depotLost"){ const n=this.nodes[node]; return !!n&&n.depot&&n.depot.food<=n.depot.food0*(1-(+f||0.5)); } if(k==="day") return this.day>=+node; }
    return true; }
  histDayStart(){ if(!this.hist.on) return;
    for(const a of this.anchors("posture")) if(this.trig(a)&&this.histTry(a)){ this.histPosture=this.histPosture||{}; this.histPosture[a.side]=a; }
    for(const a of this.anchors("intel")) if(this.trig(a)&&this.histTry(a)){ this.intelAll[a.side]=true; this.raidBonus=this.raidBonus||{}; this.raidBonus[a.side]=a.bonus||1.3; }
    for(const a of this.anchors("order")) if(this.trig(a)){ const ar=this.army(a.army); if(!ar||ar.gone||!this.alive(ar)) { this.histDone[a.id]="missed"; continue; }
      if(this.control[ar.side]==="player"){ this.histHint=this.histHint||{}; if(!this.histHint[a.id]) this.alert("hist",ar.side,`史实之机：${a.text}`); this.histHint[a.id]=a; continue; }
      if(this.histTry(a)){ this.setOrder(ar,a.mission,a.target,{retreatAt:a.retreatAt??ar.mission.retreatAt});
        if(a.holdOthers) for(const [id,nd] of Object.entries(a.holdOthers)){ const o=this.army(id); if(o&&!o.gone&&this.alive(o)&&o.side===ar.side){ if(o.at!==nd) this.setOrder(o,"reinforce",nd,{retreatAt:0.3}); else this.setOrder(o,"hold",nd); o.task=""; o.histLock=this.day+(a.lock||3); } } ar.task=a.mission==="raid"?"raid":ar.task; this.decision(ar.side,`${ar.name.split(" · ")[0]}：${MISSION_NAME[a.mission]}${a.target?this.nodes[a.target].name:""}`,`史实：${a.text}`,a.mission==="raid"?"raid":a.mission==="retreat"?"withdraw":""); } }
    for(const a of this.anchors("morale").concat(this.anchors("defect"))) if(this.trig(a)&&this.histTry(a)){
      if(a.type==="morale"){ for(const ar of this.armies) if(ar.side===a.side&&!ar.gone) for(const u of ar.units){ u.org=Math.max(0,u.org-UT[u.n].org*(a.org||0.2)); if(!UT[u.n].supply) u.men*=1-(a.desert||0); } }
      if(a.type==="defect"&&(!a.to||a.to==="none")){ const ar=this.army(a.army); if(ar&&!ar.gone){ ar.gone=true; for(const u of ar.units) u.gone=true; this.defected.push(ar.id); this.note(`${ar.name} 率所部降于他国，离开战场`,"big"); } continue; }
      if(a.type==="defect"){ const ar=this.army(a.army); if(ar&&!ar.gone&&this.alive(ar)){ ar.side=a.to; ar.ai=a.ai||"reserve"; ar.home=a.joinAt||ar.home; ar.name=ar.name+"（降）"; this.defected.push(ar.id); if(a.joinAt){ ar.at=a.joinAt; ar.prev=a.joinAt; ar.path=[]; ar.prog=0; this.setOrder(ar,"hold",a.joinAt); } else this.setOrder(ar,"retreat",ar.home); this.note(`${ar.name} 倒戈，投奔${a.joinAt?this.nodes[a.joinAt].name:this.sideName(a.to)}`,"big"); } } } }
  note(t,kind=""){ this.log.push({day:this.day,ph:this.ph,t,kind}); if(this.log.length>400) this.log.shift(); }
  sideName(s){ return this.sideInfo[s].name; }
  army(id){ return this.armies.find(a=>a.id===id); }
  edge(a,b){ return this.edges.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)); }
  nbrs(n){ return this.edges.filter(e=>e.a===n||e.b===n).map(e=>({n:e.a===n?e.b:e.a,d:e.d})); }
  rollWeather(){ if(this.hist&&this.hist.startDate&&this.sc.dynamicSeason!==false) this.season=this.dateOf(this.day).season;
    if(this.weather&&this.day>1&&this.rand()<CP.WX_PERSIST&&!(this.hist&&this.hist.on&&this.anchors("weather").some(a=>a.day===this.day))){ if(this.weather!=="酷暑"||this.season==="夏") return; }
    if(this.hist&&this.hist.on){ for(const a of this.anchors("weather")) if(a.day===this.day&&this.histTry(a)){ this.weather=a.value; return; } } const t=WEATHER_TABLE[this.season]||WEATHER_TABLE.秋; let r=this.rand(), w="晴"; for(const [k,p] of Object.entries(t)){ if(r<p){ w=k; break; } r-=p; } this.weather=w; }
  /* 最短路（日数）。avoid：绕开有敌军驻扎的节点（目标节点除外） */
  route(from,to,side,avoid=false){ const dist={},prev={},Q=new Set(Object.keys(this.nodes)); for(const n of Q) dist[n]=Infinity; dist[from]=0;
    while(Q.size){ let u=null; for(const n of Q) if(u===null||dist[n]<dist[u]) u=n; Q.delete(u); if(dist[u]===Infinity||u===to) break;
      for(const {n,d} of this.nbrs(u)){ if(avoid&&n!==to&&this.enemyAt(n,side)) continue; const nd=dist[u]+d; if(nd<dist[n]){ dist[n]=nd; prev[n]=u; } } }
    if(dist[to]===Infinity) return null; const p=[]; for(let x=to;x!==from;x=prev[x]) p.unshift(x); return {path:p,days:dist[to]}; }
  enemyAt(node,side){ return this.armies.some(a=>a.side!==side&&a.at===node&&!a.path.length&&this.alive(a)); }
  alive(a){ return a.units.some(u=>!u.gone&&u.n!=="辎重"&&u.men>50); }
  combatUnits(a){ return a.units.filter(u=>!u.gone&&u.n!=="辎重"&&u.men>50); }
  speed(a){ const cu=a.units.filter(u=>!u.gone&&u.men>50); if(!cu.length) return 1; if(cu.some(u=>UT[u.n].engine)) return 0.5; if(cu.every(u=>UT[u.n].cav)) return 2; return 1; }
  eat(a){ return this.combatUnits(a).length/10*CP.EAT_PER_10; }
  power(a){ return this.combatUnits(a).reduce((s,u)=>s+u.men*Math.max(0,u.org)/UT[u.n].org,0); }
  setOrder(a,type,target,opt={}){
    a.mission={...a.mission,type,target:target||null,holdDays:opt.holdDays??a.mission.holdDays??2,retreatAt:opt.retreatAt??a.mission.retreatAt??0,returnTo:opt.returnTo||a.mission.returnTo||a.home};
    a.held=0;
    const dest = type==="retreat"?(target||a.mission.returnTo||a.home):(type==="hold"?a.at:target);
    if(dest&&dest!==a.at){ const r=this.route(a.at,dest,a.side,type==="raid"||type==="escort"); a.path=r?r.path:[]; a.prog=0; } else { a.path=[]; a.prog=0; }
    this.markOrder(a);
  }
  /* 下令之时记下"示意大箭头"：自下令处至目的地，此后不随行军更新，抵达或改令即撤 */
  markOrder(a){ a.order=a.path.length?{seq:[a.at,...a.path],day:this.day,ph:this.ph,type:a.mission.type}:null; }
  /* ───── 时段：（每日首段）AI 下令 → 行军 → 相遇检定。一日六段，见 PERIODS ───── */
  marchPh(a){ return ["raid","fire"].includes(a.mission.type)?MARCH_NIGHT:MARCH_DAY; }
  get tick(){ return this.day*6+this.ph; }
  timeText(ph=this.ph){ return PERIODS[ph].n; }
  /* 事件：界面据此暂停（只看玩家一方），AI 一方据"敌情 / 粮仓"临时重议 */
  alert(kind,side,text){ this.alerts.push({kind,side,text,day:this.day,ph:this.ph}); if((kind==="sight"||kind==="depot")&&this.control[side]==="ai") this.alertAI[side]=true; }
  beginPeriod(){
    if(this.over) return [];
    this.alerts=[]; this.pending=[]; const ph=this.ph, now=this.tick;
    if(ph===0){ this.reDecided={A:false,B:false}; this.histDayStart(); for(const s of ["A","B"]) if(this.control[s]==="ai") this.aiOrders(s); }
    else for(const s of ["A","B"]) if(this.control[s]==="ai"&&this.alertAI[s]&&!this.reDecided[s]){ this.reDecided[s]=true; this.alertAI[s]=false; this.aiOrders(s); }   // 敌情突变：当日临时重议一次
    // 行军（目的地未到而路线中断者，重新择路）
    for(const a of this.armies){ a.arrived=false; a.met=false; a.moving=a.path.length&&a.prog>0?a.path[0]:null;
      if(a.gone||a.path.length) continue; const m=a.mission; const dest=m.type==="retreat"?(m.target||m.returnTo||a.home):(["attack","raid","fire","reinforce","escort","delay"].includes(m.type)?m.target:null);
      if(dest&&dest!==a.at){ const r=this.route(a.at,dest,a.side,m.type==="raid"||m.type==="escort"||m.type==="fire"); if(r){ a.path=r.path; this.markOrder(a); } } }
    for(const a of this.armies){ if(!this.alive(a)&&!(a.units.some(u=>u.n==="辎重"&&!u.gone))) continue; a.moved=false; if(!a.path.length) continue;
      if((a.busy||0)>now||!this.marchPh(a).includes(ph)) continue;   // 交战未毕，或非行军时段（扎营）
      const nx=a.path[0], e=this.edge(a.at,nx); if(!e){ a.path=[]; continue; }
      a.prog+=this.speed(a)/MARCH_DAY.length; a.moving=nx; a.moved=true;
      if(a.prog>=e.d-1e-9){ a.prev=a.at; a.at=nx; a.path.shift(); a.prog=0; a.moving=null; a.arrived=true; a.siegeDays=0;
        if(!a.path.length) this.alert("arrive",a.side,`${a.name} 抵达${this.nodes[a.at].name}`); } }
    // 途中相遇（同一条路相向而行）。截粮、火攻的奇兵夜从间道出，不与敌在路上相遇
    const eng=[], stealth=a=>["raid","fire"].includes(a.mission.type);
    for(const a of this.armies) for(const b of this.armies){ if(a.side!=="A"||b.side!=="B"||!a.moving||!b.moving||stealth(a)||stealth(b)) continue;
      if(a.moving===b.at&&b.moving===a.at){ const e=this.edge(a.at,b.at); if(a.prog+b.prog>=e.d-1e-9){ const meet=a.prog>=b.prog?b.at:a.at; a.at=meet; b.at=meet; a.path=[]; b.path=[]; a.prog=b.prog=0; a.moving=b.moving=null; a.met=b.met=true; } } }
    // 同一节点相遇：一地一日至多一战。相持之地每日清晨接战（或对垒）；新到者上午以前、奇袭或途中遭遇即战，过午则隔营相望，来日清晨再战
    const byNode={}; for(const a of this.armies){ if(a.moving) continue; if(!this.alive(a)&&!a.units.some(u=>u.n==="辎重"&&!u.gone)) continue; (byNode[a.at]=byNode[a.at]||[]).push(a); }
    for(const [node,list] of Object.entries(byNode)){ const sides=new Set(list.map(a=>a.side)); if(sides.size<2) continue;
      for(const a of list){ if(a.path.length){ a.path=[]; a.prog=0; } }   // 遇敌即止
      if(this.fought[node]===this.day) continue;
      if(list.some(a=>(a.busy||0)>now)) continue;
      const fresh=list.some(a=>a.arrived||a.met), raidy=list.some(a=>(a.arrived||a.met)&&["raid","fire"].includes(a.mission.type));
      const go=ph===1||(fresh&&(list.some(a=>a.met)||raidy||ph<=CP.LATE_ENGAGE_PH));
      if(!go){ if(fresh){ for(const a of list) if(a.arrived) a.lateArr=true; this.note(`${this.nodes[node].name}：${PERIODS[ph].night?"夜幕已垂":"日已过午"}，两军隔营相望，约期来日`,""); } continue; }
      for(const a of list) if(a.lateArr){ a.arrived=true; a.lateArr=false; }   // 昨日晚到者，今晨作新到之军论
      const e=this.makeEngagement(node,list); e.ph=ph; e.rounds=PERIODS[ph].night?CP.NIGHT_ROUNDS:PERIOD_ROUNDS[ph]; if(PERIODS[ph].night&&this.weather!=="雨") e.night=true;
      e.id="E"+this.day+"-"+ph+"-"+node; e.met=list.some(a=>a.met); this.fought[node]=this.day; eng.push(e);
      for(const s of ["A","B"]) this.alert("contact",s,`${this.nodes[node].name}：${this.sideName(e.att)}攻${this.sideName(e.def)}（${e.mode}${e.night?"·夜":""}）`); }
    if(ph===1) for(const a of this.armies) a.lateArr=false;   // 晚到之约只到次日清晨
    // 敌军占据无人守卫的粮仓 / 城池（每军每日至多一次）
    for(const a of this.armies){ if(a.moving||!this.alive(a)||a.lootDay===this.day) continue; const n=this.nodes[a.at]; if(byNode[a.at]&&new Set(byNode[a.at].map(x=>x.side)).size>1) continue;
      if(n.owner&&n.owner!==a.side&&!this.armies.some(x=>x.side===n.owner&&x.at===a.at&&this.alive(x))){
        if(n.depot&&n.depot.food>0){ a.lootDay=this.day; if(a.mission.type==="attack"){ n.owner=a.side; this.note(`${a.name} 占领 ${n.name}，缴获存粮 ${Math.round(n.depot.food)}`,"big"); }
          else { const b=n.depot.food*CP.RAID_UNGUARDED; n.depot.food-=b; this.depotLoss(n,b); this.note(`${a.name} 于 ${n.name} 纵火焚粮 ${Math.round(b)}`,"big"); } }
        else if(a.mission.type==="attack"&&n.type!=="road"&&n.type!=="ford"){ n.owner=a.side; this.note(`${a.name} 占领 ${n.name}`,"big"); } } }
    // 火攻：到达目标营寨的火攻军团先纵火，再接战
    for(const e of eng){ const fa=e.armies[e.att].map(id=>this.army(id)).filter(a=>a&&a.mission.type==="fire"&&a.mission.target===e.node); if(fa.length) this.fireAttack(e.node,e.def,fa); }
    for(const a of this.armies){ if(a.moving||!this.alive(a)||a.mission.type!=="fire"||a.at!==a.mission.target) continue; const n=this.nodes[a.at];
      if(n.owner&&n.owner!==a.side&&!this.armies.some(x=>x.side===n.owner&&x.at===a.at&&this.alive(x))){ this.fireAttack(a.at,n.owner,[a]); } }
    this.pending=eng; return eng;
  }
  /* 时段终了：敌情检视、记录态势；第六段终了即日终 */
  endPeriod(){
    if(this.over) return;
    this.sightCheck(); this.frame(); this.pending=[];
    if(this.ph<PERIODS.length-1){ this.ph++; return; }
    this.dayEnd();   // 日终结算记在当日前半夜，dayEnd 末尾翻到次日后半夜
  }
  /* 兼容旧接口（测试、命令行推演）：beginDay 推进时段直到出现交战或一日终了；endDay 走完当日余下时段（其后交战一律速决） */
  beginDay(){ this.dayRolled=false;
    while(!this.over){ const eng=this.beginPeriod(); if(eng.length) return eng; const d=this.day; this.endPeriod(); if(this.day!==d){ this.dayRolled=true; return []; } } return []; }
  endDay(){ if(this.dayRolled){ this.dayRolled=false; return; } if(this.over) return;
    const d=this.day; this.endPeriod(); while(!this.over&&this.day===d){ for(const e of this.beginPeriod()) if(!e.done) this.resolveAuto(e); this.endPeriod(); } }
  /* 道路距离（日），不计敌军；用于敌情判断 */
  roadDist(){ if(this._rd) return this._rd; const ids=Object.keys(this.nodes), D={}; for(const a of ids){ D[a]={}; for(const b of ids) D[a][b]=a===b?0:Infinity; }
    for(const e of this.edges){ D[e.a][e.b]=Math.min(D[e.a][e.b],e.d); D[e.b][e.a]=Math.min(D[e.b][e.a],e.d); }
    for(const k of ids) for(const i of ids) for(const j of ids) if(D[i][k]+D[k][j]<D[i][j]) D[i][j]=D[i][k]+D[k][j];
    Object.defineProperty(this,"_rd",{value:D,enumerable:false,writable:true}); return D; }
  sightCheck(){ const D=this.roadDist();
    for(const s of ["A","B"]){ const posts=[...Object.values(this.nodes).filter(n=>n.owner===s&&(n.depot||n.wall!=null||n.fort>0)).map(n=>n.id),...this.armies.filter(a=>a.side===s&&!a.gone&&this.alive(a)).map(a=>a.at)];
      const now=this.armies.filter(a=>a.side!==s&&!a.gone&&this.alive(a)&&posts.some(p=>Math.min(D[a.at][p],a.moving?D[a.moving][p]:Infinity)<=CP.NEAR_DAYS)).map(a=>a.id);
      const prev=new Set(this.near[s]||[]); for(const id of now) if(!prev.has(id)){ const a=this.army(id); this.alert("sight",s,`斥候报：${a.name} 出现在${this.nodes[a.moving||a.at].name}一带`); }
      this.near[s]=now; } }
  /* 每时段态势（报告的逐时段回放用）：[id, at, next, prog, gone, 任务, 兵员, 组织, 部数, 动摇] */
  frame(){ const o={}; for(const n of Object.values(this.nodes)) o[n.id]=n.owner||null;
    const dp={}; for(const n of Object.values(this.nodes)) if(n.depot) dp[n.id]=Math.round(n.depot.food*10)/10;
    this.frames.push({d:this.day,p:this.ph,w:this.weather,o,dp,a:this.armies.map(a=>{ const cu=this.combatUnits(a); return [a.id,a.at,a.path[0]||null,Math.round((a.prog||0)*100)/100,a.gone?1:0,a.mission.type,Math.round(cu.reduce((t,u)=>t+u.men,0)),cu.length?Math.round(cu.reduce((t,u)=>t+Math.max(0,u.org)/UT[u.n].org,0)/cu.length*100)/100:0,cu.length,a.shaken>0?1:0,a.side,a.path.slice(),a.order&&a.path.length?a.order.seq:null]; })}); }
  /* 火攻营寨：火势 = 基数 × 天时 × 林木/营寨 × 主将智略；可沿 1 日内相邻的己方营寨蔓延（火烧连营） */
  fireStrength(node,gen,wx){ const n=this.nodes[node]; const cover=n.cover==="林"?1.5:(n.type==="camp"?1:(n.wall!=null?0.4:0.8)); return Math.min(1,CP.FIRE_BASE*(FIRE_WX[wx??this.weather]??1)*cover*(0.6+(gen?gen.int:60)/250)); }
  fireAttack(node,defSide,fa){ const lead=fa.slice().sort((x,y)=>y.gen.int-x.gen.int)[0]; let f=this.fireStrength(node,lead.gen); const n0=this.nodes[node];
    for(const a of fa){ a.mission={...a.mission,type:"attack",target:node,retreatAt:Math.max(a.mission.retreatAt||0,0.45)}; a.task="fire"; }
    if(f<0.08){ this.note(`${lead.name} 欲火攻${n0.name}，${this.weather==="雨"?"天雨":"火不能起"}，改为强攻`,"bad"); this.events.push({day:this.day,ph:this.ph,type:"fire",node,side:defSide,f:0,burned:[],by:fa[0].side}); return; }
    const burned=[]; const burn=(id,fx)=>{ const n=this.nodes[id]; burned.push({node:id,f:fx});
      for(const a of this.armies){ if(a.side!==defSide||a.gone||a.at!==id) continue; for(const u of a.units){ if(u.gone) continue; const t=UT[u.n]; u.org=Math.max(0,u.org-t.org*CP.FIRE_ORG*fx); u.men*=1-CP.FIRE_MEN*fx*(t.engine||t.supply?2:1); if(t.supply&&u.cargo) u.cargo*=1-fx*0.8; }
        a.fort=Math.max(0,(a.fort||0)-CP.FIRE_FORT*fx); a.shaken=Math.max(a.shaken||0,2); if(a.cargo) a.cargo=a.units.filter(u=>u.n==="辎重"&&!u.gone).reduce((s,u)=>s+(u.cargo||0),0); }
      if(n.fort) n.fort=Math.max(0,Math.round((n.fort-CP.FIRE_FORT*fx)*10)/10);
      if(n.depot&&n.depot.food>0&&n.owner===defSide){ const b=n.depot.food*Math.min(1,fx*0.9); n.depot.food-=b; this.depotLoss(n,b); } };
    burn(node,f); const seen=new Set([node]); let front=[{id:node,f}];
    while(front.length){ const nx=[]; for(const {id,f:fx} of front) for(const {n:nb,d} of this.nbrs(id)){ if(seen.has(nb)||d>1) continue; const N=this.nodes[nb];
        const camp=N.owner===defSide&&(N.type==="camp"||N.cover==="林")&&N.wall==null&&this.armies.some(a=>a.side===defSide&&a.at===nb&&!a.gone);
        if(!camp) continue; seen.add(nb); const f2=fx*0.75; if(this.rand()<fx*CP.FIRE_SPREAD){ burn(nb,f2); nx.push({id:nb,f:f2}); } } front=nx; }
    this.events.push({day:this.day,ph:this.ph,type:"fire",node,side:defSide,f,burned:burned.map(b=>b.node),by:fa[0].side}); this.alert("shaken",defSide,`${n0.name}遭火攻`);
    this.note(`${lead.name} 火攻${n0.name}（${this.weather}${n0.cover==="林"?"·林木":""}，火势 ${Math.round(f*100)}%）${burned.length>1?`，火势蔓延，连焚 ${burned.map(b=>this.nodes[b.node].name).join("、")} 共 ${burned.length} 营`:""}`,"big");
    if(burned.length>=CP.FIRE_SHOCK_CAMPS){ const sev=Math.min(1,CP.BURN_SEV_BASE+0.15*burned.length); let hit=0,k=0;
      for(const a of this.armies){ if(a.side!==defSide||a.gone) continue; const near=burned.some(b=>b.node===a.at); for(const u of a.units){ if(u.gone) continue; const t=UT[u.n]; if(near) continue; const d=t.org*CP.BURN_ORG*sev*CP.BURN_FAR; u.org=Math.max(0,u.org-d); hit+=d/t.org; k++; } a.shaken=Math.max(a.shaken||0,CP.SHAKEN_DAYS); }
      this.events.push({day:this.day,ph:this.ph,type:"shock",node,side:defSide,sev,org:Math.round(hit/Math.max(1,k)*100),cause:"fire"});
      this.note(`连营被焚，${this.sideName(defSide)}军心大震，${CP.SHAKEN_DAYS} 日内组织难复`,"bad"); } }
  makeEngagement(node,list){
    const n=this.nodes[node]; const sidesP={A:list.filter(a=>a.side==="A"),B:list.filter(a=>a.side==="B")};
    // 守方：节点主人且有城垒；否则先到者；都是新到则遭遇
    let def=null; if(n.owner&&sidesP[n.owner].length&&(n.wall!=null||n.fort>0)) def=n.owner;
    else { const st=s=>sidesP[s].every(a=>!a.arrived&&!a.met); if(st("A")&&!st("B")) def="A"; else if(st("B")&&!st("A")) def="B"; }
    const att=def?(def==="A"?"B":"A"):(sidesP.A.some(a=>["attack","raid","fire"].includes(a.mission.type))?"A":"B");
    let mode="攻守"; if(!def) mode="遭遇"; else if(n.wall!=null&&n.owner===def) mode="围城"; else if((n.fort>0&&n.owner===def)||sidesP[def].some(a=>a.fort>0.3)) mode="阵地";
    const night=sidesP[att].some(a=>a.mission.type==="raid")&&this.weather!=="雨";
    const e={id:"E"+this.day+"-"+node, node, att, def:att==="A"?"B":"A", mode, night, armies:{A:sidesP.A.map(a=>a.id),B:sidesP.B.map(a=>a.id)}, done:false};
    // 持续相峙：守方据城垒，攻方并非今日新到 → 可选择"对垒不战"
    e.canStandoff=(mode==="阵地"||mode==="围城")&&sidesP[att].every(a=>!a.arrived&&!a.met)&&!sidesP[att].some(a=>a.mission.type==="raid"||(a.mission.type==="fire"&&a.mission.target===node));
    if(e.canStandoff&&this.control[att]==="ai"){ const pa=sidesP[att].reduce((s,a)=>s+this.power(a),0), pd=sidesP[e.def].reduce((s,a)=>s+this.power(a),0)*this.strat[att].noise();
      e.standoff=!this.strat[att].assaultDecision(pa,pd,mode,n); }
    return e;
  }
  /* 战斗规格：攻方为战斗中的 A（红），守方为 B */
  battleSpec(e){
    const n=this.nodes[e.node]; const side=(cs)=>{ const arms=e.armies[cs].map(id=>this.army(id)); const lead=arms.slice().sort((x,y)=>this.power(y)*(y.gen.cmd)-this.power(x)*(x.gen.cmd))[0]||arms[0];
      const units=[]; for(const a of arms) for(const u of a.units) if(!u.gone&&u.men>1&&!(u.routed)) units.push({n:u.n,men:u.men,maxMen:u.maxMen,org:u.org,stam:u.stam,hp:u.hp,cargo:u.cargo,cid:u.cid,army:a.id,wounded:u.wounded});
      // 节点粮仓化为粮垛（辎重），归节点主人
      if(n.depot&&n.owner===cs&&n.depot.food>0){ const k=Math.max(1,Math.min(6,Math.round(n.depot.food/CP.DEPOT_UNITS_PER))); for(let i=0;i<k;i++) units.push({n:"辎重",men:1000,maxMen:1000,cid:"DEPOT:"+i,cargo:n.depot.food/k}); }
      const mt=lead.mission.type; const m={type:mt==="raid"?"destroy":mt==="escort"?"escort":(mt==="delay"?"delay":(mt==="hold"&&cs===e.def?"hold":"rout")),retreatAt:lead.mission.retreatAt||0,holdRounds:0,goal:mt==="raid"?(lead.mission.goal??CP.RAID_GOAL):undefined};
      return {cmd:lead.gen.cmd,int:lead.gen.int,genPos:lead.gen.genPos,formation:lead.gen.formation||"FANG",resolve:70,units,mission:m,label:arms.map(a=>a.name).join("、"),
        fort:cs===e.def?Math.max(n.owner===cs?(n.fort||0):0,...arms.map(a=>a.fort||0)):Math.max(0,...arms.map(a=>a.fort||0)),
        wall:(cs===e.def&&n.owner===cs&&n.wall!=null)?n.wall:undefined, ai:{on:true,persona:lead.gen.persona,forced:""},
        roster:Object.fromEntries(UNIT_ORDER.map(k=>[k,units.filter(u=>u.n===k).length]))}; };
    const A=side(e.att), B=side(e.def);
    const luckBias={}; if(this.hist.on&&this.hist.tend>0) for(const a of this.hist.anchors.filter(a=>a.type==="luck"&&!a.off&&(!a.node||a.node===e.node)&&(a.day==null||this.day>=a.day))){ const bs=a.side===e.att?"A":"B"; luckBias[bs]=(luckBias[bs]||1)*(1+((a.value||1.2)-1)*Math.min(1,this.hist.tend*(a.weight??1)));
      if(!this.histDone[a.id]) (e.histLuck=e.histLuck||[]).push(a.id); }
    return {seed:this.randInt(),luckBias,terrain:n.terrain||"平原",mode:e.mode==="围城"&&B.wall==null?"阵地":e.mode,days:1,rounds:e.rounds||P.DAY_ROUNDS,hold:0,weather:this.weather,night:e.night,A,B,
      campaign:{eid:e.id,node:e.node,day:this.day,ph:e.ph??this.ph,att:e.att,def:e.def,nodeName:n.name}};
  }
  /* 战斗结果写回 */
  applyBattle(e,bt){
    const n=this.nodes[e.node]; const r=bt.result(); const map={A:e.att,B:e.def};   // 战斗方 → 战役方
    const byCid={}; for(const a of this.armies) for(const u of a.units) byCid[u.cid]=u;
    const cargo0={}; for(const cs of ["A","B"]) for(const id of e.armies[cs]){ const a=this.army(id); if(a&&a.cargo>0) cargo0[id]=a.cargo; }
    const pre={}; for(const cs of ["A","B"]) pre[cs]=e.armies[cs].reduce((t,id)=>t+this.power(this.army(id)),0);
    let depotLeft=0, depotHad=0, captured=0;
    for(const bs of ["A","B"]) for(const u of bt[bs].units){
      if(u.cid&&u.cid.startsWith("DEPOT")){ depotHad+=u.cargo||0; depotLeft+=(u.cargo||0)*Math.max(0,u.men)/u.maxMen; if(u.captured) captured+=0; continue; }
      const cu=byCid[u.cid]; if(!cu) continue; cu.men=Math.max(0,u.men); cu.org=Math.max(0,u.org); cu.stam=u.stamina; cu.wounded=u.wounded||0; cu.routed=!!u.routed&&!u.isSupply; if(u.hp!=null) cu.hp=u.hp; if(u.destroyed) cu.gone=true;
      if(u.isSupply&&cu.cargo!=null){ cu.cargo=cu.cargo*Math.max(0,u.men)/u.maxMen; if(u.men<=1) cu.gone=true; } }
    // 粮仓
    if(depotHad>0&&n.depot){ const before=n.depot.food; n.depot.food=depotLeft; const loss=before-depotLeft; if(loss>0.5){ this.note(`${n.name} 粮仓被焚 ${Math.round(loss)}（余 ${Math.round(depotLeft)}）`,"big"); this.depotLoss(n,loss); } }
    for(const a of this.armies) if(a.units.some(u=>u.n==="辎重")) a.cargo=a.units.filter(u=>u.n==="辎重"&&!u.gone).reduce((s,u)=>s+(u.cargo||0),0);
    for(const [id,c0] of Object.entries(cargo0)){ const a=this.army(id); const l=c0-(a.cargo||0); if(l>0.5) this.convoyLoss(a,l,c0); }
    const wB=r.winner==="相持"?null:r.winner, wC=wB?map[wB]:null, lC=wC?(wC==="A"?"B":"A"):null;
    const span=Math.max(1,Math.ceil((bt.rnd||1)/(P.DAY_ROUNDS/4))); for(const cs of ["A","B"]) for(const id of e.armies[cs]){ const a=this.army(id); if(a) a.busy=this.tick+span; }   // 交战占去的时段
    const eph=e.ph??this.ph, tw=e.night?(PERIODS[eph].night?"·夜":"·拂晓奇袭"):"";
    const desc=`${n.name}之战（${PERIODS[eph].n}·${e.mode}${tw}${this.weather!=="晴"?"·"+this.weather:""}）：${r.reason==="目标达成撤出"&&bt.retreatSide?this.sideName(map[bt.retreatSide.name])+"目标达成，撤出":(wC?this.sideName(wC)+"胜·"+r.reason:"相持")}；${this.sideName(e.att)}损 ${Math.round(r.A.loss*100)}%，${this.sideName(e.def)}损 ${Math.round(r.B.loss*100)}%${r.A.burnt>0.01||r.B.burnt>0.01?`；焚辎重 ${Math.round(Math.max(r.A.burnt,r.B.burnt)*100)}%`:""}`;
    this.note(desc,"battle");
    const menOf=cs=>e.armies[cs].reduce((t,id)=>t+this.combatUnits(this.army(id)).reduce((q,u)=>q+u.men,0),0);
    this.battles.push({day:this.day,ph:e.ph??this.ph,met:!!e.met,node:e.node,place:n.name,mode:e.mode,night:e.night,weather:this.weather,att:e.att,def:e.def,armies:{A:e.armies.A.map(id=>this.army(id).name),B:e.armies.B.map(id=>this.army(id).name)},
      lossPct:{[e.att]:r.A.loss,[e.def]:r.B.loss},burnt:Math.max(r.A.burnt||0,r.B.burnt||0),depotBurn:depotHad>0?depotHad-depotLeft:0,winner:wC,reason:r.reason,raidOk:(r.A.missionDone==="success"&&r.A.mission==="destroy")?e.att:((r.B.missionDone==="success"&&r.B.mission==="destroy")?e.def:null),desc,
      armyIds:{A:[...e.armies.A],B:[...e.armies.B]}});
    for(const id of e.histLuck||[]){ const a=this.hist.anchors.find(x=>x.id===id), rec=this.battles[this.battles.length-1]; if(!a||this.histDone[id]) continue;   // 战运锚点：仅在战果合于史时记入史
      if(rec.winner===a.side||rec.raidOk===a.side||(a.side===e.att&&rec.burnt>0.3)||(a.side===e.def&&!rec.winner)){ this.histDone[id]="fired"; this.histFired.push({day:this.day,id,text:a.text,node:e.node}); this.note(`〔史〕${a.text}`,"hist"); } }
    e.histLuck=null;
    // 目标达成 / 撤退 / 溃败
    for(const bs of ["A","B"]){ const cs=map[bs], res=r[bs]; const arms=e.armies[cs].map(id=>this.army(id));
      for(const a of arms){
        if(res.missionDone==="success"&&a.mission.type==="raid"){ this.note(`${a.name} 焚粮得手，引兵撤回`,"good"); this.setOrder(a,"retreat",a.mission.returnTo||a.home); continue; }
        if(cs===lC&&cs===e.def&&!res.withdrew&&(n.fort>0||n.wall!=null)&&n.owner===cs){ const post=e.armies[cs].reduce((t,id)=>t+this.power(this.army(id)),0);
          if(post>=CP.HOLD_AFTER_LOSS*pre[cs]){ this.note(`${a.name} 阵前失利，退入营垒坚守`,"bad"); continue; } }
        if(cs===lC){ const back=this.retreatNode(a,e.node); this.note(`${a.name} ${res.withdrew?"撤出战场":"败退"}，退往 ${this.nodes[back].name}`, "bad"); const goOn=a.mission.type==="retreat"&&a.mission.target&&a.mission.target!==back?a.mission.target:(a.mission.then||null); this.setOrder(a,"retreat",back); if(goOn) a.mission.then=goOn;
          if(!res.withdrew) for(const u of a.units) if(u.routed&&this.rand()>CP.RALLY){ u.men*=0.5; } }
        else if(wC===cs&&a.mission.type==="raid"&&!this.armies.some(x=>x.side!==cs&&x.at===e.node&&this.alive(x))){ /* 胜后若敌粮已空则撤 */ }
      } }
    // 城、营被攻破
    if(wC&&wC===e.att&&n.owner===e.def){ const defLeft=this.armies.some(x=>x.side===e.def&&x.at===e.node&&this.alive(x)&&!x.path.length);
      if(!defLeft&&n.type!=="road"&&n.type!=="ford"){ const raid=e.armies[e.att].some(id=>this.army(id).mission.type==="raid"); n.owner=e.att; if(n.wall!=null) n.wall=Math.max(0.3,bt.B.wall?bt.B.wall.W:n.wall);
        this.note(`${this.sideName(e.att)}攻占 ${n.name}${n.depot&&raid?"，余粮尽焚":""}`,"big"); this.events.push({day:this.day,ph:this.ph,type:"capture",node:n.id,side:e.att}); if(n.depot&&raid){ const b=n.depot.food; n.depot.food=0; this.depotLoss(n,b); } } }
    if(n.wall!=null&&bt.B.wall&&n.owner===e.def) n.wall=bt.B.wall.W;
    // 攻方在敌前驻扎：加筑营垒
    for(const id of e.armies[e.att]){ const a=this.army(id); if(a.at===e.node&&!a.path.length&&a.mission.type==="attack"){ a.siegeDays=(a.siegeDays||0)+1; a.fort=Math.min(CP.CAMP_MAX,(a.fort||0)+CP.CAMP_BUILD); } }
    e.done=true; e.result=desc;
  }
  /* 烧粮仓：屯粮被焚，全军闻之震恐。严重度取决于这一把火烧掉了全军存粮的多大一块；就食于此仓的军团受创最深 */
  depotLoss(n,loss){ const side=n.owner; if(!side) return; const before=n.depot.food+loss; this.events.push({day:this.day,ph:this.ph,type:"depot",node:n.id,side,amount:loss,before});
    const tot=Object.values(this.nodes).filter(x=>x.depot&&x.owner===side).reduce((s,x)=>s+x.depot.food,0)+this.armies.filter(a=>a.side===side&&!a.gone).reduce((s,a)=>s+(a.food||0)+(a.cargo||0),0)+loss;
    const frac=loss/Math.max(1,before), share=loss/Math.max(1,tot);
    this.alert("depot",side,`${n.name}粮仓被焚 ${Math.round(loss)}`);
    if(frac<CP.BURN_TRIGGER&&share<CP.BURN_TRIGGER) return;
    const sev=Math.min(1,CP.BURN_SEV_BASE+share*CP.BURN_SEV_SHARE); let hit=0, k=0;
    for(const a of this.armies){ if(a.side!==side||a.gone) continue; const r=a.at===n.id?{days:0}:this.route(a.at,n.id,side); const near=!!r&&r.days<=CP.SUPPLY_RANGE; const f=sev*(near?1:CP.BURN_FAR);
      for(const u of a.units){ if(u.gone) continue; const t=UT[u.n]; const d=t.org*CP.BURN_ORG*f; u.org=Math.max(0,u.org-d); if(t.supply!==true&&!t.engine){ u.men*=1-CP.BURN_DESERT*f; hit+=d/t.org; k++; } }
      a.shaken=Math.max(a.shaken||0,CP.SHAKEN_DAYS); }
    const pct=Math.round(hit/Math.max(1,k)*100); this.events.push({day:this.day,ph:this.ph,type:"shock",node:n.id,side,sev,org:pct}); this.alert("shaken",side,`${this.sideName(side)}军心大震`);
    this.note(`${n.name}屯粮被焚（${Math.round(frac*100)}%，占全军存粮 ${Math.round(share*100)}%）——${this.sideName(side)}军心大震，组织平均 −${pct}%，${CP.SHAKEN_DAYS} 日内组织难复（上限 ${Math.round(CP.SHAKEN_CAP*100)}%）`,"bad"); }
  /* 截粮：截击运粮队。只断其后继，不直接动摇全军——除非一次截下半数以上 */
  convoyLoss(a,loss,before){ this.events.push({day:this.day,ph:this.ph,type:"convoy",army:a.id,side:a.side,amount:loss,before}); this.alert("depot",a.side,`${a.name} 运粮被截 ${Math.round(loss)}`);
    if(loss>=0.5*before){ for(const x of this.armies) if(x.side===a.side&&!x.gone) for(const u of x.units) if(!u.gone) u.org=Math.max(0,u.org-UT[u.n].org*CP.CUT_ORG);
      this.note(`${a.name} 被截，失粮 ${Math.round(loss)}——${this.sideName(a.side)}粮道受阻，军中小挫`,"bad"); } }
  retreatNode(a,from){ // 退往己方方向：取一个无敌军的相邻节点，使其离己方城池/粮仓最近
    const bases=Object.values(this.nodes).filter(n=>n.owner===a.side&&n.id!==from&&(n.depot||n.wall!=null||n.fort>0)&&!this.enemyAt(n.id,a.side));
    const dist=x=>{ if(this.nodes[x].owner===a.side&&x!==from) return -1; let b=Infinity; for(const n of bases){ const r=n.id===x?{days:0}:this.route(x,n.id,a.side,true); if(r&&r.days<b) b=r.days; } return b; };
    const enemyOwned=x=>{ const o=this.nodes[x].owner; return o&&o!==a.side&&(this.nodes[x].wall!=null||this.nodes[x].fort>0||this.nodes[x].depot); };
    let nb=this.nbrs(from).map(x=>x.n).filter(x=>!this.enemyAt(x,a.side)&&!this.armies.some(y=>y.side!==a.side&&y.at===x&&this.alive(y)));
    if(nb.some(x=>!enemyOwned(x))) nb=nb.filter(x=>!enemyOwned(x));
    if(!nb.length) return from; nb.sort((x,y)=>dist(x)-dist(y)); return nb[0]; }
  standoffDay(e){ const n=this.nodes[e.node]; this.events.push({day:this.day,ph:this.ph,type:"standoff",node:e.node,side:e.att}); for(const s of ["A","B"]) for(const id of e.armies[s]){ const a=this.army(id); for(const u of this.combatUnits(a)) u.men*=1-CP.STANDOFF_LOSS*(s===e.def?0.6:1); }
    for(const id of e.armies[e.att]){ const a=this.army(id); a.fort=Math.min(CP.CAMP_MAX,(a.fort||0)+CP.CAMP_BUILD); }
    this.note(`${n.name}：两军对垒，${this.sideName(e.att)}未攻，零星对射`,""); e.done=true; e.result="对垒未战"; }
  resolveAuto(e){ if(e.standoff){ this.standoffDay(e); return null; } const spec=this.battleSpec(e); const bt=new Battle(spec,spec.seed); const ais={}; for(const k of ["A","B"]) ais[k]=new TacticalAI(k,{persona:spec[k].ai.persona}); attachRoundAI(bt,ais); bt.run(); this.applyBattle(e,bt); return bt; }
  /* ───── 日终（第六时段终了）：任务进度、补给、夜间恢复、气候、胜负 ───── */
  dayEnd(){
    for(const a of this.armies){ if(a.gone) continue; const m=a.mission, here=!a.path.length;
      if(!here) continue;
      if(m.type==="delay"&&a.at===m.target){ a.held++; if(a.held>=m.holdDays){ this.note(`${a.name} 坚守 ${a.held} 日期满，撤回`,"good"); this.setOrder(a,"retreat",m.returnTo||a.home); } continue; }
      if(m.type==="escort"&&a.at===m.target&&a.cargo>0){ const n=this.nodes[a.at]; if(n.depot&&n.owner===a.side){ n.depot.food+=a.cargo; this.note(`${a.name} 运粮 ${Math.round(a.cargo)} 入 ${n.name}`,"good"); }
        else { const host=this.armies.find(x=>x!==a&&x.side===a.side&&x.at===a.at&&this.alive(x)); if(host){ host.food+=a.cargo; this.note(`${a.name} 运粮 ${Math.round(a.cargo)} 交付 ${host.name}`,"good"); } }
        for(const u of a.units) if(u.n==="辎重") u.cargo=0; a.cargo=0; this.setOrder(a,"retreat",a.home); continue; }
      if(m.type==="raid"&&a.at===m.target){ const n=this.nodes[a.at]; const enemy=this.armies.some(x=>x.side!==a.side&&x.at===a.at&&this.alive(x)&&!x.path.length);
        if(!enemy&&(!n.depot||n.depot.food<=1||n.owner===a.side)){ this.note(`${a.name} 目标已毁，撤回`,"good"); this.setOrder(a,"retreat",m.returnTo||a.home); } continue; }
      if(m.type==="retreat"&&m.then&&a.at===m.target&&a.at!==m.then){ const t=m.then; this.setOrder(a,"retreat",t); a.mission.then=null; continue; }   // 败退至中途，续退原定目的地
      if((m.type==="retreat"&&a.at===(m.target||m.returnTo||a.home))||(m.type==="reinforce"&&a.at===m.target)) a.mission={...m,type:"hold",target:null,then:null};
    }
    // 补给
    for(const a of this.armies){ if(!this.alive(a)) continue; const need=this.eat(a), cap=need*CP.FOOD_CAP_DAYS; a.food=(a.food??cap)-need;
      const dep=this.supplyDepot(a); if(dep&&a.food<cap){ const take=Math.min(cap-a.food,dep.depot.food); dep.depot.food-=take; a.food+=take; a.supplyFrom=dep.id; } else if(!dep) a.supplyFrom=null;
      if(a.food<0){ a.food=0; a.starving=(a.starving||0)+1; this.events.push({day:this.day,ph:this.ph,type:"starve",army:a.id,side:a.side}); for(const u of a.units){ u.org=Math.max(0,u.org-UT[u.n].org*CP.STARVE_ORG); u.men*=1-CP.STARVE_MEN*a.starving; } this.note(`${a.name} 断粮第 ${a.starving} 日`,"bad");
        if(a.starving>=CP.STARVE_COLLAPSE){ for(const u of a.units) u.gone=true; a.gone=true; this.note(`${a.name} 断粮 ${a.starving} 日，军中大饥，众溃而散`,"bad"); this.events.push({day:this.day,ph:this.ph,type:"collapse",army:a.id,side:a.side}); } } else a.starving=0; }
    // 夜间恢复与收拢
    for(const a of this.armies) for(const u of a.units){ if(u.gone) continue; const t=UT[u.n];
      if(u.routed){ if(this.rand()<CP.RALLY){ u.routed=false; u.org=t.org*0.35; u.men*=1-CP.RALLY_LOSS; } else { u.men*=0.6; if(u.men<100) u.gone=true; } continue; }
      if(!a.starving) u.org=Math.min(t.org*(a.shaken>0?CP.SHAKEN_CAP:1),u.org+t.org*CP.NIGHT_ORG*(a.shaken>0?1-CP.SHAKEN_REC:1)); u.stam=Math.min(100,(u.stam??100)+CP.NIGHT_STAM);
      const h=Math.min((u.wounded||0)*CP.HEAL,u.maxMen-u.men); u.men+=h; u.wounded=Math.max(0,(u.wounded||0)-h); if(u.men<60&&t.supply!==true) u.gone=true; }
    for(const a of this.armies) if(a.shaken>0) a.shaken--;
    // 军团覆没
    for(const a of this.armies) if(!a.gone&&!this.alive(a)&&!a.units.some(u=>u.n==="辎重"&&!u.gone&&u.cargo>0)){ a.gone=true; this.note(`${a.name} 全军覆没/溃散`,"bad"); }
    this.armies=this.armies.filter(a=>!a.gone||true);
    this.checkVictory(); this.snapshot(); this.ph=0; this.day++; this.rollWeather(); this.pending=[]; if(!this.over) this.snapshot();
    if(!this.over) this.note(`第 ${this.day} 日 · 天气 ${this.weather}`,"day");
    for(const k in this.fought) if(this.fought[k]<this.day-1) delete this.fought[k];
  }
  supplyDepot(a){ let best=null;
    for(const n of Object.values(this.nodes)){ if(!n.depot||n.owner!==a.side||n.depot.food<=0) continue; const r=n.id===a.at?{days:0}:this.route(a.at,n.id,a.side,true); if(!r||r.days>CP.SUPPLY_RANGE) continue; if(!best||r.days<best.d) best={n,d:r.days}; }
    return best?best.n:null; }
  fidelity(){ const res=this.hist.outcomes.map(o=>{ const k=o.check; let ok=false;
      if(k.type==="depotBelow") ok=this.stats.some(d=>(d.depots[k.node]??Infinity)<=this.nodes[k.node].depot.food0*k.frac)||this.nodes[k.node].depot.food<=this.nodes[k.node].depot.food0*k.frac;
      else if(k.type==="fired") ok=this.events.some(e=>e.type==="fire"&&e.node===k.node&&e.f>0&&(!k.by||e.by===k.by));
      else if(k.type==="defected") ok=this.defected.includes(k.army); else if(k.type==="nodeOwner") ok=this.nodes[k.node].owner===k.owner; else if(k.type==="winner") ok=!!(this.over&&this.over.side===k.side);
      return {text:o.text,ok}; }); return {list:res,score:res.length?res.filter(x=>x.ok).length/res.length:0}; }
  /* 日期：剧本起始日 + (日−1)×每回合天数 → 年月日 */
  dateOf(day){ const sd=this.hist.startDate; if(!sd) return `第 ${day} 日`; const t=(sd.day-1)+(day-1)*(this.hist.dayScale||1); const m=sd.month+Math.floor(t/30), d=t%30+1;
    const MN=["","正","二","三","四","五","六","七","八","九","十","十一","十二"], season=m>=10?"冬":m>=7?"秋":m>=4?"夏":"春";
    const DN=d<=10?(d===10?"初十":"初"+"一二三四五六七八九"[d-1]):d<20?"十"+"一二三四五六七八九"[d-11]:d===20?"二十":d<30?"廿"+"一二三四五六七八九"[d-21]:"三十";
    return {y:sd.year,m:Math.min(12,m),mn:MN[Math.min(12,m)],season,d:DN}; }
  checkVictory(){ if(this.sc.maxDays&&this.day>=this.sc.maxDays){ this.over={side:null,text:`两军相持 ${this.day} 日，各自罢兵`}; this.note(`战役结束：${this.over.text}`,"big"); return; }
    for(const v of this.sc.victory){ let ok=false; const ar=v.army&&this.army(v.army);
      if(v.type==="armyGone") ok=!ar||ar.gone; else if(v.type==="armyAt") ok=ar&&!ar.gone&&ar.at===v.node&&!ar.path.length; else if(v.type==="nodeOwner") ok=this.nodes[v.node].owner===v.owner;
      if(ok){ this.over={side:v.side,text:v.text}; this.note(`战役结束：${this.sideName(v.side)}胜——${v.text}`,"big"); return; } } }
  /* ───── 战略 AI：见 StrategicAI ───── */
  aiOrders(side){ this.strat[side].decide(); }
  save(){ return JSON.stringify({sc:this.sc,day:this.day,log:this.log,nodes:this.nodes,edges:this.edges,armies:this.armies,weather:this.weather,over:this.over,control:this.control,season:this.season,battles:this.battles,decisions:this.decisions,stats:this.stats,events:this.events,initMen:this.initMen,seed:this.seed,rs:this.rs,hist:this.hist,histFired:this.histFired,histDone:this.histDone,histPosture:this.histPosture,intelAll:this.intelAll,defected:this.defected,raidBonus:this.raidBonus,ph:this.ph,frames:this.frames,pending:this.pending.filter(e=>!e.done),fought:this.fought,near:this.near,alertAI:this.alertAI,reDecided:this.reDecided}); }
  static load(str){ const o=JSON.parse(str); const c=Object.create(Campaign.prototype); Object.assign(c,o); c.name=o.sc.name; c.sideInfo=o.sc.sides; c.pending=o.pending||[];   // 未处理的交战随存档保存，重开页面后接着处理
    for(const k of ["battles","decisions","stats","events","histFired","defected"]) c[k]=c[k]||[]; c.hist=c.hist||{on:false,tend:0,anchors:[],outcomes:[]}; c.histDone=c.histDone||{}; c.intelAll=c.intelAll||{A:false,B:false}; if(c.rs==null){ c.seed=Math.floor(Math.random()*1e9); c.rs=c.seed; } c.initMen=c.initMen||{A:c.sideMen("A"),B:c.sideMen("B")};
    c.ph=c.ph||0; c.frames=c.frames||[]; c.fought=c.fought||{}; c.near=c.near||{A:[],B:[]}; c.alertAI=c.alertAI||{A:false,B:false}; c.reDecided=c.reDecided||{A:false,B:false}; c.alerts=[];
    c.strat={A:new StrategicAI(c,"A"),B:new StrategicAI(c,"B")}; return c; }
}
