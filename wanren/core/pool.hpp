// 线程池：parallelBlocks(nBlocks, fn(block))，块由各线程用原子计数器动态领取（负载均衡），
// 所有输出按块编号存放，因此结果与线程数无关、可复现
#pragma once
#include <thread>
#include <vector>
#include <functional>
#include <mutex>
#include <condition_variable>
#include <atomic>

class Pool {
 public:
  explicit Pool(int n) : n_(n < 1 ? 1 : n) {
    for (int t = 1; t < n_; t++) workers_.emplace_back([this, t] { loop(t); });
  }
  ~Pool() { { std::lock_guard<std::mutex> lk(m_); quit_ = true; gen_++; } cv_.notify_all(); for (auto& w : workers_) w.join(); }
  int threads() const { return n_; }
  void parallelBlocks(int nBlocks, const std::function<void(int)>& fn) {
    if (nBlocks <= 0) return;
    if (n_ == 1 || nBlocks < 2) { for (int b = 0; b < nBlocks; b++) fn(b); return; }
    fn_ = &fn; nBlocks_ = nBlocks; next_.store(0); pending_ = n_ - 1;
    { std::lock_guard<std::mutex> lk(m_); gen_++; }
    cv_.notify_all();
    run();
    std::unique_lock<std::mutex> lk(m_);
    done_.wait(lk, [this] { return pending_ == 0; });
  }
 private:
  void run() { for (;;) { int b = next_.fetch_add(1); if (b >= nBlocks_) return; (*fn_)(b); } }
  void loop(int) {
    unsigned long seen = 0;
    for (;;) {
      { std::unique_lock<std::mutex> lk(m_); cv_.wait(lk, [&] { return gen_ != seen; }); seen = gen_; if (quit_) return; }
      run();
      { std::lock_guard<std::mutex> lk(m_); if (--pending_ == 0) done_.notify_one(); }
    }
  }
  int n_; std::vector<std::thread> workers_;
  std::mutex m_; std::condition_variable cv_, done_;
  unsigned long gen_ = 0; bool quit_ = false; int pending_ = 0; int nBlocks_ = 0;
  std::atomic<int> next_{0};
  const std::function<void(int)>* fn_ = nullptr;
};
