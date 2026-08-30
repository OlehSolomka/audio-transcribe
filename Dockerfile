# syntax=docker/dockerfile:1

FROM node:26.8.1-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:26.8.1-alpine3.24 AS whisper-builder
RUN apk add --no-cache build-base cmake git
WORKDIR /build
RUN git clone --branch v1.9.1 --depth 1 https://github.com/ggml-org/whisper.cpp.git .
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_EXAMPLES=ON -DBUILD_SHARED_LIBS=OFF \
 && cmake --build build -j --config Release --target whisper-cli

FROM alpine:3.22 AS model-downloader
RUN apk add --no-cache curl
WORKDIR /model
RUN curl -fL --retry 3 -o ggml-small.bin \
      https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin

FROM node:26.8.1-alpine3.24 AS runtime
WORKDIR /app

# node:22.14/22.15-alpine3.21 had 2 critical + ~38 high CVEs baked into its
# base layer (verified with trivy) -- almost entirely stale openssl/musl/zlib
# builds that Alpine had already patched in its own v3.21 repo, just not yet
# picked up by that image tag's snapshot. Alpine 3.22 starts from a much
# newer package baseline (0 critical, 4 high on a fresh scan). apk upgrade
# below closes the handful still remaining, and keeps closing new ones as
# Alpine patches them within the 3.22 branch, independent of when this image
# tag itself gets rebuilt.
#
# libstdc++/libgomp: whisper-cli is a compiled C++ binary that dynamically
# links these. The builder stage's build-base pulls them in as build deps
# automatically; this slim runtime image does not have them unless
# installed explicitly -- without them whisper-cli fails at process start
# with a missing shared-library error, even though the build succeeded.
RUN apk update && apk upgrade --no-cache && apk add --no-cache ffmpeg libstdc++ libgomp

# npm/npx/corepack ship inside the base Node image but are never invoked in
# this stage (it only ever runs `node server.js`) -- removing them drops
# their bundled JS dependencies (tar, minimatch, glob, sigstore) entirely,
# rather than shipping known CVEs in code that's simply never executed here.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Runs as root by default otherwise -- an unprivileged user limits the
# blast radius of anything that could ever go wrong inside the container
# (a dependency RCE, a container-escape bug) to appuser's own permissions
# rather than root's.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=whisper-builder --chown=appuser:appgroup /build/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=model-downloader --chown=appuser:appgroup /model/ggml-small.bin ./models/ggml-small.bin
COPY --chown=appuser:appgroup . .
RUN mkdir -p /app/temp && chown appuser:appgroup /app/temp

USER appuser

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server.js"]
