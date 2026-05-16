# ─────────────────────────────────────────
# Stage 1: Builder
# Full Rust toolchain to compile the engine
# ─────────────────────────────────────────
FROM rust:1.82-slim-bookworm AS builder

# Install system dependencies needed for compilation
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first for Docker layer caching
# This means cargo doesn't re-download deps on every code change
COPY Cargo.toml Cargo.lock* ./

# Create a dummy main.rs so cargo can fetch and cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -f target/release/deps/poseidon*

# Now copy the real source code and migrations
COPY src ./src
COPY migrations ./migrations

# Build the actual binary
RUN cargo build --release

# ─────────────────────────────────────────
# Stage 2: Runtime
# Minimal Debian image - no Rust toolchain
# Final image is ~100MB instead of ~2GB
# ─────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# Install only what the binary needs at runtime
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only the compiled binary and migrations from builder
COPY --from=builder /app/target/release/poseidon ./poseidon
COPY --from=builder /app/migrations ./migrations

# Non-root user for security
RUN useradd -r -s /bin/false poseidon
RUN chown -R poseidon:poseidon /app
USER poseidon

EXPOSE 8080
EXPOSE 9090

CMD ["./poseidon"]
