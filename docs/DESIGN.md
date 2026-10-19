# 系统与规则说明

数值均可在页面中调：战斗规则在「编辑器 → 规则」，战术在「编辑器 → 战术」，战役参数（`CP`）在「编辑器 → 战役编辑 → 战役参数」。下文给出默认值。

## 1. 战斗层（round_engine.js / tactics.js）

- **双轨伤害**：兵力（men）与组织度（org）。组织度归零即溃；溃散有传染（CONTAGION）。
- **兵种**：刀盾、长枪、弓、强弩、轻骑、重骑、器械（攻城，可被摧毁与消耗）、辎重（粮垛 / 运粮车，焚粮的目标）。
- **会战模式**：攻守、决战、遭遇、阵地、围城。
  - 只有器械能伤城墙；登城后才有白刃战。
  - 守方可架盾网，回合末修补工事。
- **主将**：位置（前 / 中 / 后）、统帅、智略、性格（均衡 / 进取 / 谨慎 / 诡诈）。智略决定能否使用佯退、激怒、诱敌出城等计谋。
- **状态（STATUS）**：每个状态同时可改己方与敌方的乘数（攻、防、组织损伤、射击、冲击、恢复、计谋……）。天气与任务也以状态形式施加。
- **任务**：rout / destroy（焚粮）/ hold（坚守 N 回合）/ delay / escort。达成目标即可撤出，不必恋战。
- **时段**（v0.21，与战役共用 `PERIODS`）：战斗自开战时段（`spec.startPh`，默认清晨；旧战例的 `night:true` 即前半夜）逐段推进。
  - 每段回合：清晨、上午、下午各 `PH_ROUNDS_DAY`（4），傍晚 `PH_ROUNDS_DUSK`（3），夜间每段 `PH_ROUNDS_NIGHT`（5）。白天合计 15 回合。
  - 傍晚终了议事（原「夜议」）：定次日方略；可撤退、投降、夜遁；若有一方选「夜战续攻」（敌阵动摇、我占上风、主将好险多谋时才会选），则不解甲，打进前半夜、后半夜，至晓只略作休整；否则收兵过夜（救治、修垒、造械），次日清晨再战。
  - 夜间时段自动带「夜战」状态；`spec.night` 且白天开战 → 首个时段按夜战论（拂晓奇袭）。
  - 收兵时段 `spec.endPh`：末日（`days`）白天开打到傍晚，夜间开打到清晨；夜战续攻则到后半夜终了。
  - `battle.periodsUsed`：实占时段数，战役据此精确确定参战军团何时可再行动，跨日之战次日不再另开一战。
- **随机**：`new Battle(spec, seed)`，同种子同规格结果一致；`spec.luckBias` 供历史模式偏置战运。

## 2. 战役层（campaign.js）

- **地图**：据点（城 / 营垒 / 粮屯 / 渡口 / 道路），属性包括地形、林木 `cover:"林"`、营垒 `fort`、城墙 `wall`、粮仓 `depot.food`。道路以行军日数计。
- **补给**：
  - 军团在 `SUPPLY_RANGE`（3 日）内且路上无敌，才能从己方粮仓就食；随军粮上限 `FOOD_CAP_DAYS`。
  - 运粮队往返运粮。
  - 断粮会逐日掉组织、减员，满 `STARVE_COLLAPSE` 日全军溃散。
- **交战**：同一据点出现两军即成交战。
  - 守方据城垒时，攻方可「对垒不战」。
  - 交战可由玩家亲自指挥（转入战场），也可速决。
- **烧粮仓 vs 截粮**：
  - **烧粮仓**（屯粮被焚）：一次焚毁超过 `BURN_TRIGGER`（30%），全军军心大震。
    - 严重度 = `BURN_SEV_BASE` + 焚粮占全军存粮之比 × `BURN_SEV_SHARE`。
    - 组织打击 = `BURN_ORG` × 严重度；不就食于该仓的军团打折 `BURN_FAR`。
    - 之后 `SHAKEN_DAYS` 日军心动摇：组织上限 `SHAKEN_CAP`，夜间恢复减 `SHAKEN_REC`。
  - **截粮**（截运粮队）：主要伤粮；一次截下过半才小挫组织 `CUT_ORG`。
- **火攻营寨**：
  - 火势 = `FIRE_BASE` × 天时（大风 1.6、酷暑 1.4、晴 1、雾 0.7、雪 0.2、雨 0）× 地物（林木 1.5、营寨 1、有城墙 0.4）× (0.6 + 主将智略/250)。
  - 被焚营寨损组织 `FIRE_ORG`、伤亡 `FIRE_MEN`、营垒 `FIRE_FORT`（均乘火势）。
  - 以 `FIRE_SPREAD` × 火势的概率蔓延到 1 日内相连的己方营寨，每蔓延一营火势 ×0.75。
  - 连焚 `FIRE_SHOCK_CAMPS` 营，全军大震。
- **天气**：按季节表抽取，`WX_PERSIST` 概率延续前一日。有纪年的剧本，季节随日期推移。

- **时段**（v0.20）：一日分六时段——后半夜（00–04）、清晨（04–08）、上午（08–12）、下午（12–16）、傍晚（16–20）、前半夜（20–24）。
  - 行军：普通军团走清晨、上午、下午三段，每段走 1/3 日路程；截粮、火攻夜行（前半夜、后半夜、清晨），且「从间道出」，路上不与敌相遇。每日路程与旧版相同。
  - 接敌：一地一日至多一战。相持之地每日清晨接战（或对垒）；新到之军在上午以前（`LATE_ENGAGE_PH`）、奇袭或途中遭遇当即开战，过午则隔营相望、次日清晨再战。
  - 战斗回合按开战时段折算到日暮：清晨 15、上午 11、下午 8、傍晚 4；夜战 `NIGHT_ROUNDS`。交战占去相应时段，期间参战军团不行军。
  - 粮草、断粮、夜间恢复、天气、任务进度（阻击日数等）、胜负仍按日结算（第六时段终了）。
  - 战略 AI 每日后半夜议定；当日若出现「敌情」（敌军进入己方据点或军团 `NEAR_DAYS` 日内）或粮仓、运粮被袭，次一时段临时重议一次。
  - 事件（界面暂停条件）：接敌、粮仓/运粮被袭、军团抵达、敌军进入视野、军心动摇、史实之机。
  - 每时段记录态势（`frames`），供报告逐时段回放；未处理的交战随存档保存。
  - 旧接口 `beginDay` / `endDay` 仍可用：前者推进到首次交战或日终，后者走完当日余下时段（其后交战速决）。

## 3. 战略 AI（StrategicAI）

每日为 AI 方出谋，玩家方显示为「谋士献策」。

| 能力 | 由什么决定 |
|---|---|
| 视野、敌情估计误差 | 智略（`STRAT_VISION`、`STRAT_NOISE`） |
| 能否想到截粮 | 智略 ≥ `RAID_INT`（50） |
| 能否预设防备、择天时 | 智略 ≥ `FORESIGHT_INT`（70） |
| 能否探知敌粮 | 智略 ≥ `SPY_INT`（75） |
| 能否谋划火攻 | 智略 ≥ `FIRE_INT`（80）；智略 ≥70 时必待酷暑、大风 |
| 告急时是否误判而「围魏救赵」 | 智略 < `COUNTER_INT`（60） |
| 每日是否迟疑不决 | 统帅（`STRAT_LAG`） |
| 同时展开几路行动 | 统帅 |
| 强攻城垒所需兵力比 | 统帅、性格（`ASSAULT_RATIO`） |

方略种类：
- 援救、围魏救赵、奇袭粮仓、截击运粮、预设防备、火攻营寨；
- 乘乱击之（敌军心动摇时）、进逼强攻（进取型主帅）；
- 退兵：粮尽、敌众，或己方军心动摇时按统帅高低议退。

**留守要地**：敌方胜负条件要夺的己方据点，若敌两日内可至，必留一军驻守。

## 4. 历史模式

- **随机种子**：同种子、同设置 → 同一场推演（玩家操作不同则不同）。
- **史实倾向**：每个锚点在条件满足时，以「倾向 × 权重」的概率发生。
- **锚点类型**（`history.anchors`）：

| 类型 | 字段 | 作用 |
|---|---|---|
| `posture` | side, until, noRaid, assaultMul | 相持期：不出奇兵、强攻意愿打折 |
| `weather` | day, value | 指定某日天气 |
| `intel` | side, day, bonus | 尽知敌情（如许攸来奔），袭粮成功率提升 |
| `order` | army, mission, target, day 或 trigger, holdOthers | 史实军令；玩家方显示为「史实之机」 |
| `decision` | side, node, choose | 告急时选 counter / relieve |
| `luck` | side, node, day, value | 该地交战的战运偏置 |
| `defect` | army, to（`"none"` = 降他国离场）, joinAt, trigger | 倒戈 |
| `morale` | side, trigger, org, desert | 军心打击 |

- **触发器**：`depotLost:节点:比例`、`fire:节点`、`day:N`。
- **史实结局**（`history.outcomes[].check`）：`depotBelow`、`defected`、`nodeOwner`、`winner`、`fired`。据此计算史实吻合度。
- **报告**：史书体按纪年编月，「史臣曰」根据实际战况生成评论，并列出与史书不合之处。

## 5. 剧本格式（摘要）

```js
{ name, season, dynamicSeason?, calendar:{startDate:{year,month,day},dayScale},
  sides:{A:{name,short,lord:{name,cmd,int,persona}}, B:{…}},
  map:{rivers:[{d:"SVG path",label,lx,ly}]}, desc,
  nodes:{id:{name,x,y,type,terrain,cover?,owner,fort?,wall?,depot?:{food}}},
  edges:[[a,b,日数]],
  armies:[{id,side,name,gen:{name,cmd,int,persona,genPos,formation},at,home,ai,planTarget?,retreatHome?,convoyTo?,cargo?,
           roster:{兵种:部数},mission:{type,target?,retreatAt},food}],
  maxDays, victory:[{side,type:"nodeOwner"|"armyAt"|"armyGone",node?,army?,owner?,text}],
  history?:{anchors:[…],outcomes:[…]} }
```

`ai` 角色：`main` 主力 / `reserve` 预备 / `raider` 奇兵 / `garrison` 守备 / `convoy` 运粮。
