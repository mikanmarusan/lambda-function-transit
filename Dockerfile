FROM public.ecr.aws/lambda/nodejs:22

COPY src/package.json ${LAMBDA_TASK_ROOT}/
COPY src/index.mjs ${LAMBDA_TASK_ROOT}/

WORKDIR ${LAMBDA_TASK_ROOT}

RUN npm install --omit=dev

CMD ["index.handler"]
