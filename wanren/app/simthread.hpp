// 模拟线程：拥有 Sim，按档位节奏跑 tick；渲染线程只读快照（shared_ptr 池，无拷贝竞争）；命令经队列进入
#pragma once
#include "../core/sim.hpp"
#include "../core/ai.hpp"
#include "../core/scenario.hpp"
#include <thread>
#include <mutex>
#include <atomic>
#include <memory>
#include <vector>
#include <string>
#include <chrono>

struct UnitView {
  int id; uint8_t side, kind, formation, stance; bool elite, officerAlive, flagAlive, broken, ordersPending;
  float cx, cy, fx, fy, gx, gy, cohesion, moraleAvg, fatigue; int alive, dead, wounded, routed; uint8_t cavPhase; int cycles;
  int part; int captured; uint8_t pendType; float pendX, pendY; int pendTicks; int attackTarget; float hx, hy;
};
struct Snapshot {
  int generation = 0, tick = 0; float time = 0; double stepMs = 0; double actualSpeed = 0;
  std::vector<float> x, y; std::vector<uint8_t> side, state, kind, flags; std::vector<int32_t> unit;
  std::vector<UnitView> units; Side sides[2]; std::vector<Event> events; std::vector<Shot> shots;
  bool ended = false; int winner = -1; int threads = 1; size_t nSoldiers = 0;
  std::shared_ptr<const Terrain> terrain;   // 载入时拷一份，各快照共享
};

struct Cmd { enum Type { ORDER, RESET, TOGGLE_AI } type; int unit = 0; Order order{O_HALT}; int scenario = 0; uint32_t seed = 1; int player = 0; };

class SimThread {
 public:
  static constexpr float SPEEDS[] = {0.5f, 1.f, 2.f, 4.f, 8.f, 16.f, 32.f, 0.f};   // 0 = 最快（不限速）
  static constexpr int NSPEED = 8;
  std::atomic<int> speedIdx{1}; std::atomic<bool> paused{false}; std::atomic<int> stepOnce{0};
  std::atomic<int> jump{0};   // 1 = 最快跑到下一事件（接敌 / 齐射 / 溃 / 纪事）后自动回 ×1
  std::vector<std::string> unitNames; std::string title;   // 不随 tick 变，载入时取一次
  int player = 0;

  ~SimThread() { stop(); }
  void start() { running_ = true; th_ = std::thread([this] { loop(); }); }
  void stop() { running_ = false; if (th_.joinable()) th_.join(); }
  void push(const Cmd& c) { std::lock_guard<std::mutex> lk(cm_); cmds_.push_back(c); }
  std::shared_ptr<const Snapshot> latest() { std::lock_guard<std::mutex> lk(sm_); return latest_; }
  // 无线程用法（截图模式）：直接驱动
  void loadNow(int scenario, uint32_t seed, int player_) { load(scenario, seed, player_); }
  void tickNow() { tick(); }
  std::shared_ptr<const Snapshot> snapshotNow() { publish(true); return latest(); }
  Sim* simNow() { return sim_.get(); }

 private:
  std::unique_ptr<Sim> sim_; int generation_ = 0; std::shared_ptr<const Terrain> terrain_; bool ended_ = false; int winner_ = -1;
  std::thread th_; std::atomic<bool> running_{false};
  std::mutex cm_; std::vector<Cmd> cmds_;
  std::mutex sm_; std::shared_ptr<Snapshot> latest_; std::vector<std::shared_ptr<Snapshot>> pool_;
  std::chrono::steady_clock::time_point lastPublish_{}; int tickWindow_ = 0; std::chrono::steady_clock::time_point windowStart_{}; double actual_ = 0;

  void load(int scenario, uint32_t seed, int player_) {
    player = player_;
    sim_ = std::make_unique<Sim>(seed, 0); sim_->w.P.load("params.txt");
    ScenarioDef def = scenarios()[scenario]; def.aiSide[player] = false; def.aiSide[1 - player] = true;
    loadScenario(*sim_, def);
    unitNames.clear(); for (auto& u : sim_->w.units) unitNames.push_back(u.name); title = def.title;
    terrain_ = std::make_shared<const Terrain>(sim_->w.terrain);
    generation_++; ended_ = false; winner_ = -1; tickWindow_ = 0; actual_ = 0;
    publish(true);
  }
  void tick() {
    for (int sd = 0; sd < 2; sd++) if (sim_->w.sides[sd].ai) aiStep(*sim_, sd);
    sim_->step();
    if (!ended_ && sim_->over(winner_)) { ended_ = true; sim_->log(winner_ >= 0 ? sim_->w.sides[winner_].name + "胜" : "罢兵"); }
  }
  void publish(bool force) {
    auto now = std::chrono::steady_clock::now();
    if (!force && std::chrono::duration<double>(now - lastPublish_).count() < 1.0 / 60.0) return;
    lastPublish_ = now;
    std::shared_ptr<Snapshot> sn;
    { std::lock_guard<std::mutex> lk(sm_); for (auto& p : pool_) if (p.use_count() == 1 && p != latest_) { sn = p; break; } }
    if (!sn) { if (pool_.size() < 6) { sn = std::make_shared<Snapshot>(); pool_.push_back(sn); } else return; }
    const auto& s = sim_->w.s;
    sn->generation = generation_; sn->tick = sim_->w.tick; sn->time = sim_->w.time(); sn->stepMs = sim_->lastStepMs; sn->actualSpeed = actual_;
    sn->x = s.x; sn->y = s.y; sn->side = s.side; sn->state = s.state; sn->kind = s.kind; sn->flags = s.flags; sn->unit = s.unit;
    sn->units.resize(sim_->w.units.size());
    for (size_t i = 0; i < sim_->w.units.size(); i++) { const Unit& u = sim_->w.units[i]; sn->units[i] = {u.id, u.side, u.kind, u.formation, u.stance, u.elite, u.officerAlive, u.flagAlive, u.broken, !u.orders.empty(), u.cx, u.cy, u.fx, u.fy, u.gx, u.gy, u.cohesion, u.moraleAvg, sim_->unitFatigue[u.id], u.alive, u.dead, u.wounded, u.routed, u.cavPhase, u.cycles, u.part, u.captured, (uint8_t)(u.orders.empty() ? 255 : u.orders.front().type), u.orders.empty() ? 0.f : u.orders.front().x, u.orders.empty() ? 0.f : u.orders.front().y, u.orders.empty() ? 0 : u.orders.front().execTick - sim_->w.tick, u.attackTarget, u.hx, u.hy}; }
    sn->sides[0] = sim_->w.sides[0]; sn->sides[1] = sim_->w.sides[1];
    const auto& ev = sim_->w.events; size_t ne = std::min<size_t>(14, ev.size()); sn->events.assign(ev.end() - ne, ev.end());
    sn->shots = sim_->shots; sn->terrain = terrain_; sn->ended = ended_; sn->winner = winner_; sn->threads = sim_->pool->threads(); sn->nSoldiers = s.size();
    { std::lock_guard<std::mutex> lk(sm_); latest_ = sn; }
  }
  void loop() {
    using clk = std::chrono::steady_clock;
    auto next = clk::now(); windowStart_ = next;
    while (running_) {
      std::vector<Cmd> cmds; { std::lock_guard<std::mutex> lk(cm_); cmds.swap(cmds_); }
      for (const Cmd& c : cmds) {
        if (c.type == Cmd::RESET) { load(c.scenario, c.seed, c.player); next = clk::now(); }
        else if (!sim_) continue;
        else if (c.type == Cmd::ORDER) sim_->issue(c.unit, c.order);
        else if (c.type == Cmd::TOGGLE_AI) sim_->w.sides[player].ai = !sim_->w.sides[player].ai;
      }
      if (!sim_) { std::this_thread::sleep_for(std::chrono::milliseconds(5)); continue; }
      bool single = stepOnce.exchange(0) > 0;
      if ((paused || ended_) && !single) { publish(false); next = clk::now(); std::this_thread::sleep_for(std::chrono::milliseconds(5)); continue; }
      float sp = jump.load() ? 0.f : SPEEDS[speedIdx.load()];
      if (sp > 0 && !single) {
        double period = sim_->w.P.dt / sp;
        next += std::chrono::duration_cast<clk::duration>(std::chrono::duration<double>(period));
        auto now = clk::now();
        if (next > now) std::this_thread::sleep_until(next);
        else if (std::chrono::duration<double>(now - next).count() > 0.5) next = now;   // 跟不上：丢弃积欠，不再追
      }
      size_t evBefore = sim_->w.events.size(); int engBefore = 0; for (auto& u : sim_->w.units) if (u.lastEngagedTick == sim_->w.tick) engBefore++;
      tick();
      if (jump.load()) {
        bool hit = sim_->w.events.size() != evBefore || ended_;
        if (!hit) for (auto& u : sim_->w.units) if (u.lastEngagedTick == sim_->w.tick && engBefore == 0) { hit = true; break; }
        if (hit) { jump = 0; speedIdx = 1; }
      }
      tickWindow_++;
      auto now2 = clk::now(); double win = std::chrono::duration<double>(now2 - windowStart_).count();
      if (win >= 0.5) { actual_ = tickWindow_ * sim_->w.P.dt / win; tickWindow_ = 0; windowStart_ = now2; }
      publish(single);
    }
  }
};
