#include "params.hpp"
#include <fstream>
#include <sstream>
#include <cstring>

#define P(name) if (key == #name) { name = v; return true; }
bool Params::set(const std::string& key, float v) {
  P(dt) P(cellSize) P(worldW) P(worldH)
  P(walkFoot) P(runFoot) P(runFootArmored) P(walkHorse) P(chargeHorse) P(routFoot) P(routHorse)
  P(fileGap) P(rankGap) P(denseGap) P(looseGap) P(cavFileGap) P(cavRankGap)
  P(slotSpring) P(sepRadius) P(sepForce) P(slotTol)
  P(reachHalberd) P(reachSpear) P(reachSword) P(reachLance) P(reachCavSword)
  P(dmgHalberd) P(dmgSpear) P(dmgSword) P(dmgLance)
  P(cdHalberd) P(cdSpear) P(cdSword) P(cdLance) P(skillBase) P(hp) P(deadRatio)
  P(shieldArrow) P(shieldPierce)
  P(bowRange) P(bowMax) P(bowReload) P(bowDmg) P(bowHit)
  P(xbowRange) P(xbowMax) P(xbowReload) P(xbowDmg) P(xbowHit)
  P(hxbowRange) P(hxbowMax) P(hxbowReload) P(hxbowDmg) P(hxbowHit) P(hxbowArmorBreak)
  P(volleySpread) P(missileMinRange)
  P(cavImpactMul) P(cavFlankMul) P(cavBalkDist) P(cavBalkCohesion) P(cavBalkFacing) P(cavBalkMorale)
  P(cavFatigueCharge) P(horseArmorArrow)
  P(fatigueRun) P(fatigueFight) P(fatigueRest) P(fatigueMax)
  P(moraleInit) P(moraleInitElite) P(moraleThreshold) P(moraleThresholdElite)
  P(mDeathNear) P(mDeathSquad) P(mRoutNear) P(mRoutSquad) P(mFlank) P(mCavNear) P(mCavNearFloor) P(cavBalkFloor)
  P(mOfficerDown) P(mFlagDown) P(mSiblingBroken) P(mGeneralDown)
  P(mRecover) P(mRecoverCap) P(mCharge) P(mFatigueCap) P(rallyDist) P(rallyMorale)
  P(unitBrokenFrac) P(generalFleeFrac)
  P(hitFlank) P(hitRear) P(hitCohesionSelf) P(hitCohesionEnemy) P(hitRoutTarget) P(hitFatigue)
  P(waveGap) P(waveFileGap) P(waveRankGap) P(reserveFrac) P(reserveGap) P(waveStandoff) P(waveLaunchGap) P(waveReturnFrac) P(bowOverhead) P(bowAmmo) P(xbowAmmo) P(hxbowAmmo) P(haAmmo) P(stockadeCover) P(stockadeClimb) P(attackChargeDist) P(withdrawDist) P(slopeSpeed) P(uphillHit) P(downhillHit) P(hillStep) P(forestCover) P(forestImpact) P(heightRange) P(pushSpeed) P(pushRatio) P(centerPush) P(fightMorale) P(routNearPerTick) P(officerSuppress) P(trampleShaky) P(ambushShock) P(ambushShockCav) P(captureProb) P(gapMargin) P(gapSeconds) P(cavMeleeSeconds) P(cavDisengageDist) P(cavReformCohesion) P(cavReformMaxSeconds) P(cavPursueSeconds) P(haStandoff) P(haSwingOut) P(haMovingFire) P(haFleeDist) P(haReload) P(unitSpeedMul) P(contagionIdle) P(contagionCohesion) P(flagVisible) P(orderDelayMin) P(orderDelayMax) P(orderDelayRider) P(orderDelayBase) P(officerRadius)
  if (key == "xbowStagger") { xbowStagger = (int)v; return true; }
  if (key == "longRanks") { longRanks = (int)v; return true; }
  if (key == "guardMen") { guardMen = (int)v; return true; }
  if (key == "waveRanks") { waveRanks = (int)v; return true; }
  if (key == "waveCount") { waveCount = (int)v; return true; }
  if (key == "routNearCap") { routNearCap = (int)v; return true; }
  if (key == "shooterRanks") { shooterRanks = (int)v; return true; }
  if (key.rfind("armorPierce", 0) == 0 && key.size() == 12) { armorPierce[key[11]-'0'] = v; return true; }
  if (key.rfind("armorCut", 0) == 0 && key.size() == 9) { armorCut[key[8]-'0'] = v; return true; }
  if (key.rfind("armorArrow", 0) == 0 && key.size() == 11) { armorArrow[key[10]-'0'] = v; return true; }
  return false;
}
#undef P

bool Params::load(const std::string& path) {
  std::ifstream f(path);
  if (!f) return false;
  std::string line;
  while (std::getline(f, line)) {
    auto h = line.find('#'); if (h != std::string::npos) line = line.substr(0, h);
    auto eq = line.find('='); if (eq == std::string::npos) continue;
    std::string k = line.substr(0, eq), vs = line.substr(eq + 1);
    auto trim = [](std::string& s) { while (!s.empty() && isspace((unsigned char)s.back())) s.pop_back(); size_t i = 0; while (i < s.size() && isspace((unsigned char)s[i])) i++; s = s.substr(i); };
    trim(k); trim(vs);
    if (k.empty()) continue;
    set(k, (float)atof(vs.c_str()));
  }
  return true;
}
