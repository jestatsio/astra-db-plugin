---
name: setup
description: Connect this project to an Astra DB database — install check, credentials via a one-time terminal login, verification through the live tools. Use when the user wants to start using Astra DB, when an astra-db tool reports not_configured or invalid credentials, or when they ask how to configure the token or endpoint.
argument-hint: "[database name]"
metadata:
  kind: workflow
---

Get Astra DB working for this project, then prove it with a live call.

## 1. Check the current state

Call `connection_status`. If it reports `configured: true` and a passing live check, say which database and keyspace are in use and where the credentials come from (for example `.env` or `~/.astrarc`), then skip to step 4.

## 2. Connect: the user runs one command

Credentials never pass through the chat. Ask the user to run this in their own terminal (in Claude Code, typing `!` followed by the command runs it in the session):

```
npx -y @erichare/astra-mcp login
```

It reuses existing credentials or prompts for an application token with hidden input, lists their databases, lets them pick one and a keyspace, then writes connection settings to `./.env` (git-ignored). CLI-profile reuse saves only profile/config metadata and connection details, keeping the token in the CLI configuration. A newly entered token is saved with mode 0600. `--global` saves to their user profile instead, which suits Claude Desktop. No restart is needed: the server re-reads credentials on every call.

- **No token yet?** Tokens are created in the Astra console (astra.datastax.com → Settings → Tokens). Database Administrator covers everything; a read-only role is enough to explore.
- **No database yet?** They can create one in the console, or with the Astra CLI (`astra db create <name> --region <region>`; see [../astra-toolkit/astra-cli/README.md](../astra-toolkit/astra-cli/README.md)).
- **They already use the Astra CLI?** An `astra setup` profile in `~/.astrarc` is picked up automatically. Use `login --profile NAME` for a named profile and `--astrarc PATH` for a custom configuration file. A token that sees exactly one database needs no endpoint. Astra still requires an application token upstream.

Never ask for the token in chat, and never write a token into a file yourself. If the user pastes a token anyway, don't use, repeat, or store it: it is now in the conversation history, so suggest they rotate it in the Astra console and give the new one to `login` instead.

## 3. Verify

Call `connection_status` again, then `database_overview`. If a check fails, relay its `hint` exactly (`invalid_credentials`, `forbidden`, and `ambiguous_database` each explain their fix).

## 4. Next steps

Suggest something concrete: describe a collection, run a vector search, or scaffold application code. App code reads the same `ASTRA_DB_*` variables; the `code_examples` tool and the [astra-toolkit skill](../astra-toolkit/SKILL.md) have idiomatic snippets for Python, TypeScript, Java, C#, and Go.
