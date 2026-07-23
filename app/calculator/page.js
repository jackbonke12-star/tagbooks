'use client';

import './calculator.css';
import { useMemo, useState } from 'react';
import { money } from '../../lib/catalog';
import { SPOOLS, spoolPrice } from '../../lib/spoolConfig';

// Parse a form text value into a non-negative number. Empty / invalid -> 0 so
// the ledger never shows NaN and never crashes on partial input.
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Suggested price rounding: bump the raw suggestion up to the next whole
// dollar, then knock a penny off so it reads as a real ".99" shelf price.
// Zero stays zero (empty state shows $0.00, not $-0.01).
function nicePrice(raw) {
  if (!(raw > 0)) return 0;
  return Math.ceil(raw) - 0.01;
}

export default function CalculatorPage() {
  const [spoolId, setSpoolId] = useState(SPOOLS[0] ? SPOOLS[0].id : '');
  const [grams, setGrams] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [machineRate, setMachineRate] = useState('2.00');
  const [markup, setMarkup] = useState('3');
  const [yourPrice, setYourPrice] = useState('');

  const spool = useMemo(
    () => SPOOLS.find((s) => s.id === spoolId) || SPOOLS[0] || null,
    [spoolId]
  );

  const calc = useMemo(() => {
    const pricePerKg = spool ? num(spool.pricePerKg) : 0;
    const g = num(grams);
    const hoursTotal = num(hours) + num(minutes) / 60;
    const rate = num(machineRate);
    const qty = Math.max(1, Math.floor(num(quantity)) || 1);
    const mult = num(markup);

    const materialCost = (g / 1000) * pricePerKg;
    const machineCost = hoursTotal * rate;
    const totalCost = materialCost + machineCost;
    const costPerUnit = totalCost / qty;

    const suggestedRaw = costPerUnit * mult;
    const suggested = nicePrice(suggestedRaw);

    // "Your price" is optional. Blank -> no profit block. Zero is a valid entry
    // (they may want to see a full loss), so only skip when the field is empty.
    const priceEntered = yourPrice.trim() !== '';
    const price = num(yourPrice);
    const profitPerUnit = priceEntered ? price - costPerUnit : 0;
    const marginPct = priceEntered && price > 0 ? (profitPerUnit / price) * 100 : 0;

    return {
      pricePerKg,
      qty,
      materialCost,
      machineCost,
      totalCost,
      costPerUnit,
      suggestedRaw,
      suggested,
      priceEntered,
      price,
      profitPerUnit,
      marginPct,
    };
  }, [spool, grams, hours, minutes, quantity, machineRate, markup, yourPrice]);

  const batch = calc.qty > 1;

  return (
    <div className="calculator">
      {/* Inputs */}
      <div className="card">
        <div className="card-label">Print details</div>

        <div className="field">
          <label className="label" htmlFor="calc-spool">
            Spool
          </label>
          <div className="calc-spool-row">
            <span
              className="calc-swatch"
              aria-hidden="true"
              style={{ background: spool ? spool.colorHex : 'transparent' }}
            />
            <select
              id="calc-spool"
              className="select"
              value={spoolId}
              onChange={(e) => setSpoolId(e.target.value)}
            >
              {SPOOLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} - {spoolPrice(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="calc-grams">
            Filament used (grams)
          </label>
          <input
            id="calc-grams"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className="input"
            value={grams}
            placeholder="0"
            onChange={(e) => setGrams(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label">Print time</label>
          <div className="grid2">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              className="input"
              value={hours}
              placeholder="Hours"
              aria-label="Print time hours"
              onChange={(e) => setHours(e.target.value)}
            />
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              className="input"
              value={minutes}
              placeholder="Minutes"
              aria-label="Print time minutes"
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label className="label" htmlFor="calc-qty">
              Quantity
            </label>
            <input
              id="calc-qty"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              className="input"
              value={quantity}
              placeholder="1"
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="calc-rate">
              Machine rate ($/hr)
            </label>
            <input
              id="calc-rate"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="input"
              value={machineRate}
              placeholder="2.00"
              onChange={(e) => setMachineRate(e.target.value)}
            />
          </div>
        </div>
        <div className="calc-hint">
          Machine rate covers electricity + machine wear/maintenance per hour.
        </div>

        <div className="grid2">
          <div className="field">
            <label className="label" htmlFor="calc-markup">
              Markup multiple
            </label>
            <input
              id="calc-markup"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="input"
              value={markup}
              placeholder="3"
              onChange={(e) => setMarkup(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="calc-price">
              Your price (optional)
            </label>
            <input
              id="calc-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="input"
              value={yourPrice}
              placeholder="e.g. 39"
              onChange={(e) => setYourPrice(e.target.value)}
            />
          </div>
        </div>
        <div className="calc-hint">
          Cost x markup = suggested price. Logo stands currently sell at $39.
        </div>
      </div>

      {/* Results */}
      <div className="card">
        <div className="card-label">Cost breakdown</div>

        <div className="calc-ledger">
          <div className="calc-line">
            <span className="calc-line-label">Material cost</span>
            <span className="calc-line-amt">{money(calc.materialCost)}</span>
          </div>
          <div className="calc-line">
            <span className="calc-line-label">Machine / time cost</span>
            <span className="calc-line-amt">{money(calc.machineCost)}</span>
          </div>
          <div className="calc-line calc-line-total">
            <span className="calc-line-label">Total cost{batch ? ' (batch)' : ''}</span>
            <span className="calc-line-amt">{money(calc.totalCost)}</span>
          </div>

          <div className="calc-line calc-line-strong">
            <span className="calc-line-label">Cost per unit</span>
            <span className="calc-line-amt">{money(calc.costPerUnit)}</span>
          </div>
          <div className="calc-line">
            <span className="calc-line-label">Suggested price / unit</span>
            <span className="calc-line-amt green">{money(calc.suggested)}</span>
          </div>

          {batch ? (
            <div className="calc-batch-note muted">
              Batch of {calc.qty}: suggested {money(calc.suggested * calc.qty)} total
              on {money(calc.totalCost)} cost.
            </div>
          ) : null}
        </div>

        {/* Profit block: reserved footprint so it never shifts the layout when a
            price is typed in or cleared. */}
        <div className="calc-profit">
          {calc.priceEntered ? (
            <div className="calc-ledger">
              <div className="calc-line">
                <span className="calc-line-label">Your price / unit</span>
                <span className="calc-line-amt">{money(calc.price)}</span>
              </div>
              <div className="calc-line">
                <span className="calc-line-label">Profit / unit</span>
                <span
                  className={
                    'calc-line-amt ' +
                    (calc.profitPerUnit >= 0 ? 'green' : 'red')
                  }
                >
                  {money(calc.profitPerUnit)}
                </span>
              </div>
              <div className="calc-line">
                <span className="calc-line-label">Margin</span>
                <span
                  className={
                    'calc-line-amt ' + (calc.marginPct >= 0 ? 'green' : 'red')
                  }
                >
                  {calc.marginPct.toFixed(1)}%
                </span>
              </div>
            </div>
          ) : (
            <div className="muted calc-profit-empty">
              Enter your price above to see profit and margin per unit.
            </div>
          )}
        </div>

        <div className="calc-footnote muted">
          Prices are taken from the spool list; update them there to refresh.
        </div>
      </div>
    </div>
  );
}
