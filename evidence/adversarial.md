# WhyTrace — adversarial planted-claim evaluation (2026-10-23T00:30:07.305Z)

Deterministic. For each of case-001, case-002, case-003 we take the latest recorded report, build 7 plants per category from values drawn out of the real fixture (neighbouring /24 IPs, real-count ±1 and ±10 %, time shifts of 5–90 min, real KEV CVEs for unrelated products, real other-UPN event ids, plausible-but-unsupported narratives), and run the plants through the Critic + validateReport() without a model.

**Headline: 126/126 planted false claims were caught (100.0%).**

| category | total | caught by validator | caught by critic | missed |
|---|---|---|---|---|
| wrong_ip | 21 | 0 | 21 | 0 |
| wrong_count | 21 | 0 | 21 | 0 |
| wrong_time | 21 | 0 | 21 | 0 |
| invented_cve | 21 | 0 | 21 | 0 |
| wrong_user | 21 | 0 | 21 | 0 |
| unsupported_causal | 21 | 21 | 0 | 0 |

## Example rejections and misses

### case-001

- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 185.220.101.16 (parent /24=185.220.101; real attacker IP 185.220.101.7); critic/validator said: critic: 185.220.101.16 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.70 (parent /24=193.140.10; real attacker IP 185.220.101.7); critic/validator said: critic: 193.140.10.70 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 185.220.101.28 (parent /24=185.220.101; real attacker IP 185.220.101.7); critic/validator said: critic: 185.220.101.28 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 45.142.10.9 (parent /24=45.142.10; real attacker IP 185.220.101.7); critic/validator said: critic: 45.142.10.9 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 185.220.101.19 (parent /24=185.220.101; real attacker IP 185.220.101.7); critic/validator said: critic: 185.220.101.19 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.50 (parent /24=193.140.10; real attacker IP 185.220.101.7); critic/validator said: critic: 193.140.10.50 does not show a spray-then-success pattern on re-query

### case-002

- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.57 (parent /24=193.140.10; real attacker IP 193.140.10.44); critic/validator said: critic: 193.140.10.57 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 88.230.1.1 (parent /24=88.230.1; real attacker IP 193.140.10.44); critic/validator said: critic: 88.230.1.1 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.51 (parent /24=193.140.10; real attacker IP 193.140.10.44); critic/validator said: critic: 193.140.10.51 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.70 (parent /24=193.140.10; real attacker IP 193.140.10.44); critic/validator said: critic: 193.140.10.70 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.59 (parent /24=193.140.10; real attacker IP 193.140.10.44); critic/validator said: critic: 193.140.10.59 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.51 (parent /24=193.140.10; real attacker IP 193.140.10.44); critic/validator said: critic: 193.140.10.51 does not show a spray-then-success pattern on re-query

### case-003

- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.65 (parent /24=193.140.10; real attacker IP 193.140.10.44); critic/validator said: critic: 193.140.10.65 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 91.240.118.5 (parent /24=91.240.118; real attacker IP 193.140.10.44); critic/validator said: critic: 91.240.118.5 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.61 (parent /24=193.140.10; real attacker IP 193.140.10.44); critic/validator said: critic: 193.140.10.61 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 185.100.87.202 (parent /24=185.100.87; real attacker IP 193.140.10.44); critic/validator said: critic: 185.100.87.202 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 193.140.10.57 (parent /24=193.140.10; real attacker IP 193.140.10.44); critic/validator said: critic: 193.140.10.57 does not show a spray-then-success pattern on re-query
- **wrong_ip** → caught by critic: wrong_ip near-miss: claim cites 89.180.44.17 (parent /24=89.180.44; real attacker IP 193.140.10.44); critic/validator said: critic: 89.180.44.17 does not show a spray-then-success pattern on re-query
