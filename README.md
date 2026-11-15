# Token Launch Radar — radar-3

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/icallshelby/makefun-token-radar-02/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/icallshelby/makefun-token-radar-02/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Systematic valuation of pre-token DeFi & infrastructure protocols using runtime category-calibrated multiples, asymmetric growth weighting, logarithmic maturity curves, and multi-chain breadth multipliers.

## What's New in radar-3 (v2)

- **Runtime Category Calibration**: Instead of a fixed global multiple, radar-3 computes median market cap / TVL ratios for each category (e.g., Lending, DEX) from the snapshot's own 128 live-token protocols.
- **Min-5 Rule & Global Fallback**: A category must have at least 5 live comps for its median to be used; otherwise, the model falls back to the global median (0.2138x).
- **Asymmetric Growth Weighting**: Positive 7d TVL growth is weighted at 0.6x, while negative growth is weighted at 0.9x to penalize downside risks more heavily.
- **Improved Data Cleaning**: MCAP > 0 and TVL > 0 cleaning for all calibration comps.
- **Dossier Generation**: Full cryptographic board state preservation in `dossier.json`.

## How to Run

Requires Node 22 (standard library only).

```bash
# Generate the radar output
node main.ts --input input/snapshot.json

# The output will be in the out/ directory:
# - board.json: Full ranked list
# - data.js: Frontend data bundle
# - dashboard/: Interactive web UI
# - screenshots/: Visual verification
# - dossier.json: State proof
```

## Methodology

Implied valuation = `max(1, round(TVL × CategoryMultiple × GrowthMult × MaturityMult × BreadthMult))`

- **TVL**: Total Value Locked as of the snapshot.
- **CategoryMultiple**: Median mcap/TVL of peer protocols (clamped [0.03, 0.80]).
- **GrowthMult**: Based on 7d change, asymmetric weighting.
- **MaturityMult**: Logarithmic curve based on protocol age (days since listing).
- **BreadthMult**: Multi-chain presence bonus (+2% per chain up to 10).

---
*Built for the token-radar-01 make.fun competition.*

---

<sub>Entered on [make.fun](https://make.fun/?ref=0kh7811r&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
