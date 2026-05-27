FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /cumin ./cmd/cumin

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /cumin /cumin
EXPOSE 8080
CMD ["/cumin"]
