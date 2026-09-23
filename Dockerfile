# Two images from one file:
#   api  the Node game server (accounts, and later presence and live games)
#   web  nginx: serves the site and forwards /api and /ws to the api
# compose.yaml builds and runs both, with PostgreSQL and Redis.
#
# Build one by hand: docker build --target api -t tic-tac-toe-api .
#                    docker build --target web --build-arg GIT_COMMIT=$(git rev-parse HEAD) -t tic-tac-toe-web .

# ---- the site's files ----
FROM node:25-alpine AS site
WORKDIR /app
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT
# The build uses only Node built-ins, so no npm install is needed
COPY package.json ./
COPY scripts/build.mjs scripts/
COPY index.html ./
COPY css/ css/
COPY js/ js/
RUN node scripts/build.mjs

# ---- server dependencies, without dev tools ----
FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- api ----
FROM node:25-alpine AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8000
WORKDIR /app
COPY --from=deps /app/node_modules node_modules/
COPY package.json ./
COPY server/ server/
# Rules shared with the browser (validation, countries, board rules)
COPY js/ js/
USER node
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8000/api/health >/dev/null || exit 1
CMD ["node", "server/index.js"]

# ---- web (the default target) ----
FROM nginx:stable-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=site /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1/version.json >/dev/null || exit 1
