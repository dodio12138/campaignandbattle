/* 引擎→界面适配：战况视图、阵型/主将位置选择
   脚本以全局作用域加载（浏览器 <script> 或 tools/load.js 的 vm 上下文），加载顺序见 tools/load.js。 */
/* 回合引擎 → 战术 AI 的视图与挂钩 */
function rvSummary(x){
  const all=x.units, alive=all.filter(u=>!u.routed), front=x.aliveFront();
  const maxOrg=all.reduce((a,u)=>a+u.maxOrg,0)||1;
  return { men:x.men(), units:all.length, routedShare:(all.length-alive.length)/Math.max(1,all.length),
    orgAvg:alive.reduce((a,u)=>a+Math.max(0,u.org),0)/maxOrg,
    frontWidth:x.frontWidth(), wavering:front.length?front.filter(u=>u.orgp<0.5).length/front.length:(x.aliveColumn().length?0:1),
    reserves:x.rear.filter(u=>!u.routed&&u.t.inf&&!u.pinned).length, genPos:x.genPos, enemyCavWings:0,
    cav:alive.filter(u=>u.t.cav).length, supply:alive.filter(u=>u.isSupply&&u.men>1).length, rangedUnits:alive.filter(u=>u.rangedUnit&&!u.isEngine).length, formation:x.formation, cavFresh:alive.filter(u=>u.t.cav&&u.orgp>=0.5&&u.pos!=="column").length, lightCav:alive.filter(u=>u.t.skirmish).length,
    cavPow:alive.filter(u=>u.t.cav).reduce((a,u)=>a+(u.t.charge+u.t.soft)*u.strength,0),
    ranged:alive.reduce((a,u)=>a+u.t.ranged*u.strength,0), cmd:x.cmd, int:x.int, rash:x.rash, resolve:x.resolve, looting:x.looting||0, generalAlive:x.generalAlive, flankGuard:x.flankGuard() };
}
function roundView(b,s,mem){
  const en=b.other(s);
  if(!mem.init){ mem.init=true; mem.hist=[]; mem.contactR=0;
    const sd=0.15*(1-(s.int??60)/100); mem.noise=Math.max(0.6,1+(b.normal?b.normal(0,sd):0)); }
  const me=rvSummary(s), e=rvSummary(en);
  if(mem.meRes0==null){ mem.meRes0=me.reserves; mem.enRes0=e.reserves; }
  const vis=x=>0.95-0.6*x.wavering-0.6*x.routedShare;
  mem.hist.push({me:me.orgAvg,en:vis(e)}); if(mem.hist.length>6) mem.hist.shift();
  const h0=mem.hist[Math.max(0,mem.hist.length-4)], h1=mem.hist[mem.hist.length-1], n=Math.max(1,mem.hist.length-1-Math.max(0,mem.hist.length-4));
  me.orgTrend=(h1.me-h0.me)/n; e.orgTrend=(h1.en-h0.en)/n;
  me.reservesInit=mem.meRes0; e.reservesInit=mem.enRes0;
  e.menEst=e.men*mem.noise;
  e.pursuing=en.disorder>0;
  e.retreating=!!(en.orders&&(en.orders.stance==="feign"||en.orders.retreat));
  const contact=b.phase===2; if(contact){ mem.contactR++; mem.idle=0; } else { mem.contactR=0; mem.idle=(mem.idle||0)+1; }
  me.woundedShare=s.wounded()/Math.max(1,s.units.reduce((a,u)=>a+u.maxMen,0));
  const works={ myFort:s.fort||0, enFort:en.fort||0, myFortMax:s.fortMax||0, enFortMax:en.fortMax||0, myFortI:s.fortMax?s.fort/s.fortMax:1, enFortI:en.fortMax?en.fort/en.fortMax:1, myEngineHP:s.engineHP||0, myWall:s.wall?s.wall.W:0, myFoothold:s.wall?s.wall.F:0, enFoothold:en.wall?en.wall.F:0, enWall:en.wall?en.wall.W:0, myCity:!!s.wall, enIsCity:!!en.wall,
    myEngines:s.engines||0, enLured:en.lured||0, baitSeen:!!s.baitSeen, enFoodKnown:en.food, myLured:s.lured||0, lureBlown:!!s.lureBlown, lureSeen:s.lureSeen||0, enEngines:en.engines||0, myFood:s.food, enFood:en.wall?null:en.food, failDays:s.failDays||0, starving:s.starving||0 };
  const lastRep=b.daily&&b.daily.length?b.daily[b.daily.length-1][s.name]:null;
  const seeR=(s.int??60)>=85?1:(s.int??60)>=50?2:(s.int??60)>=30?3:4; const enTactic=en.tactic&&(contact||b.rnd-(mem.enSeen||0)>=seeR)?en.tactic.id:null;     // 接敌后，或对方战术持续若干回合（智略越高越快）方可看破
  return { mission:s.mission?s.mission.type:"rout", burnt:en.supplyBurnt?en.supplyBurnt():0, weather:b.weather, night:!!b.night0, t:b.rnd, day:b.day, works, enTactic, dayStats:lastRep, me, en:e, contact, contactRounds:mem.contactR, idleRounds:mem.idle||0, isDefender:!b.bothAtk&&s===b.B,
    terrain:{width:b.terr.width,wing:b.terr.wing,defBonus:b.terr.def_mult-1}, dayLeft:(P.DAY_ROUNDS-b.dayRound)/P.DAY_ROUNDS, mode:b.mode };
}
function attachRoundAI(b, ais){
  const mem={A:{},B:{}};
  b.tacticAIs=ais; for(const s of [b.A,b.B]){ const ai=ais[s.name]; s.rash=ai?((T_PERSONA[ai.persona]||{}).risk||0):0; }
  const genPick=(bb,s,ai,v)=>{ if(s.genPosCfg!=="auto") return; const r=ai?ai.chooseGenPos(v):{pos:"front",why:"无战术AI，循例居前"}; if(r.pos!==s.genPos||!mem[s.name].genSet){ s.setGenPos(r.pos); mem[s.name].genSet=true; if(ai) ai.note(bb.rnd,`主将${r.pos==="rear"?"移驻后阵坐镇":"亲临前阵督战"}：${r.why}`,"gen"); } };
  const formPick=(bb,s,night)=>{ if(s.formCfg!=="auto") return; const ai=ais[s.name]; const v=roundView(bb,s,mem[s.name]);
    const r=ai?ai.chooseFormation(v,bb.other(s).formation):{id:"FANG",why:"无战术AI，循例结方阵"};
    if(r.id!==s.formation||!mem[s.name].formSet){ mem[s.name].formSet=true; s.setFormation(r.id,null); if(!night&&!s.column.length){ s.applyFormationShape(); bb.applyWallWidth(); }
      if(ai) ai.note(bb.rnd,`${night?"夜议改":"列"}${FORM[r.id].name}阵：${r.why}`,"form"); } };
  b.formHook=(bb,s)=>formPick(bb,s,true);
  for(const s of [b.A,b.B]) formPick(b,s,false);
  b.dayHook=(bb)=>{ for(const s of [bb.A,bb.B]){ const ai=ais[s.name]; if(!ai) continue; const v=roundView(bb,s,mem[s.name]); const r=ai.dayPlan(v); s.plan=r.plan; s.planReason=r.reason; s.aiPlanned=true; mem[s.name].nightView=v; } };
  b.tacticHook=(bb)=>{ for(const s of [bb.A,bb.B]) if(s.genPosCfg==="auto"&&(bb.dayRound===1||!mem[s.name].genSet)) genPick(bb,s,ais[s.name],roundView(bb,s,mem[s.name])); for(const s of [bb.A,bb.B]){ const ai=ais[s.name]; if(!ai){ s.orders=null; continue; } s.orders=ai.update(roundView(bb,s,mem[s.name])); }
    for(const s of [bb.A,bb.B]){ const ai=ais[s.name]; const nt=ai&&ai.cur?ai.cur:null; if((nt&&nt.id)!==(s.tactic&&s.tactic.id)) mem[bb.other(s).name].enSeen=bb.rnd; s.tactic=nt; } };
  return b;
}
