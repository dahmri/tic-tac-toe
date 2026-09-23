# Production image: the static site served by nginx.
# Build:  docker build --build-arg GIT_COMMIT=$(git rev-parse HEAD) -t tic-tac-toe .
# Run:    docker run -d -p 8080:80 tic-tac-toe

FROM node:25-alpine AS build
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

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/version.json >/dev/null || exit 1
