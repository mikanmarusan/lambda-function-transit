# === Production Stage ===
FROM public.ecr.aws/lambda/nodejs:24 AS production

COPY src/package.json ${LAMBDA_TASK_ROOT}/
COPY src/index.mjs src/parse.mjs src/lines.mjs ${LAMBDA_TASK_ROOT}/

WORKDIR ${LAMBDA_TASK_ROOT}

RUN npm install --omit=dev

CMD ["index.handler"]

# === Development Stage ===
FROM node:24-slim AS development

WORKDIR /app
COPY src/ .

# dev-server.mjs binds 127.0.0.1 by default; listen on all interfaces so the published port is reachable
ENV DEV_SERVER_HOST=0.0.0.0

EXPOSE 8000

CMD ["node", "dev-server.mjs"]
