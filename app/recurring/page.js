'use client';

import './recurring.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { money, productLabel, shortDate } from '../../lib/catalog';

export default function RecurringPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('recurring')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(error.message || 'Failed to load recurring plans.');
      setLoading(false);
      return;
    }
    setPlans(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when recurring plans change on any device.
  useRealtime(['recurring'], load);

  const active = useMemo(() => plans.filter((p) => p.active), [plans]);
  const inactive = useMemo(() => plans.filter((p) => !p.active), [plans]);

  const mrr = useMemo(
    () => active.reduce((a, p) => a + Number(p.amount || 0), 0),
    [active]
  );

  const cancelPlan = useCallback(
    async (plan) => {
      if (
        !window.confirm(
          `Cancel the ${productLabel(plan.product)} plan for ${
            plan.client_name || 'this client'
          }?`
        )
      )
        return;
      setPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, active: false } : p))
      );
      const { error } = await supabase
        .from('recurring')
        .update({ active: false })
        .eq('id', plan.id);
      if (error) {
        setLoadError(error.message || 'Failed to cancel plan.');
        load();
      }
    },
    [load]
  );

  return (
    <div className="recurring">
      {loadError ? <div className="form-error">{loadError}</div> : null}

      {/* MRR hero */}
      <div className="card mrr-hero">
        <div className="card-label">Monthly recurring</div>
        <div className="big-num green">{money(mrr)}</div>
        <div className="mrr-caption muted">
          {active.length} active plan{active.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Active plans */}
      <div className="card">
        <div className="card-label">Active plans</div>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : active.length === 0 ? (
          <div className="muted">No active plans.</div>
        ) : (
          <div className="rec-list">
            {active.map((plan) => (
              <div className="rec-row" key={plan.id}>
                <div className="rec-main">
                  <span className="rec-name">
                    {plan.client_name || 'No client'}
                  </span>
                  <span className="rec-sub">
                    {productLabel(plan.product)}
                    {plan.start_date
                      ? ` · since ${shortDate(plan.start_date)}`
                      : ''}
                  </span>
                </div>
                <div className="rec-right">
                  <span className="rec-amount green">
                    {money(plan.amount)}/mo
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger rec-cancel"
                    onClick={() => cancelPlan(plan)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancelled / inactive plans */}
      {inactive.length > 0 ? (
        <div className="card">
          <div className="card-label">Cancelled</div>
          <div className="rec-list">
            {inactive.map((plan) => (
              <div className="rec-row rec-inactive" key={plan.id}>
                <div className="rec-main">
                  <span className="rec-name">
                    {plan.client_name || 'No client'}
                  </span>
                  <span className="rec-sub">
                    {productLabel(plan.product)}
                    {plan.start_date
                      ? ` · since ${shortDate(plan.start_date)}`
                      : ''}
                  </span>
                </div>
                <div className="rec-right">
                  <span className="rec-amount muted">
                    {money(plan.amount)}/mo
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
