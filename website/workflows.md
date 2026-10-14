# From a question to grounded work

Start with a read, inspect the result, and make any proposed change explicit. The same MCP tools serve Claude and Codex; the available presentation depends on the host.

## Understand an unfamiliar database

> Map this database. Show its keyspaces, collections, and tables, then describe the schema and a small sample from the collection I choose.

The agent can use `database_overview`, `describe_collection`, `describe_table`, and `find`. Tool inputs support an explicit database and keyspace, so a follow-up need not depend on a guessed default.

## Search by meaning

> Find documents related to “reducing checkout abandonment.” Show the source documents and explain the search settings used.

`vector_search` supports vector and hybrid search. Text queries need a compatible vectorize configuration; otherwise supply embeddings appropriate for your collection. Similarity is a retrieval signal, not proof that a document is correct.

## Write code against the real schema

> Inspect the products collection, then use the bundled TypeScript Data API examples to draft a filtered query. Explain any assumptions before running it.

The `code_examples` tool searches bundled examples for Python, TypeScript, Java, C#, and Go. Your agent can pair those examples with the live schema instead of inventing collection fields.

## Make a guarded change

> Show the documents this update would affect and explain the proposed change before asking me to approve it.

Write and schema tools are available unless read-only mode is enabled. Destructive operations, broad updates, and broad deletes require confirmation. Read-only mode removes the write tools entirely; set `ASTRA_MCP_READ_ONLY=1` in the server's environment or use the supported client setting. Never rely on prompt wording as your only access control.

## Choose a skill

| Goal | Starting point |
| --- | --- |
| Connect or repair setup | `setup`, `doctor` |
| Inspect data | `overview`, `collection`, `explore`, `similar` |
| Review a model or migration | `data-model-review`, `data-modeler`, `migration-helper` |
| Work with client libraries | `astra-toolkit` |

In Claude Code, shortcuts use `/astra-db:…`. In Codex, select the skill or ask for it by name. [Browse the shipped skills](https://github.com/jestatsio/astra-db-plugin/tree/main/skills) and [full tool reference](https://github.com/jestatsio/astra-db-plugin/blob/main/docs/tools.md).
