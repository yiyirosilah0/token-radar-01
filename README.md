[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yiyirosilah0/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yiyirosilah0/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

[Token Radar on make.fun](https://make.fun/bounty/token-radar-01)

A token launch radar. It reads a sealed snapshot of every protocol DefiLlama tracks, finds
the ones that record no token and are not a wrapped or staked product of one that trades,
ranks them by what their launch would be worth, and hands in a web dashboard — board, detail
view per protocol, filter — with a farm plan for each.

## The model (radar-2)

Implied value is derived only from the snapshot's own figures, in four steps:

1. **Category multiple.** For each category, the median FDV/TVL multiple (mcap_usd /
   tvl_usd) of its token-bearing protocols, shrunk toward the global median with a prior
   weight of 3 and clamped to [0.02, 2.0], so one outlier cannot set the price.
2. **Growth.** `change_7d` clamped to [-50, +100]%, then `1 + clamped/100 * 0.5`.
3. **Maturity.** Age from `listed_at` to the snapshot date:
   `0.7 + min(age, 1095)/1095 * 0.5`; an unknown listing date scores at 365 days.
4. **Reach.** `1 + 0.02 * min(chains - 1, 5)`.

`implied = round(tvl_usd * multiple * growth * maturity * reach)`

No protocol name is special-cased. The board ranks pre-token protocols only — all 40
watchlist slugs, plus the 160 strongest pre-token protocols below the $50M floor by implied
value. Protocols whose token already trades are kept apart in the dashboard's "Live token"
view with their market cap, never ranked against the pre-token board.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only, no network, deterministic: two runs write byte-identical
outputs. `main.ts` writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/`,
and writes `dossier.json` via `vendor/makefun-board.ts`.

## Layout

- `main.ts` — entrypoint
- `lib/model.ts` — the value model, the board builder, the farm plans
- `vendor/makefun-board.ts` — the kit's dossier library, copied byte for byte
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`), no network
- `screenshots/` — the board, a protocol's detail view, a filtered view

## A note on wording

The snapshot is DefiLlama's record, not proof, so this entry says a protocol "records no
token", never that it has none. Implied value is the entry's own claim, never make.fun's,
and it does not predict whether or when a token is issued.
