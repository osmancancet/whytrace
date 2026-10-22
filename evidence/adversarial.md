# WhyTrace — adversarial planted-claim evaluation (2026-10-22T20:38:04.729Z)

Deterministic test. Takes the latest recorded report for each of case-001, case-002, case-003, injects 7 false findings per category per case, and runs them through the Critic + validateReport() without a model.

**Headline: 126/126 planted false claims were caught (100.0%).**

| category | total | caught by validator | caught by critic | missed |
|---|---|---|---|---|
| wrong_ip | 21 | 0 | 21 | 0 |
| wrong_count | 21 | 0 | 21 | 0 |
| wrong_time | 21 | 0 | 21 | 0 |
| invented_cve | 21 | 0 | 21 | 0 |
| wrong_user | 21 | 0 | 21 | 0 |
| unsupported_causal | 21 | 21 | 0 | 0 |

## Example rejections

### case-001

- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-0.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-1.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-2.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-3.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-4.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-5.co

### case-002

- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-0.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-1.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-2.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-3.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-4.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-5.co

### case-003

- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-0.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-1.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-2.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-3.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-4.co
- **wrong_ip** → caught by critic: critic: no phish_suspect delivery from fake-5.co
