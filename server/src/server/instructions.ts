/** Server instructions (kept under ~1.8k chars; hosts truncate at 2k). */
export function instructions(options: { allowWrites: boolean; hosted: boolean }): string {
  return [
    "Unofficial JEStats integration for Astra DB (DataStax / IBM): inspect, query, vector-search, and change data via the Data API.",
    "",
    "Targeting: every data tool takes optional `database` (name, id, or endpoint URL) and `keyspace`; omit both for the configured default. Use list_databases when unsure which database the user means.",
    "",
    "Start with database_overview or describe_collection / describe_table before writing code or queries against a collection — never guess field names, vector dimensions, or primary keys. find pages with nextPageState; vector_search takes `query` text (vectorize), a `vector`, or a `documentId`; `hybrid` needs lexical + rerank.",
    "",
    options.allowWrites
      ? "Writes: insert/update/delete/create_*/drop change real data. Drops, updates/deletes with `many` or an empty filter need the user's confirmation — the host may ask them directly; otherwise explain the impact, ask, and only after they approve pass `confirm` with the exact name. The original request is not approval; never self-confirm."
      : "This connection is read-only: write and schema tools are not available.",
    "",
    options.hosted
      ? "Credentials come from the connection's authorization; never ask the user for tokens in chat."
      : "Credentials: if a tool returns not_configured, ask the user to run `npx -y @erichare/astra-mcp login` in their own terminal (no restart needed). Never ask them to paste a token into chat, and never write tokens into files other than a git-ignored .env. If one is pasted anyway, don't use it; suggest rotating it.",
    "",
    "Writing application code: call code_examples for canonical client snippets (Python, TypeScript, Java, C#, Go); app code reads ASTRA_DB_APPLICATION_TOKEN and ASTRA_DB_API_ENDPOINT from the environment.",
    "",
    "database_overview, describe_*, find, and vector_search render an interactive view in hosts that support MCP Apps; after they do, summarize briefly instead of repeating the data.",
  ].join("\n");
}
