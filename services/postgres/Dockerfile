FROM --platform=$BUILDPLATFORM golang:1.27.4-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS gosu

ARG TARGETARCH
RUN apk add --no-cache git ca-certificates \
  && CGO_ENABLED=0 GOOS=linux GOARCH="${TARGETARCH}" go install github.com/tianon/gosu@1.20 \
  && src="$(go env GOPATH)/bin/gosu" \
  && if [ ! -x "$src" ]; then src="$(go env GOPATH)/bin/linux_${TARGETARCH}/gosu"; fi \
  && install -m 0755 "$src" /usr/local/bin/gosu

FROM postgres:18.7-alpine3.24@sha256:ff64c9e3bdf8e2120107d3559de8db314e8305f7e38c5105903c6295876738ff

# The published Postgres image carries gosu 1.20 built with Go 1.24.6 and
# libxml2 2.13.9-r2. Rebuild the same gosu release with patched Go and install
# Alpine's fixed libxml2 before the database entrypoint uses either one.
RUN apk add --no-cache libxml2=2.13.9-r3 \
  && apk info libxml2 | grep -F 2.13.9-r3

COPY --from=gosu /usr/local/bin/gosu /usr/local/bin/gosu
RUN chmod 0755 /usr/local/bin/gosu \
  && gosu --version \
  && gosu nobody true
