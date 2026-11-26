# Raw streaming protocol repair
- [x] Inspect parser and downstream consumers; classify supplied serial output as summaries, not raw samples.
- [x] Provide a complete ESP32 streaming sketch and matching microsecond/g/one-based protocol without changing layout.
- [x] Test configured parsing, per-sensor updates, recording ownership and downstream analysis using simulated serial input (61 tests; browser recorded/saved/reopened 768 samples, visited all seven requested screens, and verified sketch download).
- [ ] Flash and verify against physical hardware (blocked: original sketch, wiring confirmation and device access unavailable).