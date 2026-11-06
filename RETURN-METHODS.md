# Return methods and calendar boundaries

The UI exposes separate measures, not interchangeable names for one return:

- Annual money-weighted return: one Modified Dietz calculation over the displayed start/end dates. This is neither deannualized annual XIRR nor a product of valuation subperiods. The current year is a period/YTD return, not annualized.
- Personal annualized return: the existing XIRR over all dated external cash flows and the final valuation, using Actual/365. It does not need an intervening valuation every December 31. Existing six-calendar-month display gating remains unchanged.
- Linked annualized return: compound valuation-subperiod returns, then annualize over the actual total days. Interior flows without valuation dates use Modified Dietz estimates. Do not geometrically compound the annual money-weighted table and label that XIRR. The optional short-calendar-year exclusion belongs only to this view.
- The legacy cumulative chart is explicitly labeled XIRR; its underlying calculation has not been changed in this release.

## Boundary resolution

1. Use the previous December 31 end-of-day aggregate valuation when available.
2. Otherwise use a complete January 1 end-of-day aggregate valuation as the explicit boundary date. Never silently relabel it December 31. Flows on the boundary day are already included in that closing valuation, so they are not counted again in the next interval.
3. Otherwise estimate December 31 separately for each relevant account: latest real valuation on or before the date, plus subsequent contributions, minus subsequent withdrawals through December 31. If an account has no valuation yet, its known funding can supply an explicitly estimated balance. Dates before the account's first event contribute zero.
4. A negative or unavailable carried balance is not a valid estimate. Do not invent a closing valuation after the latest actual valuation or combine unaligned current account valuation dates.
5. Estimated boundaries are in-memory derived values only. Preserve the original source dates even across multiple missing years; no synthetic ledger event is saved. Display estimate labels and explain that missing market movement is unknown. A later real boundary record supersedes the derived estimate automatically on recomputation.

The estimate assigns unknown intervening market movement to the later observed interval. Consequently yearly attribution can change materially when an actual boundary valuation is supplied. An estimate is not proof of zero market return during the gap.

## Benchmarks

- Annual money-weighted comparisons simulate the same opening capital and dated external flows for both indices, then use the same whole-period Modified Dietz formula. Non-trading-day flows use the next available close within 7 days; the final close must be on or before valuation and within 7 days. Inadequate market coverage or an unfundable withdrawal yields unavailable, not zero.
- Linked comparisons use same-date, same-currency price-index returns without simulating deposits. Price indices exclude dividends; this is not a total-return index.
- Computation is local. Market providers receive only the existing benchmark/currency/date-range requests, not account identities, balances or cash-flow amounts. Manual-mode and opt-out behavior remain unchanged.

## Reference and limits

The distinction between personal Modified Dietz/XIRR and manager-view time-weighted annualization follows the public explanation at https://youzhiyouxing.cn/materials/1277. Exact matching of that app's undisclosed missing-data and date conventions is not claimed. Calendar-boundary carry-forward estimates and optional per-calendar-year half-year filtering are this plugin's explicitly disclosed rules.

Regression fixtures are synthetic. They cover late-December funding/withdrawals, boundary-day double-counting, replacement by real valuations, absent new-year updates, stale estimates, multi-account boundaries, whole-period versus linked returns, benchmark funding and ledger immutability.
