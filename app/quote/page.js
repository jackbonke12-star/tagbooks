'use client';

// On-the-spot quote builder: pick a client (or type a business), tap products to
// add line items, see a live total with optional Alberta GST, then save it to the
// client record and text / copy / print (Save-as-PDF) it on the spot. Products and
// clients come live from Supabase; every saved quote lands in the `quotes` table
// linked to the client so it's referenceable later.

import './quote.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { money, localToday } from '../../lib/catalog';

const GST_RATE = 0.05; // Alberta GST
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let lineSeq = 0;
function newLine(name = '', price = 0, qty = 1) {
  lineSeq += 1;
  return { key: `l${lineSeq}`, name, qty, price: Number(price) || 0 };
}

// 'YYYY-MM-DD...' -> 'Jul 24' (parse parts, no UTC shift).
function fmtDate(iso) {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${MONTHS[m - 1]} ${d}`;
}

const lineAmount = (l) => (Number(l.qty) || 0) * (Number(l.price) || 0);

export default function QuotePage() {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [clientId, setClientId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState([]);
  const [gst, setGst] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    const [p, c, q] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .order('sort', { ascending: true, nullsFirst: false })
        .order('name'),
      supabase.from('clients').select('*').order('business_name'),
      supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);
    const err = p.error || c.error || q.error;
    if (err) setLoadError(err.message || 'Failed to load.');
    setProducts(p.data || []);
    setClients(c.data || []);
    setQuotes(q.data || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(['products', 'clients', 'quotes'], load);

  // Picking a client prefills business / contact / phone (all still editable).
  const pickClient = useCallback(
    (id) => {
      setClientId(id);
      if (!id) return;
      const cl = clients.find((c) => c.id === id);
      if (cl) {
        setBusinessName(cl.business_name || '');
        setContactName(cl.contact_name || '');
        setPhone(cl.phone || '');
      }
    },
    [clients]
  );

  const addProduct = useCallback((prod) => {
    setLines((ls) => [...ls, newLine(prod.name, prod.price == null ? 0 : prod.price)]);
  }, []);
  const addCustom = useCallback(() => setLines((ls) => [...ls, newLine('', 0)]), []);
  const updateLine = useCallback((key, patch) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);
  const removeLine = useCallback(
    (key) => setLines((ls) => ls.filter((l) => l.key !== key)),
    []
  );

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + lineAmount(l), 0),
    [lines]
  );
  const tax = useMemo(() => (gst ? subtotal * GST_RATE : 0), [gst, subtotal]);
  const total = subtotal + tax;
  const today = localToday();

  const filledLines = useMemo(
    () => lines.filter((l) => l.name.trim() || Number(l.price) > 0),
    [lines]
  );

  // Plain-text quote for SMS / clipboard.
  const quoteText = useMemo(() => {
    const rows = filledLines.map(
      (l) => `- ${Number(l.qty) || 0} x ${l.name.trim() || 'Item'}  ${money(lineAmount(l))}`
    );
    return [
      'TAGBOOKS QUOTE',
      businessName.trim() ? `For: ${businessName.trim()}` : null,
      today,
      '',
      ...rows,
      '',
      `Subtotal: ${money(subtotal)}`,
      gst ? `GST (5%): ${money(tax)}` : null,
      `Total: ${money(total)}`,
      notes.trim() ? `\nNotes: ${notes.trim()}` : null,
      '',
      'Thanks - Jack & Jackson, TagBooks',
    ]
      .filter((x) => x !== null)
      .join('\n');
  }, [filledLines, businessName, today, subtotal, gst, tax, total, notes]);

  const smsHref = useMemo(() => {
    const digits = String(phone || '').replace(/\D/g, '');
    return `sms:${digits}&body=${encodeURIComponent(quoteText)}`;
  }, [phone, quoteText]);

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(quoteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setLoadError('Could not copy — long-press to select instead.');
    }
  }, [quoteText]);

  const canSave = businessName.trim() && filledLines.length > 0;

  const saveQuote = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setLoadError('');
    const items = filledLines.map((l) => ({
      name: l.name.trim() || 'Item',
      qty: Number(l.qty) || 0,
      price: Number(l.price) || 0,
    }));
    const { error } = await supabase.from('quotes').insert({
      client_id: clientId || null,
      business_name: businessName.trim(),
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      items,
      subtotal,
      tax,
      total,
      gst,
      notes: notes.trim() || null,
      status: 'sent',
    });
    setSaving(false);
    if (error) {
      setLoadError(error.message || 'Failed to save quote.');
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
    load();
  }, [
    canSave,
    filledLines,
    clientId,
    businessName,
    contactName,
    phone,
    subtotal,
    tax,
    total,
    gst,
    notes,
    load,
  ]);

  const printQuote = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  // Reload a past quote back into the form (to re-send or tweak).
  const loadQuote = useCallback((q) => {
    setClientId(q.client_id || '');
    setBusinessName(q.business_name || '');
    setContactName(q.contact_name || '');
    setPhone(q.phone || '');
    setGst(!!q.gst);
    setNotes(q.notes || '');
    setLines(
      (Array.isArray(q.items) ? q.items : []).map((it) =>
        newLine(it.name || '', it.price, Number(it.qty) || 1)
      )
    );
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const resetForm = useCallback(() => {
    setClientId('');
    setBusinessName('');
    setContactName('');
    setPhone('');
    setLines([]);
    setGst(true);
    setNotes('');
  }, []);

  return (
    <div className="quote">
      <div className="page-head">
        <h1 className="page-title">Quote Builder</h1>
        <p className="page-title-sub">
          Build a quote on the spot, save it to the client, and text or print it.
        </p>
      </div>

      {loadError ? <div className="form-error">{loadError}</div> : null}

      {/* Customer */}
      <div className="card">
        <div className="card-label">Customer</div>
        <div className="field">
          <label className="label">Existing client</label>
          <select
            className="select"
            value={clientId}
            onChange={(e) => pickClient(e.target.value)}
          >
            <option value="">Walk-in / type below</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Business name</label>
          <input
            className="input"
            value={businessName}
            placeholder="Business name"
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div className="grid2">
          <div className="field">
            <label className="label">Contact</label>
            <input
              className="input"
              value={contactName}
              placeholder="Optional"
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Phone (to text)</label>
            <input
              className="input"
              type="tel"
              inputMode="tel"
              value={phone}
              placeholder="Optional"
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="card">
        <div className="card-label">Line items</div>
        <div className="q-add-row">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              className="q-add-chip"
              onClick={() => addProduct(p)}
            >
              <span className="q-add-name">+ {p.name}</span>
              <span className="q-add-price">
                {p.price == null ? 'Quote' : money(p.price)}
              </span>
            </button>
          ))}
          <button type="button" className="q-add-chip q-add-custom" onClick={addCustom}>
            <span className="q-add-name">+ Custom line</span>
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="muted load-line">Tap a product above to start the quote.</div>
        ) : (
          <div className="q-lines">
            {lines.map((l) => (
              <div className="q-line" key={l.key}>
                <input
                  className="q-line-name"
                  value={l.name}
                  placeholder="Item name"
                  onChange={(e) => updateLine(l.key, { name: e.target.value })}
                />
                <div className="q-line-controls">
                  <div className="q-qty">
                    <button
                      type="button"
                      onClick={() =>
                        updateLine(l.key, {
                          qty: Math.max(1, (Number(l.qty) || 1) - 1),
                        })
                      }
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={l.qty}
                      onChange={(e) =>
                        updateLine(l.key, {
                          qty:
                            e.target.value === ''
                              ? ''
                              : Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateLine(l.key, { qty: (Number(l.qty) || 0) + 1 })
                      }
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <div className="q-price">
                    <span className="q-price-sign">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="1"
                      value={l.price}
                      onChange={(e) =>
                        updateLine(l.key, {
                          price:
                            e.target.value === ''
                              ? ''
                              : Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                  <span className="q-line-total">{money(lineAmount(l))}</span>
                  <button
                    type="button"
                    className="q-line-remove"
                    onClick={() => removeLine(l.key)}
                    aria-label="Remove line"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="card">
        <div className="card-label">Total</div>
        <label className="q-gst">
          <input
            type="checkbox"
            checked={gst}
            onChange={(e) => setGst(e.target.checked)}
          />
          Add GST (5%)
        </label>
        <div className="q-total-rows">
          <div className="q-total-row">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          {gst ? (
            <div className="q-total-row">
              <span>GST 5%</span>
              <span>{money(tax)}</span>
            </div>
          ) : null}
          <div className="q-total-row q-grand">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
        </div>

        <div className="field">
          <label className="label">Notes</label>
          <textarea
            className="textarea"
            value={notes}
            placeholder="Optional — terms, timing, anything to add"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="q-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveQuote}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : 'Save to client'}
          </button>
          <a
            className={'btn' + (filledLines.length ? '' : ' q-btn-off')}
            href={smsHref}
          >
            Text quote
          </a>
          <button type="button" className="btn" onClick={copyText}>
            {copied ? 'Copied' : 'Copy text'}
          </button>
          <button type="button" className="btn" onClick={printQuote}>
            Print / PDF
          </button>
          <button type="button" className="btn btn-ghost" onClick={resetForm}>
            Clear
          </button>
          {savedFlash ? <span className="q-saved">Saved to Clients</span> : null}
        </div>
      </div>

      {/* Recent quotes */}
      {quotes.length > 0 ? (
        <div className="card">
          <div className="card-label">Recent quotes</div>
          <div className="q-recent">
            {quotes.map((q) => {
              const n = Array.isArray(q.items) ? q.items.length : 0;
              return (
                <div className="q-recent-item" key={q.id}>
                  <div className="q-recent-main">
                    <span className="q-recent-name">{q.business_name || '—'}</span>
                    <span className="q-recent-sub">
                      {fmtDate(q.created_at)} · {n} item{n === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="q-recent-total">{money(q.total)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => loadQuote(q)}
                  >
                    Load
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Print / PDF layout — hidden on screen, shown only when printing. */}
      <div className="quote-print" aria-hidden="true">
        <div className="qp-head">
          <div className="qp-brand">TagBooks</div>
          <div className="qp-date">{today}</div>
        </div>
        <div className="qp-for">
          Quote for: <strong>{businessName.trim() || '—'}</strong>
          {contactName.trim() ? ` (${contactName.trim()})` : ''}
        </div>
        <table className="qp-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {filledLines.map((l) => (
              <tr key={l.key}>
                <td>{l.name.trim() || 'Item'}</td>
                <td>{Number(l.qty) || 0}</td>
                <td>{money(l.price)}</td>
                <td>{money(lineAmount(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="qp-totals">
          <div>
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          {gst ? (
            <div>
              <span>GST 5%</span>
              <span>{money(tax)}</span>
            </div>
          ) : null}
          <div className="qp-grand">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
        </div>
        {notes.trim() ? <div className="qp-notes">{notes.trim()}</div> : null}
        <div className="qp-foot">Thanks! — Jack &amp; Jackson, TagBooks</div>
      </div>
    </div>
  );
}
