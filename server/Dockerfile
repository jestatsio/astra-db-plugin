# Astra DB MCP server (stdio) — for the Docker MCP Catalog and container hosts.
# Build from the repository root:  docker build -f server/Dockerfile -t astra-mcp .
# Run:  docker run -i --rm -e ASTRA_DB_APPLICATION_TOKEN -e ASTRA_DB_API_ENDPOINT astra-mcp
FROM node:22-alpine AS build
WORKDIR /repo
COPY skills ./skills
COPY hooks ./hooks
COPY scripts ./scripts
COPY LICENSE ./LICENSE
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --no-fund --no-audit --ignore-scripts
COPY server ./server
RUN cd server && node scripts/build.mjs

FROM node:22-alpine
LABEL org.opencontainers.image.title="astra-mcp" \
      org.opencontainers.image.description="Astra DB MCP server: schema, find, vector search, guarded writes, interactive views" \
      org.opencontainers.image.source="https://github.com/jestatsio/astra-db-plugin" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.modelcontextprotocol.server.name="io.github.jestatsio/astra-mcp"
WORKDIR /app
COPY --from=build /repo/server/dist/cli.js /repo/server/dist/assets.json /repo/server/THIRD_PARTY_NOTICES.md /repo/LICENSE ./
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "/app/cli.js", "serve"]
