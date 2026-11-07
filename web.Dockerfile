# Interface Next.js. Contexte = racine du dépôt :  docker build -f web.Dockerfile -t rubix-web .
# RUBIX_API_URL (rewrites /api -> API) et NEXT_PUBLIC_API_MODE sont lus À LA COMPILATION.
FROM node:20-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG RUBIX_API_URL=http://api:8000
ARG NEXT_PUBLIC_API_MODE=http
ENV RUBIX_API_URL=$RUBIX_API_URL NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE
RUN pnpm build
RUN useradd --system --uid 10001 --create-home rubixweb && chown -R rubixweb /app/.next
USER rubixweb
EXPOSE 3000
CMD ["pnpm", "start", "--hostname", "0.0.0.0"]
