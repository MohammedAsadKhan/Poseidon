# ─────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────
FROM rust:latest AS builder

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache dependencies first
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -f target/release/deps/poseidon*

# Build real binary
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

# ─────────────────────────────────────────
# Stage 2: Runtime
# ─────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/poseidon ./poseidon
COPY --from=builder /app/migrations ./migrations

RUN useradd -r -s /bin/false poseidon && chown -R poseidon:poseidon /app
USER poseidon

EXPOSE 8080
EXPOSE 9090

CMD ["./poseidon"]
