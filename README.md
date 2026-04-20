# 🔱 Poseidon

> Poseidon — god of the sea, shaker of the earth, destroyer of fleets, commander of storms...
> ...is a phishing simulation platform for security awareness training.
>
> Yeah. He traded his trident for an SMTP server. Times are tough.

Much like his domain, Poseidon runs deep:

* 🔱 **Engine** - Rust-powered core that creates, manages and fires phishing campaigns with zero mercy
* 🌊 **Dashboard** - React web UI for campaign management, template building and target lists
* 📊 **Observability** - Grafana, Prometheus and Loki stack showing exactly who clicked what and when

Built for security teams to test their own organizations. If you're using this anywhere you don't have explicit written authorization, that's not a Poseidon problem, that's a you problem.

---

## ⚠️ Legal Disclaimer

**Poseidon is strictly for authorized security awareness training within organizations you are explicitly permitted to test.**

Unauthorized use of this tool against systems or individuals without written consent is illegal and unethical. The authors accept zero liability for misuse. By using this software you confirm you have explicit written authorization from the target organization's appropriate authority.

This tool is intended for:
- Internal security teams running authorized phishing simulations
- Penetration testers operating under a signed statement of work
- Security awareness program managers with organizational approval

If you're unsure whether you have authorization, you don't.

---

## Why This Project Exists

Phishing is still the number one attack vector responsible for the majority of breaches. Yet most organizations run zero simulation exercises and have no idea how vulnerable their employees actually are. Poseidon bridges that gap — giving security teams an enterprise-grade awareness training platform without the enterprise price tag.

Honestly? I also just wanted to know how the pros actually do it. Understanding the mechanics of a phishing campaign — tracking pixels, unique redirect links, SMTP spoofing defenses — is the kind of hands-on knowledge you don't get from a textbook. Building the weapon is the fastest way to learn how to defend against it. And if it lands a job along the way, that works too.

---

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Engine | **Rust** | Core engine handles sensitive campaign data. Memory safety and performance aren't optional when you're tracking real employee behavior |
| Dashboard | **React** | Dashboard needs to be intuitive enough for non-technical security managers to use |
| Observability | **Grafana + Prometheus + Loki** | The same observability stack real SOC teams use. This isn't a classroom project |
| Deployment | **Docker Compose** | One command spins everything up. No 47-step installation guide |

---

## Features

### 🔱 Rust Core Engine
- Create and manage phishing campaigns via CLI
- Generate realistic phishing email templates
- Send emails via SMTP with per-target unique tracking links
- Track opens, clicks, and form submissions per target
- Log all campaign events to structured output
- Expose Prometheus metrics endpoint (`/metrics`)
- Full REST API bridging the engine and dashboard

### 🌊 React Dashboard
- Campaign management UI: create, launch, pause, archive
- Drag-and-drop email template builder
- Target list management with CSV import/export
- Real-time campaign status and live event feed
- User management for multiple security teams

### 📊 Observability Stack
- Prometheus scrapes campaign metrics from the engine
- Loki aggregates all structured campaign logs
- Grafana pre-built dashboards: click rates, open rates, submission rates, campaign comparisons

---

## Project Structure

```
poseidon/
├── engine/
│   ├── src/
│   │   ├── main.rs         # CLI entrypoint
│   │   ├── campaign.rs     # Campaign lifecycle management
│   │   ├── mailer.rs       # SMTP delivery engine
│   │   ├── tracker.rs      # Unique link generation & event tracking
│   │   ├── metrics.rs      # Prometheus metrics exposition
│   │   └── api.rs          # REST API server
│   └── Cargo.toml
│
├── dashboard/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Campaigns.jsx
│   │   │   ├── Templates.jsx
│   │   │   ├── Targets.jsx
│   │   │   └── Analytics.jsx
│   │   └── App.jsx
│   └── package.json
│
├── observability/
│   ├── prometheus.yml
│   ├── loki-config.yml
│   └── grafana/
│       └── dashboards/
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/yourusername/poseidon.git
cd poseidon

# Copy and configure environment
cp .env.example .env

# Spin up the full stack
docker compose up -d
```

Dashboard: `http://localhost:3000`
Grafana: `http://localhost:3001`
Engine API: `http://localhost:8080`

---

## Inspired By

Architecture inspired by [GoPhish](https://github.com/gophish/gophish). Built from the ground up in Rust + React for modern security teams that need more than a checkbox tool.

---

## License

MIT - see [LICENSE](LICENSE)

---

*Poseidon doesn't ask if you're ready. He just sends the wave.*
