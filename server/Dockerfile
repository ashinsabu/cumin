FROM golang:1.25-alpine AS builder

# Railway injects RAILWAY_GIT_COMMIT_SHA and RAILWAY_GIT_BRANCH at build time.
# Local builds get "dev" defaults.
ARG RAILWAY_GIT_COMMIT_SHA=unknown
ARG RAILWAY_GIT_BRANCH=unknown
ARG VERSION=dev

WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .

RUN COMMIT=$(printf '%.7s' "${RAILWAY_GIT_COMMIT_SHA}") && \
    BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) && \
    CGO_ENABLED=0 go build \
      -ldflags "-X github.com/ashinsabu/cumin/server/version.GitCommit=${COMMIT} \
                -X github.com/ashinsabu/cumin/server/version.GitBranch=${RAILWAY_GIT_BRANCH} \
                -X github.com/ashinsabu/cumin/server/version.BuildTime=${BUILD_TIME} \
                -X github.com/ashinsabu/cumin/server/version.Version=${VERSION}" \
      -o /cumin ./cmd/cumin

FROM alpine:3.19

RUN apk add --no-cache ca-certificates
COPY --from=builder /cumin /cumin
COPY migrations /app/migrations
ENV MIGRATIONS_PATH=/app/migrations
EXPOSE 8080
CMD ["/cumin"]
