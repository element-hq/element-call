# Load Test Summary

Both runs are ~25 min apart, same room/fleet on `matrix.goldstar.element.dev`. They differ in exactly one variable: `key_rotation_participant_limit` (30 vs 250), swept over device counts 15/120/210.

The media distribution itself with element call can scale to 200 participants.
It is the post-compromising and forward-secrecy encryption key sharing, that slows down joins and leaves in large calls.

We measure two cases:
 - **full key rotation**:  post-compromising and forward-secrecy.
 - **only sharing keys to new joiners**: comparable with a shared secret call (like the SPA) -> post-compromising and forward-secrecy.

 > **only sharing keys to new joiners**
 > This is a new approach we implemented and is fully compatible (easy to role out)
 > in the context of the load tests. PRs are in review. Can land soon if desired.

With a full key rotation (210 participants) we end up with a join time in the minute range (0.5-5 min until we have settled with all participants)

By only sharing keys (210 participants) to new joiners (no full rotation) we end up with a join time in the two digit second range (5-30s until we have settled with all participants)

A join with rotation enabled results in ~N^2 to-device messages. A join with key rotation disabled reults in 2*(N-1) to-device messages (22B pro to-device).

On Firefox we also run into multiple reconnect screens.

## Key exchange comparison
Here is a summary of the direct comparison:
(🔄 marks runs which use full key rotations)
| devices | run A — limit 30 (13:01) | run B — limit 250 (13:27) |
|---|---|---|
| 15 |🔄 **3.18s** |🔄 **14.89s** ⚠️ (fleet never converged — joined against 70 memberships) |
| 120 | **9.96s** |🔄 **16.12s** |
| 210 | **16.98s** |🔄 **never completed** (gave up at 420s; 203/210 received, 204/210 sent.) (Successful previous runs 25.99s & 35.92s)|

The tests need to be taken very carefully.
Ther are multiple factors that make the reproducablilty hard: the scale to 210 devices and back down (15 devices) is very expensive and slow and can "leak" into follow up tests. Network load on the AWS machine and also the initial state has a big impact and the tests can run into timeouts and invalid runs.

Test appraoch:
 - scale up the call
 - join with a playwright tester (EW)
 - observe how long it takes to get all the keys from the load_testers
    - this part is interesting as there is a very large amount of traffic happening behind the screnes. Each device in the load tester will also send a to-device message to each other device. This is the real test and of course very dependent on how fast our infrastructure is. In the playwright test we can only observer the side effects from the high load on the HS and the load_test bot machine.
  - We simulate 200 devices on a 32 core AWS EC2 machine.

Despite the large fluctuation we present the actual results from a test:

| rotation limit | devices | **all keys** | received from | first received | all received | sent to | first sent | all sent |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 |  15 | **3.18s** | 15/15 | 3.17s | 3.18s | 15/15 | 2.40s | 2.40s |
| 30 |  120 | **9.96s** | 120/120 | 5.82s | 9.96s | 120/120 | 5.31s | 5.31s |
| 30 |  210 | **16.98s** | 210/210 | 5.92s | 16.98s | 210/210 | 5.45s | 5.45s |

| rotation limit | devices | **all keys** | received from | first received | all received | sent to | first sent | all sent |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 250 | 15 | **14.89s** | 51/15 | 13.30s | 14.89s | 69/15 | 10.59s | 10.59s |
| 250 | 120 | **16.12s** | 120/120 | 2.64s | 16.12s | 120/120 | 1.91s | 1.91s |
| 250 | 210 | **—** | 203/210 | 3.40s | — | 204/210 | 2.81s | — |


We also show the cpu/memory usage. This is mostly telling us how much resources are required for a call of different sizes. It does not really help in comparing the key sharing approaches. (from the point of view of one client, the joining client there is also not more load with or without the rotation. As a joiner we will always send and receive N to-device messages.)

| rotation limit | device_count | window | held | samples | CPU avg | CPU peak | CPU avg (of machine) | browser RSS avg | browser RSS peak | EC JS heap peak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 | 15 | 33.44s | 30.27s | 33 | 66.4% | 98.1% | 6.6% | 1703 MiB | 1755.7 MiB | 77.2 MiB |
| 30 | 120 | 40.17s | 30.21s | 39 | 121% | 251.7% | 12.1% | 2653.8 MiB | 2937.8 MiB | 165.7 MiB |
| 30 | 210 | 47.21s | 30.23s | 45 | 150.6% | 252.6% | 15.1% | 2968.1 MiB | 3183 MiB | 302.7 MiB |

| rotation limit | device_count | window | held | samples | CPU avg | CPU peak | CPU avg (of machine) | browser RSS avg | browser RSS peak | EC JS heap peak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 250 | 15 | 45.23s | 30.34s | 44 | 51.7% | 187.6% | 5.2% | 1641.2 MiB | 1693.6 MiB | 109.7 MiB |
| 250 | 120 | 46.29s | 30.17s | 45 | 90.9% | 169.6% | 9.1% | 1996.5 MiB | 2043.8 MiB | 185.2 MiB |
| 250 | 210 | 450.56s | 0.00s | 427 | 147.4% | 301.4% | 14.7% | 3080.5 MiB | 3417.6 MiB | 374.7 MiB |
