// The /authorize consent page. Credentials are posted straight back to /authorize
// and sealed into the authorization code — never stored on the server.
import { ICON_SVG } from "../../server/meta.js";
import type { ResolvedClient } from "./types.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export interface AuthorizePageModel {
  client: ResolvedClient;
  hidden: Record<string, string>;
  error?: string;
  endpoint?: string;
  keyspace?: string;
  writesRequested?: boolean;
}

export function renderAuthorizePage(m: AuthorizePageModel): string {
  const hidden = Object.entries(m.hidden).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  const clientHost = m.client.origin === "metadata-document" ? new URL(m.client.client_id).hostname : null;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Connect Astra DB · JEStats</title>
<style>
:root{color-scheme:light dark;--bg:light-dark(#faf9f5,#111827);--card:light-dark(#fff,#1f2937);--text:light-dark(#111827,#faf9f5);--text-2:light-dark(#4b5563,#d1d5db);--text-3:light-dark(#5f636b,#b9b9c3);--border:light-dark(#e8e3da,#374151);--field:light-dark(#faf9f5,#111827);--accent:#b64013;--accent-soft:light-dark(#f9e7df,#402719);--accent-text:light-dark(#b64013,#ffb18e);--danger:light-dark(#b91c1c,#fca5a5);--danger-soft:light-dark(#fdecec,#3b1414);--warn:light-dark(#92400e,#fcd34d);--warn-soft:light-dark(#fdf3e2,#33260b)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:32px 16px}
.card{width:100%;max-width:470px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px;box-shadow:0 1px 2px rgb(0 0 0/.05),0 12px 32px -12px rgb(0 0 0/.12)}
.top{display:flex;align-items:center;gap:12px;margin-bottom:18px}.top svg{width:40px;height:40px;flex:none}
h1{font-size:19px;font-weight:600;margin:0;letter-spacing:-.01em}.sub{margin:0;color:var(--text-3);font-size:13px}
p{margin:0 0 14px;color:var(--text-2);font-size:14px}
.client{display:inline-flex;gap:6px;align-items:center;padding:3px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent-text);font-size:12.5px;font-weight:500}
label{display:block;font-size:13px;font-weight:500;color:var(--text-2);margin:14px 0 6px}label small{font-weight:400;color:var(--text-3)}
input[type=text],input[type=password],input[type=url]{width:100%;font:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--border);border-radius:10px;background:var(--field);color:var(--text)}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #d9531e;outline-offset:2px}a{color:var(--accent-text)}
.check{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:12px;border:1px solid var(--border);border-radius:12px;font-size:13.5px;color:var(--text-2);cursor:pointer}
.check input{margin-top:3px;accent-color:#b64013}.check b{color:var(--text);font-weight:600}
.warn{display:none;margin-top:8px;padding:8px 11px;border-radius:10px;background:var(--warn-soft);color:var(--warn);font-size:12.5px}
#allow_writes:checked+span .warn{display:block}
.row{display:flex;gap:10px;margin-top:20px}button{flex:1;font:inherit;font-size:15px;font-weight:600;padding:11px;border-radius:11px;cursor:pointer}
.primary{border:0;background:var(--accent);color:#fff}.primary:hover{background:#96330f}
.secondary{border:1px solid var(--border);background:transparent;color:var(--text-2)}
.err{background:var(--danger-soft);color:var(--danger);border-radius:10px;padding:9px 11px;font-size:13px;margin:0 0 6px}
.fine{font-size:12px;color:var(--text-3);margin:16px 0 0}
</style></head>
<body><form class="card" method="post" action="/authorize" autocomplete="off">
  <div class="top">${ICON_SVG}<div><h1>Connect Astra DB</h1><p class="sub">JEStats · unofficial Astra DB integration</p></div></div>
  <p>This community plugin is maintained by <a href="https://jestats.io">JEStats</a> and is not affiliated with or endorsed by DataStax or IBM. This connection still requires an Astra application token; it does not sign you into your Astra account.</p>
  <p><span class="client">${esc(m.client.client_name)}${clientHost ? ` · ${esc(clientHost)}` : ""}</span> wants to use your Astra database.</p>
  ${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ""}
  <label for="token">Application token <small>— <a href="https://docs.datastax.com/en/astra-db-serverless/administration/manage-application-tokens.html" target="_blank" rel="noopener noreferrer">token help</a></small></label>
  <input id="token" name="token" type="password" placeholder="AstraCS:…" required autocomplete="off" spellcheck="false">
  <label for="endpoint">Data API endpoint <small>— optional if the token sees one database</small></label>
  <input id="endpoint" name="endpoint" type="url" placeholder="https://…apps.astra.datastax.com" value="${esc(m.endpoint ?? "")}" spellcheck="false">
  <label for="keyspace">Keyspace <small>— optional</small></label>
  <input id="keyspace" name="keyspace" type="text" placeholder="default_keyspace" value="${esc(m.keyspace ?? "")}" spellcheck="false">
  <label class="check" for="allow_writes"><input id="allow_writes" name="allow_writes" type="checkbox"${m.writesRequested ? " checked" : ""}><span><b>Allow writes</b> — insert, update, delete, create and drop collections/tables. Destructive actions still ask for confirmation.<span class="warn">The client will be able to change and delete data with this token.</span></span></label>
  ${hidden}
  <div class="row"><button class="secondary" type="submit" name="action" value="deny" formnovalidate>Cancel</button><button class="primary" type="submit" name="action" value="allow">Connect</button></div>
  <p class="fine">The token and endpoint are encrypted into the access token issued to this client and never stored here. Use a token with the least privilege you need (a read-only role if you don't allow writes); revoke access by rotating it in the Astra console. <a href="https://github.com/jestatsio/astra-db-plugin/blob/main/docs/privacy.md">Privacy policy</a>.</p>
</form></body></html>`;
}
