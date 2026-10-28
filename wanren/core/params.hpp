// 万人阵 · 可调参数（考据见 docs/DESIGN.md，标「待核」者为推定值）
// 运行时可用 params.txt 覆盖：每行 "key = value"
#pragma once
#include <string>

struct Params {
  // —— 时间与空间 ——
  float dt = 0.1f;              // 一 tick 秒数
  float cellSize = 4.0f;        // 空间网格边长（米）
  float worldW = 3000.f, worldH = 3000.f;

  // —— 速度（米/秒） ——
  float walkFoot = 1.3f, runFoot = 2.5f, runFootArmored = 2.2f;
  float walkHorse = 4.0f, chargeHorse = 6.0f;  // 无镫，冲击上限 6 m/s（待核）
  float routFoot = 2.8f, routHorse = 7.0f;

  // —— 阵形间距 ——
  float fileGap = 1.0f, rankGap = 1.4f;        // 横 1 m，纵约汉制一步 1.38 m
  float denseGap = 0.8f, looseGap = 1.8f;
  float cavFileGap = 1.6f, cavRankGap = 2.6f;

  // —— 转向 ——
  float slotSpring = 4.0f;      // 追槽位的加速度系数
  float sepRadius = 0.9f, sepForce = 6.0f;
  float slotTol = 1.2f;         // 在槽位 1.2 m 内算「在阵」（凝聚统计）

  // —— 兵器触及（米）/ 基伤 / 攻击间隔（秒） ——
  float reachHalberd = 2.6f, reachSpear = 2.8f, reachSword = 1.0f, reachLance = 3.5f, reachCavSword = 1.4f;
  float dmgHalberd = 60.f, dmgSpear = 55.f, dmgSword = 45.f, dmgLance = 65.f;
  float cdHalberd = 1.6f, cdSpear = 1.6f, cdSword = 1.1f, cdLance = 1.8f;
  float skillBase = 0.12f;      // 每次攻击基础命中率
  float hp = 100.f;             // 耐力：累计伤害超过即倒下
  float deadRatio = 0.34f;      // 倒下者中阵亡比例（其余为伤，待核）

  // —— 甲（减伤比例）[等级][刺/砍/箭] ——
  float armorPierce[3] = {0.f, 0.30f, 0.55f};
  float armorCut[3]    = {0.f, 0.40f, 0.70f};
  float armorArrow[3]  = {0.f, 0.35f, 0.60f};
  float shieldArrow = 0.60f, shieldPierce = 0.30f;   // 刀盾兵正面

  // —— 远程 ——
  float bowRange = 80.f, bowMax = 150.f, bowReload = 6.f, bowDmg = 50.f, bowHit = 0.10f;
  float xbowRange = 120.f, xbowMax = 180.f, xbowReload = 12.f, xbowDmg = 70.f, xbowHit = 0.14f;
  float hxbowRange = 150.f, hxbowMax = 220.f, hxbowReload = 20.f, hxbowDmg = 95.f, hxbowHit = 0.16f;
  float hxbowArmorBreak = 0.5f;  // 蹶张强弩破甲：甲减伤打五折
  float volleySpread = 0.06f;    // 散布 σ = 距离 × 该值
  float missileMinRange = 15.f;  // 近身不射（改为持刀）

  // —— 骑兵 ——
  float cavImpactMul = 2.5f;      // 冲击首击伤害倍率
  float cavFlankMul = 2.5f;       // 对侧背 / 松动阵的士气打击倍率
  float cavBalkDist = 3.0f;       // 遇稳固长兵阵，马在此距离外勒住
  float cavBalkCohesion = 0.6f;   // 「稳固」的凝聚阈值
  float cavBalkFacing = 60.f;     // 「稳固」要求的朝向差（度）
  float cavBalkMorale = 0.15f;     // 徘徊时每 tick 士气损失
  float cavBalkFloor = 35.f;       // 徘徊只把士气压到此（马不肯前 → 退，不是溃）
  float cavFatigueCharge = 0.15f;  // 冲锋每 tick 疲劳
  float horseArmorArrow = 0.70f;  // 具装受箭减伤

  // —— 疲劳 ——
  float fatigueRun = 0.3f, fatigueFight = 0.08f, fatigueRest = 0.12f, fatigueMax = 100.f;

  // —— 士气 ——
  float moraleInit = 70.f, moraleInitElite = 85.f;
  float moraleThreshold = 25.f, moraleThresholdElite = 10.f;
  float mDeathNear = 5.f, mDeathSquad = 10.f;     // 身边 / 同伍什阵亡
  float mRoutNear = 3.f, mRoutSquad = 8.f;        // 身边 / 同伍什逃走
  float mFlank = 1.f, mCavNear = 0.05f, mCavNearFloor = 45.f;   // 侧后敌骑：缓慢压低士气，但不低于 floor             // 每 tick
  float mOfficerDown = 20.f, mFlagDown = 20.f;
  float mSiblingBroken = 15.f, mGeneralDown = 35.f;
  float mRecover = 0.3f, mRecoverCap = 80.f, mCharge = 10.f;
  float mFatigueCap = 0.4f;                        // 上限 = 100 − 疲劳×0.4
  float rallyDist = 150.f, rallyMorale = 40.f;
  float unitBrokenFrac = 0.5f;                     // 曲内逃走比例超过即「溃」
  float generalFleeFrac = 0.5f;                    // 全军溃曲比例超过主将走

  // —— 命中修正 ——
  float hitFlank = 1.3f, hitRear = 1.8f;
  float hitCohesionSelf = 0.3f, hitCohesionEnemy = 0.3f;
  float hitRoutTarget = 2.5f;                      // 砍溃兵
  float hitFatigue = 1.f / 300.f;

  // —— 指挥 ——
  float flagVisible = 300.f;     // 麾旗可视距离（待核）
  float orderDelayMin = 2.f, orderDelayMax = 4.f, orderDelayRider = 6.f, orderDelayBase = 4.f;
  float officerRadius = 15.f;    // 军候在此距离内士气可恢复
  float unitSpeedMul = 0.85f;    // 军团中心速度 = 士卒速度 × 此（士卒才追得上槽位）
  float contagionIdle = 0.5f;    // 未接敌的曲受溃散传染的折扣
  float contagionCohesion = 0.4f;// 凝聚每 1.0 减传染 40%

  // —— 骑兵用法（无镫：反复冲击，不恋战；骑射游射） ——
  float cavMeleeSeconds = 6.f;     // 冲击后在接战中停留的最长秒数，之后脱离
  float cavDisengageDist = 80.f;   // 脱离后退到多远整队
  float cavReformCohesion = 0.7f;  // 整队到此凝聚再冲
  float cavReformMaxSeconds = 20.f;
  float cavPursueSeconds = 30.f;   // 敌溃后追击秒数
  float haStandoff = 50.f;         // 骑射横掠时与敌阵的距离
  float haSwingOut = 90.f;         // 掠过后甩开的距离
  float haMovingFire = 0.7f;       // 移动射击命中倍率
  float haFleeDist = 25.f;         // 敌近此距离立即脱离
  float haReload = 5.f;            // 骑射装填（弓 6 s，马上略快是因为不列队齐射）
  int shooterRanks = 3;            // 方阵 / 数阵 / 疏阵只有前几排能射；横列、雁行全射

  // —— 阵形效果 —— 速度 / 转向 / 受箭 / 骑兵勒马所需凝聚 / 冲击倍率 / 全向（无侧背）
  struct FormMod { float speed, turn, missileTaken, balkCoh, impact; bool allRound, allShoot; };
  FormMod form[8] = {
    {1.00f, 1.0f, 1.0f, 0.60f, 1.0f, false, false},   // 方阵：均衡
    {0.90f, 0.9f, 1.3f, 0.50f, 1.0f, false, false},   // 数阵：密集，抗骑冲，更吃箭，慢
    {1.05f, 1.1f, 0.6f, 0.90f, 1.0f, false, false},   // 疏阵：少吃箭，挡不住骑兵
    {0.50f, 1.0f, 1.0f, 0.55f, 1.0f, true,  false},   // 圆阵：无侧背，几乎不能动
    {1.00f, 1.0f, 1.1f, 0.70f, 1.3f, false, false},   // 锥形：冲击加成
    {1.00f, 1.0f, 0.9f, 0.75f, 1.0f, false, true },   // 雁行：全员可射，便于交叉射
    {1.00f, 0.8f, 1.0f, 0.70f, 1.0f, false, true },   // 横列：全员可射，正面最宽，薄
    {1.15f, 2.0f, 1.2f, 0.95f, 1.0f, false, false},   // 纵队：行军快，不能战
  };

  bool load(const std::string& path);   // 读 key = value，缺省保留
  bool set(const std::string& key, float v);
};
