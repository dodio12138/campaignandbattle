/* 回合制战斗引擎：兵种、状态、阵型、地形、任务、城防与器械、天气
   脚本以全局作用域加载（浏览器 <script> 或 tools/load.js 的 vm 上下文），加载顺序见 tools/load.js。 */

/* ================= 战斗引擎 v4（v3 定稿数值 + 多日会战 + 遭遇战） ================= */
const UNIT_ORDER = ["刀盾兵","长枪兵","弓兵","强弩兵","轻骑","重骑","器械","辎重"];
const GLYPH = {"刀盾兵":"盾","长枪兵":"枪","弓兵":"弓","强弩兵":"弩","轻骑":"骑","重骑":"铁","器械":"械","辎重":"粮"};
const DEFAULT_UNITS = {
  "刀盾兵":{ranged:0, soft:8,hard:4,defense:14,bt:8, hardness:0.4,armor:3,pierce:2,charge:0, width:1,org:60,reload:1,far:1,  speed:2,  anti_cav:false,cav:false,inf:true, skirmish:false},
  "长枪兵":{ranged:0, soft:6,hard:4,defense:16,bt:6, hardness:0.3,armor:2,pierce:3,charge:0, width:1,org:60,reload:1,far:1,  speed:2,  anti_cav:true, cav:false,inf:true, skirmish:false},
  "弓兵":  {ranged:10,soft:3,hard:1,defense:4, bt:3, hardness:0.1,armor:1,pierce:3,charge:0, width:1,org:40,reload:1,far:1,  speed:2,  anti_cav:false,cav:false,inf:false,skirmish:false},
  "强弩兵":{ranged:11,soft:2,hard:1,defense:5, bt:3, hardness:0.2,armor:2,pierce:5,charge:0, width:1,org:45,reload:2,far:1.5,speed:1.5,anti_cav:false,cav:false,inf:false,skirmish:false},
  "轻骑":  {ranged:3, soft:7,hard:2,defense:5, bt:12,hardness:0.2,armor:1,pierce:2,charge:6, width:2,org:50,reload:1,far:1,  speed:5,  anti_cav:false,cav:true, inf:false,skirmish:true},
  "重骑":  {ranged:0, soft:8,hard:6,defense:8, bt:14,hardness:0.7,armor:4,pierce:4,charge:14,width:2,org:60,reload:1,far:1,  speed:3,  anti_cav:false,cav:true, inf:false,skirmish:false},
  // 攻城器械（霹雳车、冲车、井阑与随营工匠）：只居后阵，轰城毁垒，亦可抛石击阵；有持久，会损耗、会被毁
  "器械":  {ranged:7, soft:1,hard:1,defense:2, bt:1, hardness:0,  armor:0,pierce:6,charge:0, width:1,org:30,reload:3,far:2,  speed:0.5,anti_cav:false,cav:false,inf:false,skirmish:false,engine:true},
  // 辎重（粮车、粮垛、民夫）：不参战，只居后阵；被焚则所载粮草按损毁比例散失
  "辎重":  {ranged:0, soft:0,hard:0,defense:3, bt:1, hardness:0,  armor:0,pierce:0,charge:0, width:1,org:20,reload:1,far:1,  speed:1,  anti_cav:false,cav:false,inf:false,skirmish:false,supply:true},
};
const DEFAULT_TERRAIN = {
  "平原":{width:12,wing:4,def_mult:1.0,atk_mult:1.0},
  "丘陵":{width:8, wing:2,def_mult:1.2,atk_mult:0.9},
  "隘口":{width:3, wing:0,def_mult:2.0,atk_mult:0.7},
};
const DEFAULT_P = {
  HIT_ABSORBED:0.10, HIT_EXCESS:0.40, ORG_MIN:1, ORG_MAX:3, ORG_SCALE:1.2, MEN_MIN:1, MEN_MAX:2, MEN_SCALE:3,
  ARMOR_MEN_MULT:0.5, ARMOR_ORG_MULT:0.8, LOW_PIERCE_ATK:0.6, FLANK_ATK:1.5, FLANK_ORG:1.5,
  SHAKEN:0.5, SHAKEN_ATK:0.75, BREAK:0.25, CONTAGION:0.10, GENERAL_LOST:0.25,
  RF_FAR:0.6, RF_NEAR:1.0, RF_MELEE:0.3, RR_FAR:0.6, RR_NEAR:1.0, RR_MELEE:0.6,
  ANTI_CAV_MELEE:1.5, ANTI_CAV_PIERCE:2, LIGHT_CAV_EVADE:0.6, NO_RANGED_MELEE:1.1, NO_RANGED_FIRE:1.3,
  ANTI_CAV_MULT:0.3, ANTI_CAV_FLANK_MULT:0.7, ATK_ABSORB_MIX:0.65, STAM_MELEE:5, STAM_WING:5,
  VOLLEY_MULT:1.4, ROTATE_FIRE_CMD:80, ROTATE_FIRE_MULT:0.75,
  FLANK_GUARD_CMD:0.6, FLANK_GUARD_RESERVE:0.2, FLANK_GUARD_MAX:0.8, WING_COUNTER:0.5,
  PURSUIT_BASE:0.12, PURSUIT_MAX_EXTRA:0.25, PURSUIT_K:0.004, FLED_SHARE:0.5,
  CMD_ORG:0.20, CMD_HOLD:0.60, CMD_CONTAGION:0.50, CMD_REAR:0.04,
  CMD_CAP_DIV:3.5, OVERLOAD_ORG:0.8, FOCUS_CMD:60, FOCUS_MAX:0.4, MOMENTUM:0.015,
  STRETCH_CMD:0.6, STRETCH_ABSORB_EXP:0.3, CENTER_STRIKE:0.6, GENERAL_GUARD:0.3,
  FEW_CMD:70, FEW_ORG:0.35, FEW_ATK:0.20, BATTLE_LUCK_SD:0.12,
  SKIRMISH_EVADE:0.35, SKIRMISH_EVADE_CAV:0.6, SKIRMISH_MELEE:0.6, SKIRMISH_RECHARGE:2, SKIRMISH_WITHDRAW:0.4,
  SKIRMISH_PURSUIT_TAKEN:0.3, SKIRMISH_PURSUIT_POWER:1.5,
  // —— 多日会战 ——
  DAY_ROUNDS:15,            // 一日的回合数，日暮收兵
  NIGHT_ORG:0.35,           // 夜间组织度回复（上限的比例，×(0.6+0.4×统帅/100)）
  NIGHT_STAM:70,            // 夜间体力回复
  NIGHT_RALLY:0.5,          // 溃部夜间收拢概率（×统帅/100）
  NIGHT_RALLY_ORG:0.3,      // 收拢回来的部组织度
  NIGHT_RALLY_LOSS:0.2,     // 收拢时散失的兵员比例
  NIGHT_RETREAT_RATIO:0.5,  // 战力（兵员×组织度）不足对方此比例 → 夜遁
  NIGHT_PURSUIT:0.4,        // 夜遁时追击损失 ×
  // —— 遭遇战 ——
  ENC_DEPLOY_BASE:8,        // 展开耗时基数：回合 ≈ 基数÷速度×统帅系数
  ENC_CMD_SPEED:0.5,        // 统帅100 展开时间 ×(1.25-0.5)
  ENC_RAID:0.7,             // 骑兵优先突袭未展开行军队列的概率
  ENC_ABSORB:0.25,           // 行军队列抵挡 ×
  ENC_ORG:3.5,
  // —— 战术命令适配（无命令时不生效）——
  FEIGN_ORG:0.04,           // 佯败后撤每回合组织度代价
  FEIGN_TAKEN:0.6,          // 后撤中所受攻击 ×
  DISORDER_ROUNDS:3,        // 追击者脱节（阵形散乱）持续回合
  DISORDER_ABSORB:0.7,      // 脱节时前阵抵挡 ×
  RETREAT_PURSUIT:0.45,     // 有后卫掩护的主动撤退，追击损失 ×
  // —— 阵地战：野战工事（营垒、壕沟、鹿角），等级 0~3，可连续 ——
  FORT_ABSORB:0.2,          // 每级：守方前阵抵挡 +20%
  FORT_ATK:0.08,            // 每级：攻方对其白刃攻击 -8%
  FORT_CHARGE:0.25,         // 每级：骑兵冲击 -25%（鹿角拒马）
  FORT_GUARD:0.12,          // 每级：护翼 +12%
  FORT_BUILD_ROUND:0.06,    // 白天未接战时，筑垒方每回合进度
  FORT_BUILD_NIGHT:0.6,     // "筑垒"方略：一夜进度
  FORT_MAX:3,
  FORT_CLOSED:2,            // 营垒达此等级即四面合围，翼骑不能迂回侧击（只能正面攻营）
  // —— 围城战：城墙完整度 W（0~1）、攻城器械、城中存粮 ——
  WALL_ABSORB:2.0,          // 守城：前阵抵挡 ×(1+2.0×W)
  WALL_ATK:0.45,            // 攻方白刃 ×(0.45+0.55×(1-W))
  WALL_COVER:0.6,           // 城上守军受远射 ×(1-0.6×W)
  WALL_CLIMB:0.6,           // 蚁附登城：攻方前阵组织度伤害 ×(1+0.6×W)
  WALL_WIDTH_MIN:0.3,       // 城墙完好时，攻方可展开正面仅为 30%
  ENGINE_DMG:0.009,         // 每架器械每回合轰城（器械攻城姿态）
  ENGINE_ASSAULT_DMG:0.35,  // 蚁附强攻时器械仍按此比例损城
  ENGINE_BUILD_NIGHT:1, ENGINE_MAX:4,
  WALL_REPAIR:0.05,         // 守方每夜修城
  STARVE_ORG:0.12,          // 断粮：每日组织度上限式打击
  // —— 伤兵与休整 ——
  WOUNDED_SHARE:0.5,        // 阵亡数中可救治的伤兵比例（只记账，不改结算）
  HEAL_NIGHT:0.10, HEAL_REST:0.35, REST_ORG_MULT:2.0,
  FAIL_EXCHANGE:0.9,
  // —— 工事与器械的持久度、盾网、抢修、火箭 ——
  STRUCT_MELEE:0.012,       // 每部近战步兵每回合拆垒（营垒等级）
  FIRE_FORT:0.002,         // 火箭：每点远程每回合焚垒
  FIRE_MEN:0.7,             // 火箭对人员的杀伤 ×
  ENGINE_FORT:0.06,         // 每具器械每回合轰垒
  ENGINE_HP:100,            // 每具器械持久
  ENGINE_SHOT:0.18,         // 守方每点远程每回合损器械持久
  SORTIE_ENGINE:3,          // 出城突击每部每回合损器械持久
  ENGINE_REPAIR_NIGHT:40,   // 每夜修器械（每具）
  ENGINE_CREW:200,          // 每具器械随营工匠（造新器械时从步卒中抽调）
  ENGINE_WEAR:1.5,          // 器械每发射一回合自身损耗持久（消耗）
  ENGINE_RAID:0.3,          // 敌翼骑包抄时突入后阵袭击器械的概率
  ENGINE_RAID_DMG:30,       // 骑兵突袭器械：每次损持久 ×(冲击+杀伤)/20
  ENGINE_CREW_LOSS:0.3,     // 器械被毁时工匠阵亡比例
  // —— 主将位置：前阵督战 / 后阵坐镇 ——
  GEN_REAR_ORG:0.03,        // 后阵坐镇：前阵受组织伤 ×(1+x)（无主将督战）
  GEN_REAR_HOLD:0.15,       // 后阵坐镇：稳阵概率 ×(1-x)
  GEN_REAR_SWAP:1,          // 后阵坐镇：每回合调度 +x（纵览全局）
  GEN_REAR_RAID:0.15,
  // —— 智略与计谋（佯退诱敌、激怒骂阵、下书约战；诈败识破）——
  INT_SCALE:40,             // 智略差每 40 点，中计/识破概率 ×2（或 ×0）
  LURE_TAKE_RETREAT:0.10,   // 佯退：敌每回合中计出城概率（智略相当时）
  LURE_TAKE_TAUNT:0.07,     // 激怒：敌每回合按捺不住出城概率
  LURE_TAKE_CHALLENGE:0.06, // 约战：敌每回合应战概率（×敌我战力比）
  LURE_SEE_RETREAT:0.08,    // 佯退：敌每回合识破概率
  LURE_SEE_TAUNT:0.06,      // 激怒：敌每回合"不为所动"、看穿用意概率
  LURE_RASH:2.0,            // 敌将鲁莽（进取+0.25/谨慎-0.25）：中计 ×(1+x·鲁莽)
  LURE_REPEAT:0.6,          // 每被识破一次，同一敌将再中计 ×0.6、识破 ×1.5
  LURE_ROUNDS:6,            // 中计出城后在城外作战回合
  CHALLENGE_ROUNDS:10,      // 应战出城列阵回合
  LURE_DISORDER:3,          // 佯退：追出之敌阵形脱节回合
  LURE_AMBUSH:1.25,         // 伏兵：攻击与致组织伤 ×
  LURE_AMBUSH_ROUNDS:4,     // 伏兵加成持续回合（激怒减半，约战无）
  TAUNT_RAGE_ATK:1.15,      // 激怒出城：怒军攻击 ×
  TAUNT_RAGE_DEF:0.85,      // 激怒出城：怒军抵挡 ×
  TAUNT_ORG:0.004,          // 骂阵不出：守军前阵每回合受辱损组织度
  // —— 弃辎重诱敌（白马·延津）：佯败于道，弃辎重马匹，追兵争抢则大乱 ——
  BAIT_TAKE:0.30,           // 追兵每回合争抢辎重概率（智略相当时；×鲁莽）
  BAIT_SEE:0.10,            // 追兵主将每回合识破、严令勿取概率
  BAIT_ROUNDS:6,            // 争抢辎重、队伍散乱回合
  BAIT_ORG:0.30,            // 争抢时追兵（尤其骑兵）组织度骤降（×最大组织度）
  BAIT_DEF:0.6,             // 争抢中追兵抵挡 ×
  BAIT_ATK:0.6,             // 争抢中追兵攻击 ×
  // —— 劫粮（官渡·乌巢）：夜议方略"奇袭粮道" ——
  RAID_P:0.30,              // 智略相当时劫粮成功率
  RAID_FOOD_LEFT:0.10,      // 得手后敌存粮剩余比例
  RAID_SHOCK:0.20,          // 得手后敌全军组织度打击（×最大组织度）
  RAID_LOSS:0.35,           // 失手时劫粮骑兵兵员损失
  STANDOFF_FIRE:0.4,        // 相持对射：双方都据垒不出时远程 ×（器械轰击不受影响）
  // —— 辎重与目标 ——
  SUPPLY_BURN:8.0,          // 对辎重的打击 ×（火把焚烧）
  SUPPLY_RAID:0.35,         // 翼骑突入后阵袭击辎重的概率（×(1-护翼)）
  RAID_FOCUS:2.5,           // 以"焚粮"为目标时，上述概率 ×
  RAID_FRONT:0.35,          // 以"焚粮"为目标时，前阵各部越过敌阵空隙直扑辎重的概率
  MISSION_GOAL:0.6,         // "焚粮"目标：焚毁敌辎重达此比例即算完成
  RESOLVE_DEFAULT:50,       // 战役决心默认值（越高越不肯撤）
  FEIGN_SEE:0.6,            // 诈败：智略高于对方时识破概率 ×(智略差/40)       // 敌翼骑包抄时突入中军的概率（×(1-护翼)）
  REPAIR_FORT:0.02,         // 抢修：每部预备每回合修垒
  REPAIR_WALL:0.004,        // 抢修：每部预备每回合修城
  REPAIR_STAM:4,            // 抢修者每回合体力消耗
  NIGHT_FORT_REPAIR:0.25,   // 守方每夜修垒（休整×2）
  SHIELD_TAKEN:0.4,         // 盾网：所受远程 ×
  SHIELD_OWN:0.6,           // 盾网：本方远程 ×
  // —— 蚁附登城（城墙只受器械损伤；步卒只能登城）——
  CLIMB_SHOT:0.8,           // 守方远程（矢石、擂木）对登城者 ×(1+0.8×W)
  CLIMB_ABSORB:0.4,         // 登城者抵挡 ×(1-0.4×W)（悬于梯上，无从结阵）
  CLIMB_MEN:0.6,            // 登城者兵员伤亡 ×(1+0.6×W)（坠城）
  CLIMB_STAM:1.5,           // 登城者体力消耗 ×
  CLIMB_CAV:0.15,           // 骑兵不能登城：对城上白刃/冲击 ×
  CLIMB_RATE:0.10,          // 登城进度：每回合基础（×攻守前阵战力比）
  CLIMB_REPEL:0.06,         // 守方每回合击退登城者（×前阵组织度/80%）
  CLIMB_RESERVE:1.3,        // 守方有预备队时击退 ×
  CLIMB_BREACH:0.75,        // 先登：城墙加成 ×(1-0.75×进度)
  CLIMB_GAP_W:0.35,         // 城墙低于此值出现缺口，可从缺口白刃（缺口越大接战越多）
  CLIMB_STONE:1.0,          // 未登城前，守军前阵以擂石滚木、长杆推梯打击登城者（按白刃攻击 ×1.0，不算白刃）
        // 进攻日交换比低于此即记"久攻不下"一日              // 行军队列受组织度伤害 ×
};
/* ───── 阵型：效果（倍率/加值）、克制、自动布阵规则 ─────
   width 正面宽度× / wing 两翼容量± / atk 攻击× / def 抵挡× / orgTaken 受组织伤× / orgDealt 致组织伤× / stam 体力消耗× / charge 冲击×
   guard 护翼± / swaps 每回合调度± / ranged 远程× / counters {阵型: 克制值}（对方用该阵型时，本方攻击与致组织伤 ×(1+值)） */
const DEFAULT_FORM = {
  FANG:    {name:"方阵", key:"1", desc:"四面整齐，攻守均衡", width:1, wing:0, atk:1, def:1, orgTaken:1, orgDealt:1, stam:1, charge:1, guard:0, swaps:0, ranged:1, counters:{}},
  FENGSHI: {name:"锋矢", key:"2", desc:"精兵居前、正面收窄，利于中央突破；两翼单薄", width:1, wing:0, atk:1.04, def:0.92, orgTaken:1.08, orgDealt:1.05, stam:1.05, charge:1.10, guard:-0.15, swaps:0, ranged:1, counters:{YUAN:0.10, CHANGSHE:0.10}},
  HEYI:    {name:"鹤翼", key:"3", desc:"两翼张开、骑兵尽出，利于包抄；中军稍薄", width:1, wing:2, atk:1, def:0.95, orgTaken:1, orgDealt:1.05, stam:1, charge:1.05, guard:0.05, swaps:0, ranged:1, counters:{FENGSHI:0.12}},
  YUAN:    {name:"方圆", key:"4", desc:"结圆阵自守，骑兵收入阵中，四面皆坚；攻势乏力", width:1, wing:-99, atk:0.90, def:1.15, orgTaken:0.92, orgDealt:1, stam:0.95, charge:1, guard:0.25, swaps:0, ranged:1, counters:{HEYI:0.10}},
  YANXING: {name:"雁行", key:"5", desc:"弓弩斜列居前，远射为主；近战单薄", width:1, wing:0, atk:1, def:1.0, orgTaken:1.03, orgDealt:1, stam:1, charge:1, guard:-0.05, swaps:0, ranged:1.40, counters:{YUAN:0.10}},
  YANYUE:  {name:"偃月", key:"6", desc:"主将居中、重兵在前，两翼后弯；冲击猛烈", width:1, wing:0, atk:1.05, def:1, orgTaken:1.05, orgDealt:1.05, stam:1, charge:1.15, guard:0.05, swaps:0, ranged:1, counters:{YULIN:0.10, FENGSHI:0.05}},
  CHANGSHE:{name:"长蛇", key:"7", desc:"一字长列，首尾相应，正面最宽；阵线稀薄", width:1.1, wing:0, atk:1, def:1.0, orgTaken:1, orgDealt:1, stam:0.90, charge:1, guard:0.15, swaps:0, ranged:1, counters:{YANXING:0.10}},
  YULIN:   {name:"鱼鳞", key:"8", desc:"分队层叠，前队疲则后队替，利于持续冲击", width:1, wing:0, atk:1.02, def:0.95, orgTaken:1.05, orgDealt:1, stam:1.05, charge:1, guard:0, swaps:1, ranged:1, counters:{YUAN:0.12}},
};
let FORM = JSON.parse(JSON.stringify(DEFAULT_FORM));
/* ───── 状态效果：每种状态的激发条件（固定）与效果（可编辑） ─────
   self 作用于处于该状态的一方，enemy 作用于其对手。
   倍率：atk 攻击 def 抵挡 orgTaken 受组织伤 orgDealt 致组织伤 stam 体力消耗 charge 冲击 ranged 远程输出 rangedTaken 所受远程
         hold 稳阵（溃散检定时坚持住的概率）recover 后阵恢复 contagion 溃散传染；加值：guard 护翼 swaps 每回合调度 */
const ST_MUL=["atk","def","orgTaken","orgDealt","stam","charge","ranged","rangedTaken","hold","recover","contagion","burn","guile"], ST_ADD=["guard","swaps"];
const DEFAULT_STATUS = {
  GEN_FRONT:{name:"主将前阵督战", when:"主将居前阵、未退走", self:{orgTaken:0.96, hold:1.10}, enemy:{}},
  GEN_REAR: {name:"主将后阵坐镇", when:"主将居后阵（中军亲卫一部不参与轮换）", self:{swaps:1, hold:0.85, orgTaken:1.03}, enemy:{}},
  GEN_LOST: {name:"主将退走", when:"中军溃散、主将退走（当日；另有统帅效果减半）", self:{}, enemy:{}},
  AMBUSH:   {name:"伏兵四起", when:"佯退、激将或弃辎重得手后数回合", self:{atk:1.25, orgDealt:1.25}, enemy:{}},
  LURED:    {name:"中计出城", when:"追击佯退之敌或应战出城", self:{}, enemy:{}},
  TAUNTED:  {name:"激怒出城", when:"守将被骂阵激怒出城", self:{atk:1.15, def:0.85}, enemy:{}},
  LOOTING:  {name:"争抢辎重", when:"追兵见道旁辎重而争抢", self:{atk:0.6, def:0.6}, enemy:{}},
  DISORDER: {name:"阵形脱节", when:"追击诈败、追击佯退之敌", self:{}, enemy:{}},
  FEIGN:    {name:"佯败后撤", when:"本方执行诈败后撤", self:{}, enemy:{}},
  SHIELD:   {name:"张设盾网", when:"命令中勾选盾网", self:{rangedTaken:0.4, ranged:0.6}, enemy:{}},
  FIRE:     {name:"施放火箭", when:"命令中勾选火箭（焚营垒）", self:{ranged:0.7}, enemy:{}},
  REPAIR:   {name:"抢修工事", when:"命令中勾选抢修", self:{}, enemy:{}},
  CLIMB:    {name:"蚁附登城", when:"前阵正在攀城（另有按城高计算的登城惩罚）", self:{}, enemy:{}},
  WALL_HOLD:{name:"据城而守", when:"城墙尚在且固守城上", self:{}, enemy:{}},
  FORT_HOLD:{name:"据营而守", when:"营垒尚在且固守营中", self:{}, enemy:{}},
  STANDOFF: {name:"营对营相持", when:"阵地/围城中双方都据垒不出（未接战）", self:{ranged:0.4}, enemy:{}},
  STARVING: {name:"粮尽", when:"存粮或军粮耗尽", self:{atk:0.9, def:0.95}, enemy:{}},
  FEW:      {name:"以寡击众", when:"统帅高于门槛且兵少于敌（另有基础加成）", self:{}, enemy:{}},
  W_RAIN:   {name:"天气·雨", when:"当日下雨（双方皆受）", self:{ranged:0.7, burn:0.3, stam:1.1, charge:0.85}, enemy:{}},
  W_WIND:   {name:"天气·大风", when:"当日大风（双方皆受）", self:{burn:1.6, ranged:0.9}, enemy:{}},
  W_FOG:    {name:"天气·大雾", when:"当日大雾（双方皆受）", self:{ranged:0.6, guile:1.4}, enemy:{}},
  W_SNOW:   {name:"天气·雪", when:"当日下雪（双方皆受）", self:{stam:1.3, charge:0.8, atk:0.95}, enemy:{}},
  W_HEAT:   {name:"天气·酷暑", when:"当日酷热（双方皆受）", self:{stam:1.3}, enemy:{}},
  NIGHT:    {name:"夜战", when:"夜间交战（双方皆受）", self:{ranged:0.5, guile:1.5, hold:0.85, contagion:1.3}, enemy:{}},
  M_RAID:   {name:"目标·焚粮", when:"本军以焚毁敌辎重为目标（不恋战）", self:{stam:0.9}, enemy:{}},
  M_HOLD:   {name:"目标·坚守", when:"本军以坚守待时为目标", self:{def:1.05, hold:1.1}, enemy:{}},
  M_ESCORT: {name:"目标·护粮", when:"本军以护送辎重为目标", self:{guard:0.15}, enemy:{}},
};
let STATUS = JSON.parse(JSON.stringify(DEFAULT_STATUS));
const FORM_IDS = Object.keys(DEFAULT_FORM);
let UT = JSON.parse(JSON.stringify(DEFAULT_UNITS));
let TERRAIN = JSON.parse(JSON.stringify(DEFAULT_TERRAIN));
let P = {...DEFAULT_P};

function cmdEffects(cmd, alive, n){
  const c = alive ? cmd/100 : cmd/200;
  const cap = Math.max(1, (alive ? cmd : cmd/2) / P.CMD_CAP_DIV);
  const x = Math.max(0, n/cap - 1);
  const swaps0 = alive ? 1 + Math.floor(cmd/25) : 1;
  return {
    cap, overload:x,
    swaps: Math.max(1, swaps0 - Math.floor(x*3)),
    org_dmg_mult: (1 - P.CMD_ORG*c) * (1 + P.OVERLOAD_ORG*x),
    hold: P.CMD_HOLD*c*Math.max(0, 1-0.5*x),
    contagion_mult: (1 - P.CMD_CONTAGION*c) * (1 + x),
    rear_recover: P.CMD_REAR*(1+c),
    flank_guard: P.FLANK_GUARD_CMD*c*Math.max(0, 1-0.5*x),
    max_stretch: 1 + P.STRETCH_CMD*c,
    rotate_fire: alive && cmd >= P.ROTATE_FIRE_CMD,
    focus: alive ? P.FOCUS_MAX*Math.max(0,(cmd-P.FOCUS_CMD)/(100-P.FOCUS_CMD)) : 0,
  };
}

function makeRng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function melee_atk(u,tgt){ const th=tgt.t.hardness; const v=u.t.soft*(1-th)+u.t.hard*th; return v*((u.t.anti_cav&&tgt.t.cav)?P.ANTI_CAV_MELEE:1); }

class Unit{
  constructor(name, side, idx){
    this.name=name; this.t=UT[name]; this.side=side; this.id=side.name+idx;
    this.maxMen=1000; this.men=1000; this.maxOrg=this.t.org; this.org=this.t.org; this.stamina=100;
    this.routed=false; this.charged=false; this.isGeneral=false; this.dead=0; this.fled=0;
    this.pos="rear"; this.plan="rear"; this.deployAt=0; this.lastCharge=-99; this.lastOd=0; this.flank=false; this.raid=false;
    if(this.t.engine){ this.maxMen=this.men=P.ENGINE_CREW; this.hp=P.ENGINE_HP; this.destroyed=false; }
  }
  get orgp(){return this.org/this.maxOrg}
  get strength(){return this.men/this.maxMen}
  get stamF(){return this.stamina<25?0.6:(this.stamina<50?0.8:1)}
  get rangedUnit(){return this.t.ranged>0 && !this.t.cav && !this.t.inf}
  get isEngine(){return !!this.t.engine}
  get isSupply(){return !!this.t.supply}
  get nc(){return !!(this.t.engine||this.t.supply)}       // 非战斗单位：器械、辎重
  get cargoLost(){ return this.isSupply?1-this.men/this.maxMen:0; }
}

class Side{
  constructor(battle, name, cfg, attacker){
    this.battle=battle; this.name=name; this.cmd=cfg.cmd; this.int=cfg.int!=null?cfg.int:60; this.rash=0; this.lured=0; this.lureKind=null; this.ambush=0; this.lureSeen=0; this.lureBlown=false; this.looting=0; this.baitSeen=false; this.resolve=cfg.resolve!=null?cfg.resolve:P.RESOLVE_DEFAULT; this.raids=0; this.attacker=attacker; this.cavFront=!!cfg.cavFront;
    const terr=battle.terr; this.terrWidth=terr.width; this.terrWing=terr.wing; this.width=terr.width; this.wingCap=terr.wing;
    this.formCfg=cfg.formation||"FANG"; this.formation=FORM[this.formCfg]?this.formCfg:"FANG"; this.layout=cfg.layout||null;
    this.units=[]; let i=0;
    if(cfg.units&&cfg.units.length){ for(const d of cfg.units){ if(!UT[d.n]) continue; const u=new Unit(d.n,this,++i); u.cid=d.cid; if(d.maxMen) u.maxMen=d.maxMen; if(d.men!=null) u.men=d.men; if(d.org!=null) u.org=Math.min(u.maxOrg,d.org); if(d.stam!=null) u.stamina=d.stam; if(d.hp!=null) u.hp=d.hp; if(d.cargo!=null) u.cargo=d.cargo; if(d.wounded) u.wounded=d.wounded; u.army=d.army; this.units.push(u); } }   // 战役：带入各部现状
    else for(const n of UNIT_ORDER){ for(let k=0;k<(cfg.roster[n]||0);k++) this.units.push(new Unit(n,this,++i)); }
    this.mission=cfg.mission?{type:"rout",retreatAt:0,goal:P.MISSION_GOAL,holdRounds:0,...cfg.mission}:{type:"rout",retreatAt:0,goal:P.MISSION_GOAL,holdRounds:0};
    this.label=cfg.label||null; this.missionDone=false;
    for(let k=0;k<(cfg.engines||0);k++) this.units.push(new Unit("器械",this,++i));   // 旧配置：engines 数 → 器械兵种
    this.uid=i; this.genPosCfg=cfg.genPos||"front"; this.genPos=this.genPosCfg==="rear"?"rear":"front"; this.genUnit=null;
    this.generalAlive=true; this.front=[]; this.rear=[]; this.wings=[]; this.column=[]; this.stretch=1;
    this.orders=null; this.disorder=0; this.baseAttacker=attacker;
    this.fort=cfg.fort||0; this.wall=cfg.wall!=null?{W:cfg.wall,F:0}:null; this.food=cfg.food!=null?cfg.food:null; this.fortMax=this.fort;
    this.tm={atk:1,def:1,orgTaken:1,orgDealt:1,stam:1,charge:1}; this.tactic=null; this.countering=null;
    this.plan="FIGHT"; this.planReason=""; this.aiPlanned=false; this.failDays=0; this.dayStats=null; this.starving=0;
    this.applyFormationShape();
    this.composition(); this.refresh();
    this.deploy(this.units);
    this.power0=this.power(); this.supply0=this.units.filter(u=>u.isSupply).reduce((a,u)=>a+u.maxMen,0);
  }
  supplyBurnt(){ const t=this.units.filter(u=>u.isSupply); const m=t.reduce((a,u)=>a+u.maxMen,0); return m?t.reduce((a,u)=>a+(u.maxMen-u.men),0)/m:0; }
  get fm(){ return FORM[this.formation]||FORM.FANG; }
  applyFormationShape(){ const f=this.fm; this.baseWidth=Math.max(2,Math.round(this.terrWidth*f.width)); this.width=this.baseWidth;
    this.wingCap=this.terrWing>0?Math.max(0,this.terrWing+f.wing):0; }
  /* 换阵：开战前或夜间；layout 为 null 时按阵型自动布阵 */
  setFormation(id,layout){ if(!FORM[id]) return; this.formation=id; if(layout!==undefined) this.layout=layout; this.applyFormationShape(); this.refresh(); }
  /* 阵型自动布阵：返回 {front,wl,wr,rear}（单位 id） */
  autoLayout(list){
    const f=this.formation, byOrg=(a,b)=>b.orgp-a.orgp, str=u=>(u.t.defense+u.t.soft+u.t.charge)*u.strength*Math.max(0.2,u.orgp);
    const inf=list.filter(u=>u.t.inf).sort(byOrg), cav=list.filter(u=>u.t.cav).sort((a,b)=>str(b)-str(a)), rng=list.filter(u=>u.rangedUnit&&!u.isEngine), eng=list.filter(u=>u.nc);
    const L={front:[],wl:[],wr:[],rear:[]}; let fw=0, ww=[0,0]; const cap=this.width, wcap=this.wingCap;
    const toWing=u=>{ const k=ww[0]<=ww[1]?0:1; if(ww[0]+ww[1]+u.t.width>wcap) return false; ww[k]+=u.t.width; L[k?"wr":"wl"].push(u.id); return true; };
    const toFront=u=>{ if(fw+u.t.width>cap) return false; fw+=u.t.width; L.front.push(u.id); return true; };
    const rest=[];
    if(f==="FENGSHI"){ const heavy=cav.filter(u=>!u.t.skirmish), light=cav.filter(u=>u.t.skirmish);
      for(const u of light) if(!toWing(u)) rest.push(u);
      const core=heavy.concat(inf.slice().sort((a,b)=>str(b)-str(a))); for(const u of core) if(!toFront(u)) rest.push(u);
      { const arr=L.front.slice(), out=[]; arr.forEach((id,i)=>{ if(i%2) out.push(id); else out.unshift(id); }); L.front=out; }   // 锋矢：精兵居中
      for(const u of rng) rest.push(u); }
    else if(f==="YUAN"){ for(const u of inf) if(!toFront(u)) rest.push(u); for(const u of cav.concat(rng)) rest.push(u); }
    else if(f==="YANXING"){ const nR=Math.min(rng.length,Math.floor(cap/4)); for(const u of rng.slice(0,nR)) toFront(u);
      for(const u of cav) if(!toWing(u)) rest.push(u); for(const u of inf) if(!toFront(u)) rest.push(u); for(const u of rng.slice(nR)) rest.push(u); }
    else if(f==="YANYUE"){ for(const u of cav.filter(u=>u.t.skirmish)) if(!toWing(u)) rest.push(u);
      const core=inf.slice().sort((a,b)=>str(b)-str(a)); const heavy=cav.filter(u=>!u.t.skirmish);
      const mid=heavy.concat(core); const arr=[]; for(const u of mid){ if(fw+u.t.width>cap){ rest.push(u); continue; } fw+=u.t.width; arr.push(u); }
      const out=[]; arr.forEach((u,i)=>{ if(i%2) out.push(u.id); else out.unshift(u.id); }); L.front=out;   // 强者居中
      for(const u of rng) rest.push(u); }
    else { // 方阵 / 鹤翼 / 长蛇 / 鱼鳞：骑兵上两翼（若可），步兵居前
      if(!this.cavFront) for(const u of cav) if(!toWing(u)) rest.push(u);
      const order=this.cavFront?cav.concat(inf):inf.concat(rest.splice(0)); for(const u of order) if(!toFront(u)) rest.push(u);
      for(const u of rng) rest.push(u); }
    if(!L.front.length) for(const u of rest.slice()) if(!u.nc&&toFront(u)) rest.splice(rest.indexOf(u),1);
    L.rear=rest.map(u=>u.id).concat(eng.map(u=>u.id));
    return L; }
  deploy(list){
    this.front=[]; this.rear=[]; this.wings=[];
    for(const u of list){ u.pos="rear"; u.isGeneral=false; u.wingSide=null; }
    const byId=new Map(list.map(u=>[u.id,u]));
    const L=(this.layout&&this.layout.front)?this.layout:(this.formation!=="FANG"?this.autoLayout(list):null);
    if(L){ const used=new Set(); let fw=0, ww=0;
      for(const id of L.front||[]){ const u=byId.get(id); if(!u||u.nc||used.has(id)) continue; if(fw+u.t.width>this.width) continue; this.front.push(u); u.pos="front"; fw+=u.t.width; used.add(id); }
      for(const [k,side] of [["wl","L"],["wr","R"]]) for(const id of L[k]||[]){ const u=byId.get(id); if(!u||u.nc||used.has(id)) continue; if(ww+u.t.width>this.wingCap) continue; this.wings.push(u); u.pos="wing"; u.wingSide=side; ww+=u.t.width; used.add(id); }
      const left=list.filter(u=>!used.has(u.id));
      // 阵亡/溃散留下的空位：按"步兵、骑兵"顺序补入前阵
      if(fw<this.width) for(const u of left.filter(u=>!u.nc&&!u.rangedUnit).sort((a,b)=>(b.t.inf-a.t.inf)||(b.orgp-a.orgp))){ if(fw+u.t.width>this.width) continue; this.front.push(u); u.pos="front"; fw+=u.t.width; used.add(u.id); }
      const rearOrder=(L.rear||[]).map(id=>byId.get(id)).filter(u=>u&&!used.has(u.id));
      for(const u of rearOrder){ this.rear.push(u); used.add(u.id); }
      for(const u of list) if(!used.has(u.id)){ this.rear.push(u); used.add(u.id); }
      if(!this.front.length){ for(const u of [...this.rear]){ if(!u.nc&&this.frontWidth()+u.t.width<=this.width){this.rear.splice(this.rear.indexOf(u),1);this.front.push(u);u.pos="front";} } }
      this.placeGeneral(L.gen); return; }
    const byOrg=(a,b)=>b.orgp-a.orgp;
    const inf=list.filter(u=>u.t.inf).sort(byOrg), cav=list.filter(u=>u.t.cav).sort(byOrg), rng=list.filter(u=>u.rangedUnit);
    if(!this.cavFront){ for(const u of cav){ if(this.wingWidth()+u.t.width<=this.wingCap){this.wings.push(u);u.pos="wing";u.wingSide=this.wings.length%2?"L":"R";} } }
    const order = this.cavFront ? cav.concat(inf) : inf.concat(cav.filter(c=>c.pos!=="wing"));
    for(const u of order){
      if(u.pos==="wing") continue;
      if(this.frontWidth()+u.t.width<=this.width){this.front.push(u);u.pos="front";} else this.rear.push(u);
    }
    this.rear.push(...rng, ...list.filter(u=>u.isSupply));
    if(!this.front.length){ for(const u of [...this.rear]){ if(!u.nc&&this.frontWidth()+u.t.width<=this.width){this.rear.splice(this.rear.indexOf(u),1);this.front.push(u);u.pos="front";} } }
    this.placeGeneral();
  }
  /* 主将：前阵督战（居前阵中央一部）或后阵坐镇（以后阵一部为中军亲卫，不参与轮换） */
  placeGeneral(genId){
    for(const u of this.units){ u.isGeneral=false; u.pinned=false; } this.genUnit=null;
    if(genId){ const g=this.units.find(u=>u.id===genId&&!u.routed&&!u.nc); if(g){ g.isGeneral=true; this.genUnit=g; if(g.pos==="rear"){ g.pinned=true; this.genPos="rear"; } else this.genPos="front"; return; } }
    if(this.genPos==="rear"){
      const pick=this.rear.filter(u=>!u.routed&&u.rangedUnit&&!u.nc).sort((a,b)=>b.men-a.men)[0]||this.rear.filter(u=>!u.routed&&!u.nc&&u.t.inf).sort((a,b)=>b.orgp-a.orgp)[0]||this.rear.filter(u=>!u.routed&&!u.nc&&!u.t.cav)[0]||this.rear.filter(u=>!u.routed&&!u.nc)[0];
      if(pick){ pick.isGeneral=true; pick.pinned=true; this.genUnit=pick; return; }
    }
    const core=this.front.filter(u=>u.t.inf); const pool=core.length?core:(this.front.length?this.front:this.units.filter(u=>!u.routed&&!u.nc));
    if(pool.length){ const c=Math.floor(pool.length/2); const byC=pool.map((u,i)=>({u,d:Math.abs(i-c)})).sort((x,y)=>x.d-y.d);   // 主将居中军；中军残破则移驻最近的完整一部
      const g=(byC.find(x=>x.u.orgp>=0.6&&x.u.strength>=0.6)||byC[0]).u; g.isGeneral=true; this.genUnit=g; }   // 主将居中军；中军残破则移驻最完整的一部
  }
  setGenPos(p){ if(p===this.genPos) return; this.genPos=p; if(this.generalAlive&&this.column.length===0) this.placeGeneral(this.layout&&this.layout.gen); this.refresh(); }
  /* 遭遇战：全军转为行军纵队，按速度与统帅陆续展开 */
  toColumn(){
    const c=this.cmd/100, B=this.battle;
    for(const u of this.units){
      u.plan=u.pos; u.planWing=u.wingSide;
      const t=P.ENC_DEPLOY_BASE/Math.max(0.5,u.t.speed)*(1.25-P.ENC_CMD_SPEED*c)*(0.75+0.5*B.r());
      u.deployAt=Math.max(1,Math.ceil(t)); u.pos="column";
    }
    this.column=this.units.slice().sort((a,b)=>a.deployAt-b.deployAt);
    this.front=[]; this.rear=[]; this.wings=[];
  }
  arrive(rnd){
    const n=[];
    for(const u of [...this.column]){
      if(u.routed){ this.column.splice(this.column.indexOf(u),1); continue; }
      if(u.deployAt>rnd) continue;
      this.column.splice(this.column.indexOf(u),1);
      if(u.plan==="wing"&&this.wingWidth()+u.t.width<=this.wingCap){ u.wingSide=u.wingSide||(this.wings.length%2?"R":"L"); this.wings.push(u); u.pos="wing"; }
      else if(u.plan!=="rear"&&!u.rangedUnit&&this.frontWidth()+u.t.width<=this.width){ this.front.push(u); u.pos="front"; }
      else { this.rear.push(u); u.pos="rear"; }
      n.push(u);
    }
    return n;
  }
  composition(){
    const us=this.units.filter(u=>!u.nc); const n=Math.max(1,us.length);
    const cav=us.filter(u=>u.t.cav).length/n, rng=us.filter(u=>u.rangedUnit).length/n, inf=us.filter(u=>u.t.inf).length/n;
    const fire=us.reduce((s,u)=>s+u.t.ranged,0);
    const pen={org:1,front_absorb:1,cav_stam:0,rear_rec:1,no_ranged:1}; const notes=[];
    if(cav>0.5){const x=(cav-0.5)/0.5; pen.org*=1+0.3*x; pen.front_absorb*=1-0.3*x; pen.cav_stam=1+2*x; pen.rear_rec*=1-0.3*x; notes.push(`骑兵过多 ${Math.round(cav*100)}%：难以结阵，马力消耗大`);}
    if(rng>0.4){const x=(rng-0.4)/0.6; pen.org*=1+0.4*x; notes.push(`远程过多 ${Math.round(rng*100)}%：前阵单薄`);}
    if(fire===0){pen.no_ranged=P.NO_RANGED_FIRE; notes.push("无远程：对射阶段只能挨打");}
    if(inf<0.3){pen.org*=1.15; pen.rear_rec*=0.7; notes.push(`步兵骨架不足 ${Math.round(inf*100)}%`);}
    if(cav===0) notes.push("无骑兵：不能两翼包抄与追击");
    this.pen=pen; this.notes=notes;
  }
  refresh(){this.eff=cmdEffects(this.cmd,this.generalAlive,this.units.filter(u=>!u.nc).length);
    const f=this.fm; this.eff.swaps=Math.max(1,this.eff.swaps+(f.swaps||0)); }
  aliveFront(){return this.front.filter(u=>u&&!u.routed)}
  aliveWings(){return this.wings.filter(u=>!u.routed)}
  aliveColumn(){return this.column.filter(u=>!u.routed)}
  frontWidth(){return this.aliveFront().reduce((s,u)=>s+u.t.width,0)}
  wingWidth(){return this.aliveWings().reduce((s,u)=>s+u.t.width,0)}
  effFrontWidth(){return this.frontWidth()*this.stretch}
  updateStretch(en){const have=this.frontWidth(), need=Math.min(en.frontWidth(),this.width);
    this.stretch = (have>0 && have<need) ? Math.min(need/have,this.eff.max_stretch) : 1;}
  flankGuard(){let g=this.eff.flank_guard+(this.fm.guard||0)+(this.sm?this.sm.guard:0); if(this.rear.some(u=>!u.routed&&u.t.inf&&u.orgp>=0.5)) g+=P.FLANK_GUARD_RESERVE; return Math.max(0,Math.min(g,P.FLANK_GUARD_MAX));}
  flankMults(){const fa=this.fortActive(); const g=Math.min(0.95,this.flankGuard()+P.FORT_GUARD*fa.L+fa.W); return [1+(P.FLANK_ATK-1)*(1-g), 1+(P.FLANK_ORG-1)*(1-g)];}
  men(){return this.units.reduce((s,u)=>s+u.men,0)}
  engineUnits(){ return this.units.filter(u=>u.isEngine&&!u.destroyed); }
  get engines(){ return this.engineUnits().length; }
  get engineHP(){ return this.engineUnits().reduce((a,u)=>a+u.hp,0); }
  engineFire(){ return this.engineUnits().filter(u=>u.pos==="rear").reduce((a,u)=>a+(0.5+0.5*u.hp/P.ENGINE_HP)*Math.max(0.3,u.strength),0); }   // 有效轰击力（具）
  /* 器械受损：集中于持久最低的一具，归零即毁 */
  damageEngines(dmg,ev,why){ let left=dmg;
    while(left>0.01){ const es=this.engineUnits().filter(u=>u.pos==="rear"); if(!es.length) break; const u=es.reduce((m,x)=>x.hp<m.hp?x:m,es[0]);
      const d=Math.min(u.hp,left); u.hp-=d; left-=d; if(u.hp<=0.01) this.destroyEngine(u,ev,why); } }
  destroyEngine(u,ev,why){ u.hp=0; u.destroyed=true; u.routed=true; const l=u.men*P.ENGINE_CREW_LOSS; u.men-=l; u.dead+=l;
    if(ev) ev.push({t:`攻城器械被毁一具${why?"（"+why+"）":""}，余 ${this.engines} 具`,s:this.name,big:true}); }
  /* 造械：先修复被毁者，不足再从步卒抽调工匠新造 */
  buildEngine(){ if(this.engines>=P.ENGINE_MAX) return false;
    const old=this.units.find(u=>u.isEngine&&u.destroyed);
    if(old){ old.destroyed=false; old.routed=false; old.hp=P.ENGINE_HP; old.org=old.maxOrg; old.stamina=100; const need=old.maxMen-old.men; const donor=this.units.filter(u=>!u.routed&&u.t.inf).sort((a,b)=>b.men-a.men)[0]; if(donor&&need>0){ const x=Math.min(need,donor.men*0.3); donor.men-=x; old.men+=x; } return true; }
    const donor=this.units.filter(u=>!u.routed&&u.t.inf&&u.men>P.ENGINE_CREW*2).sort((a,b)=>b.men-a.men)[0]; if(!donor) return false;
    const u=new Unit("器械",this,++this.uid); donor.men-=P.ENGINE_CREW; donor.maxMen-=P.ENGINE_CREW; this.units.push(u); return true; }
  wounded(){return this.units.reduce((s,u)=>s+(u.wounded||0),0)}
  /* 工事 / 城墙只在固守时生效；出阵、出城突击即离开工事 */
  fortActive(){ const o=this.orders; const hold=o?["hold","feign","bombard"].includes(o.stance):!this.attacker;
    return {L:hold?this.fort:0, W:(hold&&this.wall)?this.wall.W*(1-P.CLIMB_BREACH*(this.wall.F||0)):0}; }
  power(){return this.units.reduce((s,u)=>s+((u.routed||u.isSupply)?0:u.men*Math.max(0,u.orgp)),0)}
}

class Battle{
  constructor(spec, seed){
    this.R=makeRng(seed ?? Math.floor(Math.random()*4294967296));
    this.terr=TERRAIN[spec.terrain]; this.mode=spec.mode; this.hold=spec.mode==="攻守"?(spec.hold||0):0;
    this.stage = spec.mode==="围城"?"围城战":(spec.mode==="阵地"?"阵地战":"野战"); this.daily=[]; this.endReason=null;
    this.days=Math.max(1,spec.days||1); this.firstRounds=spec.rounds||0; this.day=1; this.dayStart=0; this.weather=spec.weather||"晴"; this.night0=!!spec.night;
    this.bothAtk = spec.mode==="决战"||spec.mode==="遭遇";
    this.A=new Side(this,"A",spec.A,true); this.B=new Side(this,"B",spec.B,this.bothAtk);
    this.phase = this.bothAtk?1:0; this.rnd=0; this.done=false; this.winner=null; this.nightRetreat=false;
    this.luck={A:Math.max(0.6,this.normal(1,P.BATTLE_LUCK_SD)), B:Math.max(0.6,this.normal(1,P.BATTLE_LUCK_SD))};
    if(spec.luckBias) for(const k of ["A","B"]) if(spec.luckBias[k]) this.luck[k]*=spec.luckBias[k];   // 历史模式：史实倾向
    const fk=(me,en)=>{const r=en.units.length/Math.max(1,me.units.length); return Math.max(0,(me.cmd-P.FEW_CMD)/(100-P.FEW_CMD))*Math.min(Math.max(r-1,0),1);};
    this.few={A:fk(this.A,this.B), B:fk(this.B,this.A)};
    this.events=[]; this.dayLog=[];
    if(spec.mode==="遭遇"){ this.A.toColumn(); this.B.toColumn(); }
    this.applyWallWidth();
    if(!this.A.units.length||!this.B.units.length) this.done=true;
  }
  r(){return this.R()}
  normal(m,s){const u=1-this.R(), v=this.R(); return m+s*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  binom(n,p){let k=0;for(let i=0;i<n;i++) if(this.R()<p)k++;return k;}
  sround(x){const f=Math.floor(x);return f+(this.R()<x-f?1:0);}
  pick(arr){return arr[Math.floor(this.R()*arr.length)];}
  other(s){return s===this.A?this.B:this.A;}
  get deploying(){return this.A.aliveColumn().length>0||this.B.aliveColumn().length>0;}
  get dayRound(){return this.rnd-this.dayStart;}
  /* 城墙完好时，攻方只能在有限的城段展开（云梯、城门、缺口） */
  applyWallWidth(){ for(const s of [this.A,this.B]){ const en=this.other(s); s.applyFormationShape(); const w=s.baseWidth; s.width=w;
      const nw = en.wall ? Math.max(2,Math.round(w*(P.WALL_WIDTH_MIN+(1-P.WALL_WIDTH_MIN)*(1-en.wall.W)))) : w;
      s.width=nw; if(!s.column.length) s.deploy(s.units.filter(u=>!u.routed)); } }
  anyFight(){ return [this.A,this.B].some(s=>s.plan==="FIGHT"||s.plan==="SORTIE"); }
  startDay(){ for(const s of [this.A,this.B]) s.dayStats={power0:s.power(), en0:this.other(s).power(), dead0:s.units.reduce((a,u)=>a+u.dead,0), routed0:s.units.filter(u=>u.routed).length, attackRounds:0, contactRounds:0, work0:this.workOf(this.other(s))}; }
  workOf(x){ return x.wall?x.wall.W:(x.fortMax>0?x.fort/x.fortMax:1); }
  planName(p){ return {FIGHT:"再战",REST:"休整",FORTIFY:"筑垒",SIEGEWORK:"造攻城器械",SORTIE:"出城突击",WITHDRAW:"撤退",SURRENDER:"开城投降",RAID:"奇袭粮道"}[p]||p; }

  step(){
    if(this.done) return;
    const A=this.A,B=this.B,sides=[A,B]; const terr=this.terr;
    this.rnd++; const rnd=this.rnd; const dr=rnd-this.dayStart; this.fx=[];   // fx：本回合攻击动作（供界面动画）
    if(dr===1){ this.startDay();
      if(this.day>1&&!this.anyFight()){            // 双方都不出战：整日对垒，直接进入夜间
        this.rnd+=P.DAY_ROUNDS-1;
        this.events=[{t:`第${this.day}日：两军对垒未战（甲军${this.planName(A.plan)}，乙军${this.planName(B.plan)}）`,s:""}];
        if(this.day<this.days) this.night(); else { this.winner=null; this.endReason="期满对峙"; this.finish(); }
        return; } }
    if(this.tacticHook) this.tacticHook(this);
    // 战术效果与克制
    for(const s of sides){ const T=s.tactic, E=this.other(s).tactic; const m={atk:1,def:1,orgTaken:1,orgDealt:1,stam:1,charge:1};
      if(T&&T.mods) for(const k in m) m[k]*=T.mods[k]??1;
      let ct=null; if(T&&E&&T.counters&&T.counters[E.id]){ const x=T.counters[E.id]; m.atk*=1+x; m.orgDealt*=1+x; ct=E.id; }
      if(ct&&ct!==s.countering) this.pendingEv=(this.pendingEv||[]).concat([{t:`「${T.name}」克制敌「${E.name}」（+${Math.round(T.counters[E.id]*100)}%）`,s:s.name,big:T.counters[E.id]>=0.2}]);
      s.countering=ct; s.tm=m; }
    for(const s of sides){ const T=s.tactic, en=this.other(s); if(T&&T.enMods) for(const k in en.tm) en.tm[k]*=T.enMods[k]??1; }   // 对敌效果
    for(const s of sides){ const f=s.fm, en=this.other(s); for(const k of ["atk","def","orgTaken","orgDealt","stam","charge"]) s.tm[k]*=f[k]??1;   // 阵型
      const x=(f.counters||{})[en.formation]||0; if(x){ s.tm.atk*=1+x; s.tm.orgDealt*=1+x; }
      if(x&&s.formCounterShown!==en.formation){ s.formCounterShown=en.formation; this.pendingEv=(this.pendingEv||[]).concat([{t:`${f.name}阵克制敌${en.fm.name}阵（+${Math.round(x*100)}%）`,s:s.name}]); } }
    // ── 计谋：佯退诱敌 / 激怒骂阵 / 下书约战 ──
    const pre=[]; const iF=x=>Math.max(0.15,Math.min(2.5,1+x/P.INT_SCALE));
    for(const s of sides){ const en=this.other(s), o=s.orders, k=o&&o.lure;
      if(!k){ s.lureBlown=false; continue; } if(en.lured>0||!(en.wall||en.fort>0.5)||this.phase>=2) continue;
      const NAME={retreat:"佯退",taunt:"骂阵激将",challenge:"下书约战"}[k];
      if(k!=="challenge"&&this.r()<(k==="retreat"?P.LURE_SEE_RETREAT:P.LURE_SEE_TAUNT)*iF(en.int-s.int)*Math.pow(1/P.LURE_REPEAT,s.lureSeen)){
        s.lureSeen++; s.lureBlown=true; pre.push({t:`${en.name==="A"?"甲":"乙"}将识破${NAME}之计，坚守不出`,s:en.name,big:true}); continue; }
      let pt=(k==="retreat"?P.LURE_TAKE_RETREAT:k==="taunt"?P.LURE_TAKE_TAUNT:P.LURE_TAKE_CHALLENGE)*iF(s.int-en.int)*Math.max(0.2,1+P.LURE_RASH*en.rash)*Math.pow(P.LURE_REPEAT,s.lureSeen);
      if(k==="challenge") pt*=Math.max(0.2,Math.min(2,en.power()/Math.max(1,s.power())));
      if(this.r()<pt){ en.lured=k==="challenge"?P.CHALLENGE_ROUNDS:P.LURE_ROUNDS; en.lureKind=k;
        if(k==="retreat") en.disorder=P.LURE_DISORDER;
        s.ambush=k==="retreat"?P.LURE_AMBUSH_ROUNDS:k==="taunt"?Math.ceil(P.LURE_AMBUSH_ROUNDS/2):0;
        this.phase=Math.max(this.phase,1);
        pre.push({t:k==="retreat"?"中计！开城追击佯退之敌":k==="taunt"?"守将被激怒，开城出战":"应战，开城列阵",s:en.name,big:true}); }
      else if(k==="taunt") for(const u of en.aliveFront()) u.org-=u.maxOrg*P.TAUNT_ORG; }
    for(const s of sides){ s.lureKindNow=s.lured>0; if(s.lured>0){ s.orders={...(s.orders||{wings:"flank",reserve:"rotate"}),stance:"assault",wings:s.lureKind==="challenge"?"flank":"flank",reserve:s.lureKind==="challenge"?"rotate":"commit",screen:false,repair:false,fire:false,lure:null};
        s.lured--; if(s.lured===0) pre.push({t:"出城之兵收回城中",s:s.name}); }
      s.ambushNow=s.ambush>0; if(s.ambush>0) s.ambush--; }
    // ── 弃辎重诱敌：本方佯败于道，追兵见辎重马匹而争抢 ──
    for(const s of sides){ const en=this.other(s), o=s.orders, eo=en.orders;
      en.lootingNow=en.looting>0; if(en.looting>0){ en.disorder=Math.max(en.disorder,1); en.looting--; if(en.looting===0) pre.push({t:"收拢争抢之兵，重整队伍",s:en.name}); }
      if(!o||!o.bait||en.looting>0||s.baitSeen) continue;
      const chase=eo?["advance","assault"].includes(eo.stance):en.baseAttacker; if(!chase||this.phase<1) continue;
      if(this.r()<P.BAIT_SEE*iF(en.int-s.int)){ s.baitSeen=true; pre.push({t:"主将识破弃辎重之计，严令三军不得争抢",s:en.name,big:true}); continue; }
      if(this.r()<P.BAIT_TAKE*iF(s.int-en.int)*Math.max(0.2,1+P.LURE_RASH*en.rash)){
        en.looting=P.BAIT_ROUNDS; en.disorder=Math.max(en.disorder,P.BAIT_ROUNDS);
        for(const u of en.units) if(!u.routed&&!u.nc) u.org-=u.maxOrg*P.BAIT_ORG*(u.t.cav?1.5:0.7);
        s.ambush=Math.max(s.ambush,P.LURE_AMBUSH_ROUNDS);
        pre.push({t:"追兵见道旁辎重马匹，争相抢掠，队伍大乱",s:en.name,big:true}); } }
    if(pre.length) this.pendingEv=(this.pendingEv||[]).concat(pre);
    const ord=s=>s.orders;
    for(const s of sides){ const o=ord(s); s.attacker = o ? !["hold","feign"].includes(o.stance) : s.baseAttacker; }
    const advancing = sides.some(s=>!ord(s) ? s.baseAttacker : ["advance","assault","probe"].includes(ord(s).stance));
    // 佯败后撤：付出组织度代价；对方若继续压上则阵形脱节
    for(const s of sides){ const o=ord(s); if(o&&o.stance==="feign"){ for(const u of s.aliveFront()) u.org-=u.maxOrg*P.FEIGN_ORG;
        const en=this.other(s), eo=ord(en); const chase = eo ? ["advance","assault"].includes(eo.stance) : en.baseAttacker;
        if(chase&&!s.feignSeen&&!en.disorder&&this.r()<P.FEIGN_SEE*Math.max(0,en.int-s.int)/P.INT_SCALE){ s.feignSeen=true; this.pendingEv=(this.pendingEv||[]).concat([{t:"识破诈败，稳步压上不追",s:en.name,big:true}]); }
        if(chase&&!s.feignSeen){ if(!en.disorder) this.pendingEv=(this.pendingEv||[]).concat([{t:"追击诈败之敌，阵形脱节",s:en.name}]); en.disorder=P.DISORDER_ROUNDS; } }
      else s.feignSeen=false; }
    if(dr > 1 + (this.day===1?this.hold:0) && this.phase<2 && advancing) this.phase++;
    else if(!advancing&&this.phase===2&&this.stage!=="野战"&&!this.bothAtk&&sides.every(x=>!x.lured)&&sides.some(x=>x.fort>0.3||x.wall)){   // 阵地/围城：双方都不进，各自退回营垒、城上
      this.phase=1; this.pendingEv=(this.pendingEv||[]).concat([{t:"两军脱离接触，各自收兵回营",s:""}]); }
    const phase=this.phase; const ev=this.pendingEv||[]; this.pendingEv=null; const inc=new Map();
    const climbW=s=>{ const en=this.other(s); return (phase===2&&s.attacker&&en.wall&&!this.bothAtk)?en.fortActive().W:0; };   // 本方前阵正在蚁附登城时的城高系数
    /* 城上接战份额：未登城、无缺口时为 0（攻方只能攀梯，守方只能擂石推梯）；先登进度或城墙缺口越大，白刃越多 */
    const gapG=w=>Math.max(w.F||0, Math.max(0,Math.min(1,(P.CLIMB_GAP_W-w.W)/P.CLIMB_GAP_W)));
    const meleeShare=s=>{ const en=this.other(s); if(climbW(s)>0) return gapG(en.wall); if(climbW(en)>0) return gapG(s.wall); return 1; };
    this.climbing=sides.some(x=>climbW(x)>0)?Math.min(...sides.map(meleeShare)):null;
    for(const s of sides){ const en=this.other(s), o=ord(s); if(s.dayStats){ if(phase===2) s.dayStats.contactRounds++; if(phase===2&&s.attacker) s.dayStats.attackRounds++; }
      if(en.wall&&s.engines>0){ const st=o?o.stance:(s.attacker?"advance":"hold"); const before=en.wall.W; const ef=s.engineFire(); let fired=false;
        if(st==="bombard"){ en.wall.W=Math.max(0,en.wall.W-P.ENGINE_DMG*ef); fired=true; }
        else if(phase===2&&s.attacker){ en.wall.W=Math.max(0,en.wall.W-P.ENGINE_DMG*P.ENGINE_ASSAULT_DMG*ef); fired=true; }
        if(fired) for(const u of s.engineUnits()) if(u.pos==="rear") this.fx.push([u.id,"WALL"+en.name,"e"]);
        if(fired) for(const u of s.engineUnits()) if(u.pos==="rear"){ u.hp=Math.max(0,u.hp-P.ENGINE_WEAR); if(u.hp<=0) s.destroyEngine(u,ev,"久用损坏"); }
        if(before>=0.4&&en.wall.W<0.4) ev.push({t:"城墙崩塌一段，出现缺口",s:s.name,big:true}); }
      if(phase<2&&o&&o.stance==="hold"&&s.plan==="FORTIFY"){ s.fort=Math.min(P.FORT_MAX,s.fort+P.FORT_BUILD_ROUND); s.fortMax=Math.max(s.fortMax,s.fort); } }
    for(const s of sides){ const arr=s.arrive(rnd); if(arr.length&&this.mode==="遭遇") ev.push({t:`展开 ${arr.length} 部（${[...new Set(arr.map(u=>u.name))].join("、")}）`,s:s.name,minor:arr.length<2}); }
    for(const s of sides) for(const u of s.units){u.lastOd=0;u.flank=false;u.raid=false;}
    const base=u=>u.strength*u.stamF*(u.orgp<P.SHAKEN?P.SHAKEN_ATK:1);
    const hit=(tgt,atk,src,orgm=1,charge=false,melee=false)=>{
      if(melee&&tgt.t.skirmish&&tgt.pos!=="column") atk*= src.t.cav?P.SKIRMISH_EVADE_CAV:P.SKIRMISH_EVADE;
      if(melee&&src.t.skirmish&&!tgt.t.cav&&tgt.pos!=="column") atk*=P.SKIRMISH_MELEE;
      const pierce=src.t.pierce+((src.t.anti_cav&&tgt.t.cav)?P.ANTI_CAV_PIERCE:0);
      if(pierce<tgt.t.armor) atk*=P.LOW_PIERCE_ATK;
      if(src.side.attacker&&!this.bothAtk) atk*=terr.atk_mult;
      atk*=this.luck[src.side.name]*(1+P.FEW_ATK*this.few[src.side.name])*src.side.tm.atk*(charge?src.side.tm.charge:1);
      if(tgt.pos==="front"&&tgt.side.orders&&tgt.side.orders.stance==="feign") atk*=P.FEIGN_TAKEN;
      if(tgt.pos==="front"&&src.side!==tgt.side){ const fw=tgt.side.fortActive();
        if(fw.L||fw.W){ if(charge) atk*=Math.max(0,1-P.FORT_CHARGE*fw.L)*(1-0.9*fw.W);
          else if(melee) atk*=(1-P.FORT_ATK*fw.L)*(P.WALL_ATK+(1-P.WALL_ATK)*(1-fw.W));
          else atk*=(1-P.WALL_COVER*fw.W)*(1-P.FORT_ATK*0.5*fw.L); } }
      if(tgt.pos==="front"&&tgt.side.disorder>0&&!src.side.disorder){ const [am,om]=tgt.side.flankMults(); atk*=am; orgm*=om; }
      if(tgt.pos==="front"&&src.side!==tgt.side){ const cw=climbW(tgt.side); if(cw>0&&!melee&&!charge) atk*=1+P.CLIMB_SHOT*cw; }
      if(src.t.cav&&src.side!==tgt.side&&tgt.pos==="front"&&climbW(src.side)>0&&(melee||charge)) atk*=P.CLIMB_CAV+(1-P.CLIMB_CAV)*(1-tgt.side.wall.W);
      if(!melee&&!charge){ const to=tgt.side.orders, so=src.side.orders;
        atk*=src.side.sm.ranged*tgt.side.sm.rangedTaken; }
      if(tgt.isSupply&&src.side!==tgt.side) atk*=P.SUPPLY_BURN*src.side.sm.burn;
      if(atk>0){ if(!inc.has(tgt)) inc.set(tgt,[]); inc.get(tgt).push([atk,pierce,orgm,charge]); if(src.side!==tgt.side) this.fx.push([src.id,tgt.id,charge?"c":melee?"m":(src.isEngine?"e":"r")]); }
    };
    const tryCharge=(u,tgt,fm=1,fromSide=false)=>{
      if(!u.t.cav||u.orgp<P.SHAKEN||u.side.looting>0) return;
      if(u.t.skirmish){ if(rnd-u.lastCharge<P.SKIRMISH_RECHARGE) return; } else if(u.charged) return;
      u.lastCharge=rnd;
      let ch=u.t.charge*base(u)*fm;
      if(tgt.t.anti_cav&&tgt.orgp>=P.SHAKEN&&tgt.pos!=="column"){ ch*= fromSide?P.ANTI_CAV_FLANK_MULT:P.ANTI_CAV_MULT; if(!fromSide) u.org-=u.t.charge*0.6*u.side.eff.org_dmg_mult; }
      if(tgt.t.cav&&tgt.t.ranged>0) ch*=P.LIGHT_CAV_EVADE;
      u.charged=true; hit(tgt,ch,u,fm,true);
    };
    const raided={A:0,B:0};
    // 相持：阵地/围城中双方都据垒不出（未接战），只有零星对射
    const standoff=phase<2&&this.stage!=="野战"&&sides.every(x=>{ const o=x.orders; return (o?["hold","bombard"].includes(o.stance):!x.attacker)&&(x.fort>0.3||x.wall); });   // 营对营
    // ── 状态效果 ──
    for(const s of sides){ s.sm={guard:0,swaps:0}; for(const k of ST_MUL) s.sm[k]=1; s.statuses=[]; }
    const app=(x,m)=>{ for(const k in (m||{})){ const v=+m[k]; if(!isFinite(v)) continue; if(ST_ADD.includes(k)) x.sm[k]+=v; else if(k in x.sm) x.sm[k]*=v; } };
    const act=(s,id)=>{ const d=STATUS[id]; if(!d||d.off) return; s.statuses.push(id); app(s,d.self); app(this.other(s),d.enemy); };
    for(const s of sides){ const o=s.orders||{}, fa=s.fortActive();
      if(s.generalAlive) act(s,s.genPos==="rear"?"GEN_REAR":"GEN_FRONT"); else act(s,"GEN_LOST");
      if(s.ambushNow) act(s,"AMBUSH"); if(s.lureKindNow){ act(s,s.lureKind==="taunt"?"TAUNTED":"LURED"); }
      if(s.lootingNow) act(s,"LOOTING"); if(s.disorder>0) act(s,"DISORDER"); if(o.stance==="feign") act(s,"FEIGN");
      if(o.screen) act(s,"SHIELD"); if(o.fire) act(s,"FIRE"); if(o.repair) act(s,"REPAIR");
      if(climbW(s)>0) act(s,"CLIMB"); if(fa.W>0) act(s,"WALL_HOLD"); else if(fa.L>0.3) act(s,"FORT_HOLD");
      if(standoff) act(s,"STANDOFF"); if(s.food!=null&&s.food<=0) act(s,"STARVING"); if(this.few[s.name]>0) act(s,"FEW");
      const W={"雨":"W_RAIN","大风":"W_WIND","雾":"W_FOG","雪":"W_SNOW","酷暑":"W_HEAT"}[this.weather]; if(W) act(s,W); if(this.night0) act(s,"NIGHT");
      const M={destroy:"M_RAID",hold:"M_HOLD",delay:"M_HOLD",escort:"M_ESCORT"}[s.mission.type]; if(M) act(s,M); }
    for(const s of sides){ s.sm.ranged*=s.fm.ranged||1; for(const k of ["atk","def","orgTaken","orgDealt","stam","charge"]) s.tm[k]*=s.sm[k]; }

    // ── 两翼：对冲 / 包抄 / 突袭行军队列 ──
    const flanking={A:[],B:[]};
    if(phase>=1){
      const wa=A.aliveWings(), wb=B.aliveWings();
      const wingIdle=x=>x.orders&&["hold","screen"].includes(x.orders.wings);
      if(wa.length&&wb.length&&wingIdle(A)&&wingIdle(B)){}                       // 两翼皆按兵护翼：不对冲
      else if(wa.length&&wb.length){
        ev.push({t:"骑兵对冲",s:""});
        for(const [me,en] of [[wa,wb],[wb,wa]]) for(const u of me){ const tgt=this.pick(en); hit(tgt,melee_atk(u,tgt)*base(u),u,1,false,true); tryCharge(u,tgt); u.stamina-=P.STAM_WING; }
      } else {
        for(const [me,en,w] of [[A,B,wa],[B,A,wb]]){
          if(!w.length) continue;
          if(me.orders&&(me.orders.wings==="hold"||me.orders.wings==="screen")) continue;
          if(en.wall&&en.fortActive().W>0) continue;
          if(en.fortActive().L>=P.FORT_CLOSED) continue;                       // 营垒四面合围：骑兵无从迂回
          const ef=en.aliveFront(), col=en.aliveColumn();
          for(const u of w){
            const sup=en.rear.filter(x=>x.isSupply&&!x.routed&&x.men>1);
            if(u.t.cav&&sup.length&&this.r()<Math.min(0.95,P.SUPPLY_RAID*(me.mission.type==="destroy"?P.RAID_FOCUS:1)*(1-en.flankGuard()))){   // 突入后阵焚辎重
              const tg=this.pick(sup); hit(tg,(melee_atk(u,tg)+u.t.charge*0.5)*base(u),u,1,false,true); u.raid=true; u.stamina-=P.STAM_WING;
              ev.push({t:"翼骑突入后阵，纵火焚烧辎重",s:me.name,big:me.mission.type==="destroy"}); continue; }
            if(u.t.cav&&en.engineUnits().some(e=>e.pos==="rear")&&this.r()<P.ENGINE_RAID*(1-en.flankGuard())){       // 突入后阵焚器械
              const n0=en.engines; { const es=en.engineUnits().filter(e=>e.pos==="rear"); if(es.length) this.fx.push([u.id,es[0].id,"c"]); } en.damageEngines(P.ENGINE_RAID_DMG*(u.t.charge+u.t.soft)/20*base(u),ev,"敌骑突入后阵");
              if(en.engines===n0) ev.push({t:"翼骑突入后阵，袭扰攻城器械",s:me.name});
              u.raid=true; u.stamina-=P.STAM_WING; continue; }
            const g=en.genUnit; if(u.t.cav&&en.genPos==="rear"&&g&&!g.routed&&g.pos==="rear"&&this.r()<P.GEN_REAR_RAID*(1-en.flankGuard())){   // 突入中军
              hit(g,melee_atk(u,g)*base(u),u,1,false,true); tryCharge(u,g,1,true);
              ev.push({t:"翼骑绕后，突入中军",s:me.name,big:true}); u.raid=true; u.stamina-=P.STAM_WING; continue; }
            if(col.length&&(!ef.length||this.r()<P.ENC_RAID)){
              const tgt=this.pick(col); hit(tgt,(melee_atk(u,tgt)+u.t.ranged)*base(u),u,1,false,true); tryCharge(u,tgt,1,true);
              u.raid=true; raided[me.name]++; u.stamina-=P.STAM_WING; continue;
            }
            if(!ef.length) continue;
            const [am,om]=en.flankMults(); const edges=[ef[0],ef[ef.length-1]];
            const tgt=this.pick(edges);
            hit(tgt,melee_atk(u,tgt)*base(u)*am,u,om,false,true); hit(tgt,u.t.ranged*base(u),u);
            tryCharge(u,tgt,am,true); u.stamina-=P.STAM_WING; flanking[me.name].push(u); u.flank=true;
          }
          if(flanking[me.name].length) ev.push({t:`翼骑包抄（敌护翼${Math.round(en.flankGuard()*100)}%）`,s:me.name});
        }
      }
    }
    A.updateStretch(B); B.updateStretch(A);

    // ── 前阵与后阵 ──
    for(const [me,en] of [[A,B],[B,A]]){
      const ef=en.aliveFront(), col=en.aliveColumn();
      if(!ef.length&&!col.length) continue;
      const tw=ef.reduce((s,u)=>s+u.t.width,0);
      const overflow=ef.length?me.frontWidth()-en.effFrontWidth():0;
      const flankers=new Set();
      if(overflow>0){ let acc=0; const mf=me.aliveFront(); for(let i=mf.length-1;i>=0;i--){ if(acc>=overflow) break; flankers.add(mf[i]); acc+=mf[i].t.width; } }
      const [am,om]=en.flankMults(); const edges=ef.length?[ef[0],ef[ef.length-1]]:[];
      const myFront=me.aliveFront(); const myEdges=new Set(myFront.length?[myFront[0],myFront[myFront.length-1]]:[]);
      const enemyFlankers=flanking[en.name];
      for(const u of myFront.concat(me.rear.filter(r=>!r.routed))){
        const inFront=u.pos==="front"; const b=base(u); let fl=flankers.has(u);
        if(inFront&&myEdges.has(u)&&enemyFlankers.length&&this.r()<P.WING_COUNTER){
          const tgt=this.pick(enemyFlankers); if(phase===2) hit(tgt,melee_atk(u,tgt)*b,u,1,false,true); continue;
        }
        if(u.t.cav&&u.pos==="rear"&&col.length&&phase>=1&&!u.routed&&u.orgp>=P.SHAKEN){   // 后阵骑兵出击行军队列
          const tgt=this.pick(col); hit(tgt,(melee_atk(u,tgt)+u.t.ranged)*b,u,1,false,true); tryCharge(u,tgt,1,true);
          u.raid=true; raided[me.name]++; u.stamina-=P.STAM_WING; continue;
        }
        let tgt;
        if(me.mission.type==="destroy"&&(inFront||u.t.cav)&&phase>=1){ const sup=en.rear.filter(x=>x.isSupply&&!x.routed&&x.men>1);
          if(sup.length&&(!ef.length||(fl||u.t.cav?this.r()<P.RAID_FRONT*2:this.r()<P.RAID_FRONT*Math.max(0,1-en.frontWidth()/Math.max(1,me.frontWidth()))+ (en.frontWidth()<me.frontWidth()?0.05:0)))){
            const tg=this.pick(sup); hit(tg,(melee_atk(u,tg)+u.t.ranged*0.3)*b,u,1,false,true); u.raid=true; continue; } }
        if(!ef.length || (col.length && (fl || (u.t.cav&&this.r()<P.ENC_RAID)))){ tgt=this.pick(col); fl=false; if(inFront){u.raid=true; raided[me.name]++;} }
        else if(fl) tgt=this.pick(edges);
        else if(this.r()<((me.orders&&me.orders.focus)?Math.max(me.eff.focus,0.55):me.eff.focus)){ const fo=me.orders&&me.orders.focus; const gen=ef.filter(e=>e.isGeneral);
          tgt=(gen.length&&this.r()<(fo==="general"?0.9:fo==="weakest"?0:P.CENTER_STRIKE))?gen[0]:ef.reduce((m,e)=>e.orgp<m.orgp?e:m,ef[0]); }
        else { let x=this.r()*tw; tgt=ef[ef.length-1]; for(const e of ef){ x-=e.t.width; if(x<0){tgt=e;break;} } }
        if(fl&&phase===2) u.flank=true;
        if(u.isEngine){ if(u.destroyed||en.wall||(en.fort>0.05&&me.orders&&me.orders.stance==="bombard")) continue; }   // 器械正在轰城/轰垒
        let rv=u.t.ranged*(inFront?[P.RF_FAR,P.RF_NEAR,P.RF_MELEE]:[P.RR_FAR,P.RR_NEAR,P.RR_MELEE])[phase];
        if(phase===0) rv*=u.t.far;
        if(rv&&u.t.reload>1){ if(me.eff.rotate_fire) rv*=P.ROTATE_FIRE_MULT; else if(rnd%u.t.reload===0) rv*=P.VOLLEY_MULT; else rv=0; }
        if(rv){ hit(tgt,rv*b*(u.isEngine?(0.5+0.5*u.hp/P.ENGINE_HP):1),u); if(u.isEngine){ u.hp=Math.max(0,u.hp-P.ENGINE_WEAR); if(u.hp<=0) me.destroyEngine(u,ev,"久用损坏"); } }
        const stc=me.orders?me.orders.stance:null;
        if(phase===2&&inFront&&stc!=="feign"&&stc!=="bombard"&&!(stc==="probe"&&this.r()<0.5)){ const g=meleeShare(me);
          if(g>0){ hit(tgt,melee_atk(u,tgt)*b*(fl?am:1)*g,u,fl?om:1,false,true); if(this.r()<g) tryCharge(u,tgt,fl?am:1,fl); }
          if(g<1&&climbW(en)>0&&!u.t.cav) hit(tgt,melee_atk(u,tgt)*b*P.CLIMB_STONE*(1-g),u); }   // 守城：擂石滚木、推倒云梯
      }
    }
    for(const k of ["A","B"]) if(raided[k]) ev.push({t:`突袭行军队列（${raided[k]} 部出击）`,s:k});

    // ── 伤害结算 ──
    for(const [tgt,lst] of inc){
      const s=tgt.side; let absorb; const col=tgt.pos==="column";
      if(tgt.pos==="wing") absorb=tgt.t.bt;
      else if(s.attacker||col) absorb=tgt.t.bt*(1-P.ATK_ABSORB_MIX)+tgt.t.defense*P.ATK_ABSORB_MIX;
      else absorb=tgt.t.defense*terr.def_mult;
      if(tgt.pos==="front") absorb*=s.pen.front_absorb*Math.pow(s.stretch,-P.STRETCH_ABSORB_EXP);
      if(tgt.pos==="front"&&s.disorder>0) absorb*=P.DISORDER_ABSORB;
      if(col) absorb*=P.ENC_ABSORB;
      if(tgt.pos==="front"){ const fw=s.fortActive(); absorb*=(1+P.FORT_ABSORB*fw.L)*(1+P.WALL_ABSORB*fw.W); }
      const cwT=tgt.pos==="front"?climbW(s):0; if(cwT>0) absorb*=1-P.CLIMB_ABSORB*cwT;
      absorb*=tgt.strength*tgt.stamF*s.tm.def;
      const total=lst.reduce((a,e)=>a+(e[3]?0:e[0]),0)||1e-9; const fr=Math.min(total,absorb)/total;
      const omult=s.eff.org_dmg_mult*s.pen.org*(1-P.FEW_ORG*this.few[s.name])*((tgt.isGeneral&&s.generalAlive)?(1-P.GENERAL_GUARD*s.cmd/100):1)
        *(phase<2?s.pen.no_ranged:(s.pen.no_ranged>1?P.NO_RANGED_MELEE:1))*(col?P.ENC_ORG:1)
        *((tgt.pos==="front"&&s.attacker&&phase===2)?(1+P.WALL_CLIMB*this.other(s).fortActive().W):1)*s.tm.orgTaken*this.other(s).tm.orgDealt;
      for(const [a,pierce,orgm,isCharge] of lst){
        const hits=isCharge?this.binom(this.sround(a),P.HIT_EXCESS):this.binom(this.sround(a*fr),P.HIT_ABSORBED)+this.binom(this.sround(a*(1-fr)),P.HIT_EXCESS);
        if(!hits) continue;
        let od=0,md=0; for(let h=0;h<hits;h++){od+=P.ORG_MIN+(P.ORG_MAX-P.ORG_MIN)*this.r(); md+=P.MEN_MIN+(P.MEN_MAX-P.MEN_MIN)*this.r();}
        od*=P.ORG_SCALE*orgm*omult; md*=P.MEN_SCALE*(1+P.CLIMB_MEN*cwT);
        if(tgt.t.armor>pierce){od*=P.ARMOR_ORG_MULT; md*=P.ARMOR_MEN_MULT;}
        tgt.org-=od; tgt.lastOd+=od; md=Math.min(md,tgt.men); tgt.men-=md; tgt.dead+=md; tgt.wounded=(tgt.wounded||0)+md*P.WOUNDED_SHARE;
      }
    }
    // ── 工事、城墙与器械的持久 ──
    const rangedPow=x=>x.units.reduce((a,u)=>a+((!u.routed&&!u.isEngine&&u.t.ranged>0&&u.pos!=="column"&&!u.t.cav)?u.t.ranged*u.strength*u.stamF:0),0);
    for(const s of sides){ const en=this.other(s), o=s.orders||{}, eo=en.orders||{};
      const f0=s.fort, w0=s.wall?s.wall.W:0;
      const enAtk = eo.stance ? ["advance","assault","probe"].includes(eo.stance) : en.attacker;
      if(phase===2&&enAtk&&(s.fortActive().L>0||s.fortActive().W>0)){             // 攻方步卒拆垒、毁城
        const n=en.aliveFront().filter(u=>!u.t.cav).length;
        if(s.fort>0) s.fort=Math.max(0,s.fort-P.STRUCT_MELEE*n); }                  // 城墙只受器械损伤
      if(eo.fire&&s.fort>0){ const rp=rangedPow(en)*(o.screen?(STATUS.SHIELD.self.rangedTaken??1):1)*(phase===0?0.7:1)*(standoff?(STATUS.STANDOFF.self.ranged??1):1);   // 火箭焚垒（只焚营垒）
        s.fort=Math.max(0,s.fort-P.FIRE_FORT*rp); }
      if(s.wall&&climbW(en)>0){                                                                      // 蚁附登城进度
        const fp=x=>x.aliveFront().reduce((a,u)=>a+(u.t.cav?0.15:1)*u.men*Math.max(0,u.orgp)*u.stamF,0);
        const F0=s.wall.F, ratio=Math.min(3,fp(en)/Math.max(1,fp(s)));
        const reserve=s.rear.some(u=>!u.routed&&!u.t.cav&&u.orgp>=0.5)||o.reserve==="commit";
        s.wall.F=Math.max(0,Math.min(1,F0+P.CLIMB_RATE*ratio*(1-0.5*s.wall.W)*en.tm.atk-P.CLIMB_REPEL*(reserve?P.CLIMB_RESERVE:1)*s.tm.def*Math.min(1,(s.aliveFront().reduce((q,u)=>q+Math.max(0,u.orgp),0)/Math.max(1,s.aliveFront().length))/0.8)));
        for(const u of en.aliveFront()) if(!u.t.cav) u.stamina-=P.STAM_MELEE*(P.CLIMB_STAM-1);
        if(F0<0.5&&s.wall.F>=0.5) ev.push({t:"先登！敌军攻上城头",s:en.name,big:true});
        if(F0<1&&s.wall.F>=1) ev.push({t:"城头失守，守军退守街巷",s:s.name,big:true});
        if(F0>=0.5&&s.wall.F<0.3) ev.push({t:"登城之敌被击退",s:s.name}); }
      else if(s.wall&&s.wall.F>0) s.wall.F=Math.max(0,s.wall.F-0.1);
      if(en.engines>0&&eo.stance==="bombard"&&s.fort>0){ for(const u of en.engineUnits()) if(u.pos==="rear") this.fx.push([u.id,"WALL"+s.name,"e"]); s.fort=Math.max(0,s.fort-P.ENGINE_FORT*en.engineFire());          // 器械轰垒
        for(const u of en.engineUnits()) if(u.pos==="rear"){ u.hp=Math.max(0,u.hp-P.ENGINE_WEAR); if(u.hp<=0) en.destroyEngine(u,ev,"久用损坏"); } }
      if(en.engines>0&&(s.fort>0.05||s.wall)&&(eo.stance==="bombard"||phase===2))                                 // 守方射击器械
        en.damageEngines(P.ENGINE_SHOT*rangedPow(s)*(o.screen?(STATUS.SHIELD.self.ranged??1):1)*(o.fire?2:1),ev,"守军矢石");
      if(o.stance==="assault"&&s.wall&&phase===2&&en.engines>0) en.damageEngines(P.SORTIE_ENGINE*s.aliveFront().length,ev,"守军出城突击");
      if(o.repair){ const crew=s.rear.filter(u=>!u.routed&&!u.rangedUnit&&u.orgp>=0.4);                          // 抢修
        const n=crew.length+(phase<2?0.5*s.aliveFront().length:0);
        if(s.fortMax>0) s.fort=Math.min(s.fortMax,s.fort+P.REPAIR_FORT*n);
        if(s.wall) s.wall.W=Math.min(1,s.wall.W+P.REPAIR_WALL*n);
        for(const u of crew) u.stamina=Math.max(0,u.stamina-P.REPAIR_STAM); }
      if(s.fortMax>0&&f0>=s.fortMax*0.5&&s.fort<s.fortMax*0.5) ev.push({t:"营垒被拆毁过半",s:s.name,big:true});
      if(s.fortMax>0&&f0>0.05&&s.fort<=0.05) ev.push({t:"营垒尽毁",s:s.name,big:true});
      if(s.wall&&w0>=0.4&&s.wall.W<0.4) ev.push({t:"城墙崩塌一段，出现缺口",s:s.name,big:true}); }
    // ── 体力与恢复 ──
    for(const s of sides){
      for(const u of s.aliveFront()) u.stamina-= (phase===2?P.STAM_MELEE:(u.t.ranged?3:1))*s.tm.stam;
      for(const u of s.units) if(u.t.cav&&!u.routed&&u.pos!=="column") u.stamina-=s.pen.cav_stam;
      for(const u of s.rear){ if(u.routed) continue; u.stamina=Math.min(100,u.stamina+5); u.org=Math.min(u.maxOrg,u.org+u.maxOrg*s.eff.rear_recover*s.pen.rear_rec*s.sm.recover); }
      for(const u of s.units) u.stamina=Math.max(0,u.stamina);
    }
    // ── 组织度检定 / 溃散 ──
    for(const s of sides){
      const cm=s.eff.contagion_mult*s.sm.contagion, other=this.other(s);
      const rout=u=>{
        u.routed=true; u.org=Math.max(u.org,0);
        for(const v of other.units) if(!v.routed) v.org=Math.min(v.maxOrg,v.org+v.maxOrg*P.MOMENTUM*other.cmd/100);
        if(u.isGeneral&&s.generalAlive){ for(const v of s.units) if(!v.routed) v.org-=v.maxOrg*P.GENERAL_LOST*cm; s.generalAlive=false; s.refresh(); ev.push({t:"中军溃散，主将退走",s:s.name,big:true}); }
      };
      const check=u=>u.org<=0||(u.orgp<P.BREAK&&this.r()>Math.min(0.97,s.eff.hold*s.sm.hold));
      let nr=0, nc=0;
      for(let i=0;i<s.front.length;i++){
        const u=s.front[i];
        if(u&&u.t.skirmish&&!u.routed&&u.orgp<P.SKIRMISH_WITHDRAW&&u.org>0){ s.front[i]=null; u.pos="rear"; s.rear.push(u); ev.push({t:"轻骑脱离休整",s:s.name,minor:true}); continue; }
        if(!u||u.routed||!check(u)) continue;
        rout(u); s.front[i]=null; nr++;
        for(const j of [i-1,i+1]) if(j>=0&&j<s.front.length&&s.front[j]) s.front[j].org-=s.front[j].maxOrg*P.CONTAGION*cm;
      }
      for(const u of s.aliveWings()){
        if(u.t.skirmish&&u.orgp<P.SKIRMISH_WITHDRAW&&u.org>0){ s.wings.splice(s.wings.indexOf(u),1); u.pos="rear"; s.rear.push(u); ev.push({t:"轻骑脱离休整",s:s.name,minor:true}); continue; }
        if(check(u)){ rout(u); ev.push({t:`${u.name}翼溃散`,s:s.name}); const f=s.aliveFront(); if(f.length){ const e=this.r()<0.5?f[0]:f[f.length-1]; e.org-=e.maxOrg*P.CONTAGION*cm; } }
      }
      for(const u of s.aliveColumn()){ if(check(u)){ rout(u); nc++; } }
      { const g=s.genUnit; if(g&&g.pos==="rear"&&!g.routed&&g.lastOd>0&&check(g)){ rout(g); ev.push({t:"中军亲卫溃散",s:s.name,big:true}); } }
      s.wings=s.aliveWings(); s.column=s.aliveColumn();
      if(nr) ev.push({t:`前阵溃散 ${nr} 部`,s:s.name});
      if(nc) ev.push({t:`行军中被冲散 ${nc} 部`,s:s.name,big:nc>=2});
    }
    // ── 轮换补位 ──
    for(const s of sides){
      let slots=Math.max(0,s.eff.swaps+Math.round(s.sm.swaps)); let moved=0;
      const ready=u=>!u.routed&&u.orgp>=0.5&&u.stamina>=40&&!u.rangedUnit&&!u.pinned&&!u.nc;
      for(let i=0;i<s.front.length;i++){
        if(slots<=0) break;
        if(s.front[i]===null){
          let cands=s.rear.filter(u=>ready(u)&&!u.t.cav); if(!cands.length) cands=s.rear.filter(ready);
          cands.sort((a,b)=>(b.orgp+b.stamina/100)-(a.orgp+a.stamina/100));
          for(const c of cands){ if(s.frontWidth()+c.t.width<=s.width){ s.rear.splice(s.rear.indexOf(c),1); s.front[i]=c; c.pos="front"; slots--; moved++; break; } }
        }
      }
      const rv=s.orders?s.orders.reserve:"rotate";
      const [tOrg,tSt]= rv==="aggressive_rotate"?[0.6,45]: rv==="commit"?[0.7,50]: rv==="keep"||rv==="guard"?[-1,-1]:[0.4,30];
      if(rv==="commit") slots++;
      for(let i=0;i<s.front.length;i++){
        if(slots<=0) break; const u=s.front[i];
        if(u&&(u.orgp<tOrg||u.stamina<tSt)){
          const room=u.t.width+s.width-s.frontWidth();
          const cand=s.rear.filter(c=>ready(c)&&c.orgp>0.7&&c.stamina>60&&c.t.width<=room);
          if(cand.length){ const sc=x=>x.orgp+x.stamina/100+(x.t.inf?0.5:0); const c=cand.reduce((m,x)=>sc(x)>sc(m)?x:m,cand[0]);
            s.rear.splice(s.rear.indexOf(c),1); s.front[i]=c; c.pos="front"; u.pos="rear"; u.charged=false; s.rear.push(u); slots--; moved++; }
        }
      }
      for(const c of s.rear.filter(u=>ready(u)&&u.t.cav)){
        if(slots<=0) break;
        if(s.wingWidth()+c.t.width<=s.wingCap){ s.rear.splice(s.rear.indexOf(c),1); s.wings.push(c); c.pos="wing"; c.charged=false; slots--; }
      }
      s.front=s.front.filter(u=>u!==null);
      if(!s.aliveFront().length){
        for(const c of s.rear.filter(u=>!u.routed&&!u.nc&&u.orgp>=P.BREAK)){ if(s.frontWidth()+c.t.width<=s.width){ s.rear.splice(s.rear.indexOf(c),1); s.front.push(c); c.pos="front"; } }
      }
      if(moved>=2) ev.push({t:`轮换补位 ${moved} 部`,s:s.name,minor:true});
    }
    this.events=ev;
    for(const s of sides) if(s.disorder>0) s.disorder--;
    // ── 战斗目标：达成即撤出；损失超过撤退阈值即撤 ──
    for(const s of sides){ const en=this.other(s), m=s.mission; let why=null, ok=false;
      if(m.type==="destroy"&&en.supply0>0&&en.supplyBurnt()>=m.goal){ why=`焚毁敌辎重 ${Math.round(en.supplyBurnt()*100)}%，目标达成，引兵撤出`; ok=true; }
      else if((m.type==="hold"||m.type==="delay")&&m.holdRounds>0&&this.rnd>=m.holdRounds){ why=`坚守 ${m.holdRounds} 回合，目标达成，有序撤出`; ok=true; }
      else if(m.retreatAt>0&&s.power()<m.retreatAt*s.power0){ why=`战力降至 ${Math.round(s.power()/s.power0*100)}%，低于撤退阈值，撤出战场`; }
      if(why){ s.missionDone=ok?"success":"fail"; ev.push({t:why,s:s.name,big:true}); s.orders={...(s.orders||{}),retreat:true}; s.withdrawWhy=why; break; } }
    for(const s of sides) if(s.orders&&s.orders.retreat){
      if(!s.withdrawWhy) ev.push({t:"留后卫阻击，主力有序撤出战场",s:s.name,big:true});
      this.winner=this.other(s); this.retreatSide=s; this.endReason=s.missionDone==="success"?"目标达成撤出":((this.mode==="围城"&&s===A)?"撤围":"撤退"); this.finish(); return; }
    const gone=s=>!s.aliveFront().length&&!s.aliveColumn().length;
    const ad=gone(A), bd=gone(B);
    if(ad||bd){ this.winner=(ad&&bd)?null:(ad?B:A); this.endReason = this.mode==="围城"?(this.winner===A?"城破":"攻城失败溃退"):"溃败"; this.finish(); return; }
    if(dr>=(this.day===1&&this.firstRounds?this.firstRounds:P.DAY_ROUNDS)){ if(this.day<this.days) this.night(); else { this.winner=null; this.endReason="期满对峙"; this.dayReport(); this.finish(); } }   // 首日可打的回合数：战役中按开战时段折算
  }

  /* 当日战况 */
  dayReport(){
    const rep={day:this.day};
    for(const s of [this.A,this.B]){ const en=this.other(s), d=s.dayStats||{power0:s.power(),en0:en.power(),dead0:0,routed0:0,attackRounds:0,contactRounds:0};
      const dead=s.units.reduce((a,u)=>a+u.dead,0)-d.dead0, myDrop=Math.max(1,d.power0-s.power()), enDrop=Math.max(0,d.en0-en.power());
      const alive=s.units.filter(u=>!u.routed);
      rep[s.name]={dead:Math.round(dead), wounded:Math.round(s.wounded()), men:Math.round(s.men()), org:alive.reduce((a,u)=>a+Math.max(0,u.org),0)/Math.max(1,s.units.reduce((a,u)=>a+u.maxOrg,0)),
        routed:s.units.filter(u=>u.routed).length-d.routed0, attack:d.attackRounds, contact:d.contactRounds, exchange:enDrop/myDrop, lossFrac:(d.power0-s.power())/Math.max(1,d.power0),
        fort:s.fort, fortMax:s.fortMax, engines:s.engines, engineHP:s.engineHP, food:s.food, wall:s.wall?s.wall.W:null, foothold:s.wall?s.wall.F:null, plan:s.plan, failDays:s.failDays};
      // 久攻不下：当日主动进攻、交换比不利、且未打出溃散
      if(d.attackRounds<4&&s.baseAttacker&&!this.bothAtk&&(en.fortMax>0||en.wall)){
        if(s.plan!=="FIGHT"||(en.wall&&(s.engines===0||(en.food!=null&&en.food<=3)))){}      // 主动休整/造械，或敌粮将尽：围而不攻不算久攻不下
        else if((d.work0??1)-this.workOf(en)<(en.wall?0.03:0.08)) s.failDays++; else s.failDays=0; }
      else if(d.attackRounds>=4){ if(enDrop/myDrop<P.FAIL_EXCHANGE&&rep[s.name].routed>=0&&en.units.filter(u=>u.routed).length-0<=(this.other(s).dayStats?this.other(s).dayStats.routed0:0)+1) s.failDays++; else s.failDays=0; }
      rep[s.name].failDays=s.failDays; }
    rep.stage=this.stage; this.daily.push(rep); return rep;
  }
  /* 日暮收兵：夜议定次日方略 → 撤退/投降 → 救治、修整、筑垒、造械、存粮 → 重新列阵 */
  night(){
    const A=this.A,B=this.B, ev=this.events;
    const rep=this.dayReport();
    for(const s of [A,B]){ s.plan="FIGHT"; s.planReason=""; s.aiPlanned=false; s.lured=0; s.ambush=0; s.lureBlown=false; s.looting=0; s.baitSeen=false; }
    if(this.dayHook) this.dayHook(this);
    for(const k of ["A","B"]) rep[k].plan=this[k].plan;
    for(const s of [A,B]) if(s.plan==="RAID"){ const en=this.other(s); s.raids++;              // 奇袭粮道（乌巢）
      const cav=s.units.filter(u=>!u.routed&&u.t.cav).sort((a,b)=>b.men*b.orgp-a.men*a.orgp)[0];
      const iF=x=>Math.max(0.15,Math.min(2.5,1+x/P.INT_SCALE));
      if(cav&&en.food!=null&&this.r()<P.RAID_P*iF(s.int-en.int)*(en.plan==="REST"?1.15:1)/(1+0.3*(en.raidsSeen||0))){
        const before=en.food; en.food=Math.floor(en.food*P.RAID_FOOD_LEFT); for(const u of en.units) if(!u.routed) u.org-=u.maxOrg*P.RAID_SHOCK; cav.org-=cav.maxOrg*0.2;
        ev.push({t:`夜袭敌粮仓得手，焚其积粟（敌存粮 ${before} → ${en.food} 日），敌军震动`,s:s.name,big:true,night:true}); }
      else if(cav){ const l=cav.men*P.RAID_LOSS; cav.men-=l; cav.dead+=l; cav.org=Math.min(cav.org,cav.maxOrg*0.3); en.raidsSeen=(en.raidsSeen||0)+1;
        ev.push({t:"劫粮之兵中伏，铩羽而归",s:s.name,big:true,night:true}); } }
    for(const s of [A,B]){
      if(s.plan==="SURRENDER"){ this.winner=this.other(s); this.endReason="开城投降"; this.surrender=s; ev.push({t:`第${this.day}日夜，城中${s.food<=0?"粮尽":"力竭"}，开城投降`,s:s.name,big:true,night:true}); this.finish(); return; }
      if(s.plan==="WITHDRAW"){ this.winner=this.other(s); this.nightRetreat=true; this.endReason=(this.mode==="围城"&&s===A)?"撤围":"撤退";
        ev.push({t:`第${this.day}日夜，${s.name==="A"?"甲":"乙"}军${this.endReason==="撤围"?"解围而去":"拔营撤退"}：${s.planReason}`,s:s.name,big:true,night:true}); this.finish(); return; } }
    // 无战术AI的一方沿用旧规则：战力不足对方一半者乘夜遁走
    const pa=A.power(), pb=B.power();
    const flee = (!A.aiPlanned&&!A.wall&&pa<P.NIGHT_RETREAT_RATIO*pb) ? A : ((!B.aiPlanned&&!B.wall&&pb<P.NIGHT_RETREAT_RATIO*pa) ? B : null);
    if(flee){ this.winner=this.other(flee); this.nightRetreat=true; this.endReason="夜遁"; ev.push({t:`第${this.day}日暮，${flee.name==="A"?"甲":"乙"}军自度不支，乘夜遁走`,s:flee.name,big:true,night:true}); this.finish(); return; }
    const info={};
    for(const s of [A,B]){
      const c=s.cmd/100; let rallied=0; const rest=s.plan==="REST"; let healed=0;
      if(s.food!=null){ s.food-=1; if(s.food<0){ s.food=0; s.starving++; } }
      const starve=s.food!=null&&s.food<=0;
      for(const u of s.units){
        if(u.routed){
          if(u.destroyed) continue;
          if(this.r()<P.NIGHT_RALLY*c){ u.routed=false; u.org=u.maxOrg*P.NIGHT_RALLY_ORG; const l=u.men*P.NIGHT_RALLY_LOSS; u.men-=l; u.fled+=l; u.stamina=Math.max(u.stamina,60); rallied++; }
          continue;
        }
        const back=(u.wounded||0)*(rest?P.HEAL_REST:P.HEAL_NIGHT)*(starve?0.3:1); const room=u.maxMen-u.men; const h=Math.min(back,room);
        u.men+=h; u.dead-=h; u.wounded-=h; healed+=h;
        u.org=Math.min(u.maxOrg,Math.max(0,u.org)+u.maxOrg*P.NIGHT_ORG*(0.6+0.4*c)*(rest?P.REST_ORG_MULT:1)*(starve?0.4:1));
        if(starve) u.org-=u.maxOrg*P.STARVE_ORG;
        u.stamina=Math.min(100,u.stamina+P.NIGHT_STAM*(rest?1.5:1)); u.charged=false; u.lastCharge=-99;
      }
      if(s.fortMax>0&&s.fort<s.fortMax) s.fort=Math.min(s.fortMax,s.fort+P.NIGHT_FORT_REPAIR*(rest?2:1));      // 连夜修垒
      if(s.plan==="FORTIFY") s.fort=Math.min(P.FORT_MAX,s.fort+P.FORT_BUILD_NIGHT);
      else if(!s.baseAttacker&&!s.wall&&!this.bothAtk&&this.stage!=="野战") s.fort=Math.min(P.FORT_MAX,s.fort+0.15);
      s.fortMax=Math.max(s.fortMax,s.fort);
      for(const u of s.engineUnits()) u.hp=Math.min(P.ENGINE_HP,u.hp+P.ENGINE_REPAIR_NIGHT*(s.plan==="SIEGEWORK"?2:1));
      if(s.plan==="SIEGEWORK") for(let k=0;k<P.ENGINE_BUILD_NIGHT;k++) s.buildEngine();
      if(s.wall) s.wall.F=0;                                   // 入夜登城者退下
      if(s.wall&&!starve) s.wall.W=Math.min(1,s.wall.W+P.WALL_REPAIR*(rest?2:1));
      info[s.name]={rallied,healed:Math.round(healed)};
    }
    // 出城突击：当日占优则焚毁敌攻城器械
    for(const s of [A,B]) if(s.wall&&rep[s.name].plan!=="FIGHT"&&this.daily.length&&this.daily[this.daily.length-1][s.name].exchange>1&&this.daily[this.daily.length-1][s.name].attack>=3){}
    for(const s of [A,B]){ const en=this.other(s); if(s.lastPlan==="SORTIE"&&rep[s.name].exchange>1&&en.engines>0){ const es=en.engineUnits(); en.destroyEngine(es.reduce((m,x)=>x.hp<m.hp?x:m,es[0])); ev.push({t:"出城突击得手，焚毁敌攻城器械一具",s:s.name,big:true}); } s.lastPlan=s.plan; }
    for(const s of [A,B]){ const hadGeneral=s.generalAlive; s.generalAlive=true; if(this.formHook) this.formHook(this,s); s.applyFormationShape(); s.refresh(); s.column=[]; s.deploy(s.units.filter(u=>!u.routed)); info[s.name].hadGeneral=hadGeneral; }
    this.applyWallWidth();
    if(this.stage==="野战"){ const quiet=rep.A.attack+rep.B.attack<P.DAY_ROUNDS*0.5; if(A.fort>=0.5||B.fort>=0.5||(quiet&&this.day>=1)){ this.stage="阵地战"; ev.push({t:"双方转入阵地相持，各自安营扎寨",s:"",night:true}); } }
    this.day++; this.dayStart=this.rnd; this.phase=this.bothAtk?1:(this.mode==="围城"?0:1);
    const pl=s=>this.planName(s.plan);
    ev.push({t:`日暮收兵。救回伤兵：甲 ${info.A.healed}、乙 ${info.B.healed}；收拢溃部：甲 ${info.A.rallied}、乙 ${info.B.rallied}。次日方略：甲${pl(A)}，乙${pl(B)}`,s:"",big:false,night:true});
    for(const k of ["A","B"]) if(!info[k].hadGeneral) ev.push({t:"主将收拢残部，重归中军",s:k});
    for(const s of [A,B]) if(s.food!=null&&s.food<=1) ev.push({t:s.food<=0?(s.wall?"城中粮尽，军心动摇":"军中粮尽，军心动摇"):(s.wall?"城中存粮仅余一日":"军粮仅余一日"),s:s.name,big:s.food<=0});
  }
  finish(){
    this.done=true;
    if(this.dayStats0!==false&&(!this.daily.length||this.daily[this.daily.length-1].day!==this.day)&&this.A.dayStats){ const rep=this.dayReport(); rep.final=true; for(const k of ["A","B"]) rep[k].plan="—"; }
    const markM=()=>{ for(const s of [this.A,this.B]){ const en=this.other(s); if(!s.missionDone&&s.mission.type==="destroy"&&en.supply0>0&&en.supplyBurnt()>=s.mission.goal) s.missionDone="success"; } };
    if(!this.winner){ markM(); return; }
    const w=this.winner, l=this.other(w);
    if(!this.retreatSide||this.retreatSide===l) for(const u of l.units) if(u.isSupply&&u.men>0&&(!this.retreatSide)){ u.dead+=u.men; u.men=0; u.captured=true; }   // 溃败一方的辎重尽为敌所焚掠
    if(l.supply0>0&&!this.retreatSide) this.events.push({t:"败军辎重尽为敌所焚掠",s:l.name,big:true});
    markM(); if(w.mission.type!=="destroy"&&(w.mission.type==="hold"||w.mission.type==="escort"||w.mission.type==="delay")&&!w.missionDone) w.missionDone="success";
    const pow=s=>s.units.reduce((a,u)=>a+((u.t.cav&&!u.routed)?(u.t.charge+u.t.soft)*u.strength*u.stamF*(u.t.skirmish?P.SKIRMISH_PURSUIT_POWER:1):0),0);
    const wp=pow(w), lp=pow(l);
    let frac=P.PURSUIT_BASE+Math.min(P.PURSUIT_MAX_EXTRA, wp*P.PURSUIT_K*10/Math.max(1,l.units.length));
    if(lp) frac*=Math.max(0.5,1-0.5*lp/(wp+lp+1e-9));
    if(this.nightRetreat) frac*=P.NIGHT_PURSUIT;
    if(this.retreatSide) frac*=P.RETREAT_PURSUIT;
    if(this.surrender){ for(const u of l.units){ u.fled+=u.men; u.men=0; } this.pursuit=1; return; }
    this.pursuit=frac;
    for(const u of l.units){ const loss=u.men*frac*((u.t.skirmish&&!u.routed)?P.SKIRMISH_PURSUIT_TAKEN:1); u.men-=loss; u.dead+=loss*(1-P.FLED_SHARE); u.fled+=loss*P.FLED_SHARE; }
  }
  run(){ while(!this.done) this.step(); return this.result(); }
  result(){
    const sm=s=>{ const cu=s.units.filter(u=>!u.isSupply); const init=cu.reduce((a,u)=>a+u.maxMen,0)||1; const types={};
      for(const n of UNIT_ORDER){ const us=s.units.filter(u=>u.name===n); if(us.length) types[n]=us.reduce((a,u)=>a+u.dead+u.fled,0)/Math.max(1,us.reduce((a,u)=>a+u.maxMen,0)); }
      return {loss:cu.reduce((a,u)=>a+u.dead+u.fled,0)/init, dead:cu.reduce((a,u)=>a+u.dead,0)/init, fled:cu.reduce((a,u)=>a+u.fled,0)/init, types, burnt:s.supplyBurnt(), mission:s.mission.type, missionDone:s.missionDone||null, withdrew:this.retreatSide===s}; };
    return {winner:this.winner?this.winner.name:"相持", rounds:this.rnd, day:this.day, night:this.nightRetreat, retreat:!!this.retreatSide, reason:this.endReason||(this.winner?"溃败":"期满对峙"), stage:this.stage, A:sm(this.A), B:sm(this.B)};
  }
}
