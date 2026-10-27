# Documentation site image for Dokploy. Build context is the repository root
# (the docs app is a Bun workspace member and resolves its lockfile there):
#
#   docker build -f apps/docs/Dockerfile -t framework-docs .
#
# Stage 1 builds the static Starlight site; stage 2 serves dist/ with nginx.

FROM oven/bun:1.4.2 AS build
WORKDIR /repo
COPY . .
# Debian (glibc) base on purpose: MDX 8's satteri engine loads its native
# linux binding at build time; the postinstall hook vendors the wasm fallback.
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/docs build

FROM nginx:1.29-alpine AS serve
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
