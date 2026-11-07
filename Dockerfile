# Documentation site image for mohamedhabibwork/framework-docs (linked with mohamedhabibwork/framework).
#
#   docker build -t framework-docs .
#
FROM oven/bun:1.4.2 AS build
WORKDIR /repo
COPY . .
RUN bun install
RUN bun run build

FROM nginx:1.29-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
