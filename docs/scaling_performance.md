## Matrix RTC (Element Call) scaling

Scaling of video conferences depends on numerous factors:

- SFU performance
- home server performance
- network of backend components
- network of participating devices
- individual devices
- media quality/media usage
- speaker fluctuation
- particpant fluctuation

It is therefore not possible to give a single **maximum number of devices in a call**.

We still will give approximations (with high uncertainty) to allow evaluating if matrixRTC is the right tool.

### In a nutshell

- With the current (20. August 2026) encryption system (simple and provide forward secrecy + post compromising secrecy) 30 users work well. 50 users will end up with degrading perfromance on joins/leaves.
- With per sender encryption but without forward secrecy + post compromising secrecy 200 users are possible.
- The actual media is based on livekit. Which can (without cascading) scale up to 1000 users. In unencrypted rooms and shared secret and a well optimised system this number should be reachable (untested so far)

The first two claims have been tested via Elements test suite.
The results can be found here: [Load Test Summary](/docs/load_test_summary.md)
