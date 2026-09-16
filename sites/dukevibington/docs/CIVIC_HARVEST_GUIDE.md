# Civic Intelligence Ingestion & Seeding Guide

Complete CLI reference for harvesting and pre-seeding USAspending procurement records into Cloudflare D1 and R2.

See full documentation at: [`servers/dukevibington/INGESTION_GUIDE.md`](./servers/dukevibington/INGESTION_GUIDE.md)

---

## Quick Reference Commands

### Harvest & Seed a State + All Its Counties in 1 Command:
```bash
# Illinois
node servers/dukevibington/batch_harvest.mjs IL --deploy

# Texas
node servers/dukevibington/batch_harvest.mjs TX --deploy

# California
node servers/dukevibington/batch_harvest.mjs CA --deploy

# New York
node servers/dukevibington/batch_harvest.mjs NY --deploy

# Virginia
node servers/dukevibington/batch_harvest.mjs VA --deploy

# Florida
node servers/dukevibington/batch_harvest.mjs FL --deploy
```

### Harvest & Seed National Federal Data:
```bash
node servers/dukevibington/batch_harvest.mjs US --deploy
```

### Batch Ingest All Core States:
```bash
node servers/dukevibington/batch_harvest.mjs --deploy
```
