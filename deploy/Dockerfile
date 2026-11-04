# Living Tabletop World images (docs/adr/0037-deployment.md). Build them from a committed
# revision with deploy/scripts/build.sh: the context is `git archive` of that revision, so
# uncommitted, ignored and secret files never enter it.
#
#   --target server   the API server: migrations at start, then the server; non-root
#   --target proxy    Caddy with the built client and deploy/proxy/Caddyfile; non-root
#
# Base images are pinned by digest (multi-platform indexes). Update them deliberately.
ARG NODE_IMAGE=node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
ARG CADDY_IMAGE=caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d

# pnpm at the repository's `packageManager` version.
FROM ${NODE_IMAGE} AS pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
WORKDIR /app
COPY package.json ./
RUN corepack enable pnpm && corepack install

# The workspace manifests alone: installs depend on nothing else, so source edits keep them cached.
FROM pnpm AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps apps
COPY packages packages
RUN find apps packages -mindepth 2 -maxdepth 2 ! -name package.json -exec rm -rf {} +

FROM pnpm AS build
COPY --from=manifests /app /app
RUN --mount=type=cache,id=ltw-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store
COPY tsconfig.base.json tsconfig.build.json ./
COPY apps apps
COPY packages packages
RUN pnpm build
# What the server runs: compiled packages without declarations, migrations, runtime fixtures.
RUN mkdir -p /out/apps/server /out/fixtures \
 && cp -R apps/server/package.json apps/server/dist apps/server/migrations /out/apps/server/ \
 && for dir in packages/*; do \
      mkdir -p "/out/$dir" && cp -R "$dir/package.json" "$dir/dist" "/out/$dir/"; \
    done \
 && find /out \( -name '*.d.ts' -o -name '*.d.ts.map' -o -name '.tsbuildinfo' \) -delete
COPY fixtures/ravenford /out/fixtures/ravenford
COPY fixtures/ravenford-ru /out/fixtures/ravenford-ru
# The starter adventure (docs/adr/0058-campaign-content.md §5): its seeds, books, library, pictures.
COPY fixtures/hollowmere /out/fixtures/hollowmere
COPY fixtures/hollowmere-ru /out/fixtures/hollowmere-ru

# Production dependencies of the server and its workspace packages only.
FROM pnpm AS prod-deps
COPY --from=manifests /app /app
RUN --mount=type=cache,id=ltw-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --prod --filter @ltw/server... --store-dir /pnpm-store

FROM ${NODE_IMAGE} AS server
ARG LTW_REVISION=unknown
LABEL org.opencontainers.image.title="Living Tabletop World server" \
      org.opencontainers.image.revision="${LTW_REVISION}"
ENV NODE_ENV=production LTW_REVISION=${LTW_REVISION}
WORKDIR /app
COPY --from=prod-deps /app /app
COPY --from=build /out /app
COPY --chmod=0555 deploy/server/start.sh /usr/local/bin/ltw-server-start
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/ltw-server-start"]

FROM ${CADDY_IMAGE} AS proxy
ARG LTW_REVISION=unknown
LABEL org.opencontainers.image.title="Living Tabletop World proxy" \
      org.opencontainers.image.revision="${LTW_REVISION}"
# A non-root user owning Caddy's state. Compose lets it bind 80/443 without capabilities
# (an unprivileged-port sysctl), so the binary's file capability goes: with every capability
# dropped and no-new-privileges, the kernel would refuse to run a binary that asks for one.
RUN addgroup -S -g 1000 caddy && adduser -S -D -H -u 1000 -G caddy caddy \
 && chown -R caddy:caddy /data /config \
 && setcap -r /usr/bin/caddy
COPY --from=build /app/apps/web/build /srv
COPY deploy/proxy/trust /srv-trust
COPY deploy/proxy/Caddyfile /etc/caddy/Caddyfile
RUN PUBLIC_HOST=ltw.example TLS_MODE=acme caddy validate --config /etc/caddy/Caddyfile \
 && PUBLIC_HOST=localhost TLS_MODE=internal caddy validate --config /etc/caddy/Caddyfile \
 && PUBLIC_HOST=192.168.1.10 TLS_MODE=internal LTW_PROXY_MODE=local \
    caddy validate --config /etc/caddy/Caddyfile \
 && rm -rf /data/caddy /config/caddy
USER caddy
