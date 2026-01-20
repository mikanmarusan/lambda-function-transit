# === Production Stage ===
FROM public.ecr.aws/lambda/nodejs:22 AS production

COPY src/package.json ${LAMBDA_TASK_ROOT}/
COPY src/index.mjs ${LAMBDA_TASK_ROOT}/

WORKDIR ${LAMBDA_TASK_ROOT}

RUN npm install --omit=dev

CMD ["index.handler"]

# === Development Stage ===
FROM node:22-slim AS development

WORKDIR /app
COPY src/ .

EXPOSE 8000

CMD ["node", "dev-server.mjs"]
