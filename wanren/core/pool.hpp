// 极简线程池：parallelFor(n, fn(begin,end,threadId))，主线程也参与
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
  void parallelFor(int count, const std::function<void(int, int, int)>& fn) {
    if (n_ == 1 || count < 2048) { fn(0, count, 0); return; }
    fn_ = &fn; count_ = count; pending_ = n_ - 1;
    { std::lock_guard<std::mutex> lk(m_); gen_++; }
    cv_.notify_all();
    run(0);
    std::unique_lock<std::mutex> lk(m_);
    done_.wait(lk, [this] { return pending_ == 0; });
  }
 private:
  void run(int t) { int chunk = (count_ + n_ - 1) / n_; int b = t * chunk, e = std::min(count_, b + chunk); if (b < e) (*fn_)(b, e, t); }
  void loop(int t) {
    unsigned long seen = 0;
    for (;;) {
      { std::unique_lock<std::mutex> lk(m_); cv_.wait(lk, [&] { return gen_ != seen; }); seen = gen_; if (quit_) return; }
      run(t);
      { std::lock_guard<std::mutex> lk(m_); if (--pending_ == 0) done_.notify_one(); }
    }
  }
  int n_; std::vector<std::thread> workers_;
  std::mutex m_; std::condition_variable cv_, done_;
  unsigned long gen_ = 0; bool quit_ = false; int pending_ = 0; int count_ = 0;
  const std::function<void(int, int, int)>* fn_ = nullptr;
};
