/* Broker connectivity — isolated interfaces (not imported by the app yet).
   See BROKER_INTEGRATION.md. Everything here is provider-agnostic so the
   UI can be built against these shapes while the provider (SnapTrade) lives
   entirely behind Supabase edge functions.

   Hard rules:
   - read-only: no order/transfer capability is ever modelled here
   - no secrets on the client: connections exposed to the UI never carry
     provider user secrets or tokens
*/

/** @typedef {"snaptrade"} BrokerProvider */
/** @typedef {"active"|"broken"|"disconnected"} ConnectionStatus */

/**
 * What the client is allowed to see about a connection (the server-side row
 * additionally holds provider_user_secret, which never reaches the client).
 * @typedef {Object} BrokerConnection
 * @property {string} id
 * @property {BrokerProvider} provider
 * @property {string} brokerSlug        e.g. "trading212", "interactive-brokers", "degiro", "etoro"
 * @property {string} brokerName
 * @property {ConnectionStatus} status
 * @property {"read"} connectionType     always read-only
 * @property {string|null} lastSyncedAt  ISO timestamp
 * @property {string|null} lastError     user-safe message, never raw provider errors
 * @property {BrokerAccount[]} accounts
 */

/**
 * @typedef {Object} BrokerAccount
 * @property {string} id
 * @property {string} connectionId
 * @property {string} name             e.g. "ISA", "Invest", "Margin"
 * @property {string} numberMasked     e.g. "•••• 4821"
 * @property {string} currency         account base currency, ISO code
 * @property {string|null} portfolioId RichR portfolio this account maps to
 * @property {boolean} include         user can exclude an account from sync
 */

/**
 * One position as returned by a sync, already normalised to RichR's vocabulary.
 * @typedef {Object} BrokerPosition
 * @property {string} externalSymbol   provider's identifier (kept for re-matching)
 * @property {string|null} ticker      RichR ticker after symbol matching (null = unsupported)
 * @property {string} name
 * @property {string|null} exchange
 * @property {number} units
 * @property {number|null} avgPrice    average purchase price in `currency`
 * @property {number|null} price       last price in `currency`
 * @property {string} currency         trading currency, ISO code
 * @property {"Stock"|"Fund"|"ETF"} type
 * @property {boolean} unsupported     true when no RichR ticker could be matched
 */

/**
 * A staged sync result. The server writes it; the client turns it into holdings
 * only after the user confirms in the import review.
 * @typedef {Object} BrokerSnapshot
 * @property {string} id
 * @property {string} accountId
 * @property {string} fetchedAt
 * @property {BrokerPosition[]} positions
 * @property {{currency: string, cash: number}[]} balances
 * @property {"pending"|"applied"|"dismissed"} status
 */

/** Fields a broker-sourced holding carries on top of the normal holding shape. */
/**
 * @typedef {Object} BrokerHoldingMeta
 * @property {"manual"|"import"|"broker"} source
 * @property {string} [brokerAccountId]
 * @property {string} [externalSymbol]
 * @property {string} [lastSyncedAt]
 * @property {boolean} [missingAtBroker]  set by a sync when the broker no longer reports it
 */

/**
 * Client → edge-function contract. Every call carries the user's Supabase JWT;
 * the functions talk to the provider with server-side secrets.
 */
export const BROKER_FUNCTIONS = Object.freeze({
  /** POST { brokerSlug?: string, reconnectId?: string } → { portalUrl: string } */
  connect: "broker-connect",
  /** POST { connectionId: string } → { connection: BrokerConnection, snapshots: BrokerSnapshot[] } */
  sync: "broker-sync",
  /** POST { connectionId: string } → { ok: true }  (deletes provider auth + our rows + snapshots) */
  disconnect: "broker-disconnect",
  /** GET → { connections: BrokerConnection[] } */
  list: "broker-list",
});

/** Diff a snapshot against the holdings a portfolio already has — pure, testable. */
export function diffSnapshot(snapshot, holdings) {
  const byExternal = new Map((holdings || []).filter((h) => h.brokerAccountId === snapshot.accountId && h.externalSymbol).map((h) => [h.externalSymbol, h]));
  const seen = new Set();
  const added = [], updated = [], unsupported = [];
  for (const p of snapshot.positions) {
    seen.add(p.externalSymbol);
    if (p.unsupported || !p.ticker) { unsupported.push(p); continue; }
    const cur = byExternal.get(p.externalSymbol);
    if (!cur) added.push(p);
    else if (Number(cur.shares) !== p.units || (p.avgPrice != null && Number(cur.buyPrice) !== p.avgPrice)) updated.push({ from: cur, to: p });
  }
  const missing = [...byExternal.values()].filter((h) => !seen.has(h.externalSymbol));
  return { added, updated, missing, unsupported };
}
