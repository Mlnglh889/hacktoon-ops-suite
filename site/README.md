# ARCHIVED — 18 Nov 2026

OPS Suite dipindah dari hosting Vercel ke repo ini karena VPS penuh (disk 94%)
dan akun Vercel mau di-takedown. Halaman hackathon Discourse tetap menunjuk ke
sini sebagai sumber arsip.

## Isi folder `site/`

Build statis final Stake Hub + landing (React, 2.3 MB). Semua halaman UI utuh:
Home / Product / Docs / Open Stake Hub (validators, RPC analyst, portfolio, dll).

Yang TIDAK bisa hidup lagi setelah cron & storage Vercel dimatikan:

- `/api/v3/*` — live chain reads (dulu jalan on-demand; masih bisa disalin
  jalannya-nya dari `api/` source lama kalau perlu)
- `/api/cron/rpc-probe` — probe history 8 hari (Vercel Blob) → snapshot
  terakhir ada di `data/snapshot-final/` (per endpoint: 8 sampel lengkap).

## Cara menjalankan lokal

```bash
cd site && python3 -m http.server 8080
# buka http://localhost:8080
```

Atau deploy gratis ke GitHub Pages: Settings → Pages → Source = branch `main`,
folder `/site`. (UI akan menampilkan "unavailable" untuk angka live — sesuai
prinsip honesty suite, tidak ada nilai fiktif.)

## Aset lain

- Video demo 9.1 MB: di GitHub Release tag `archive` (`releases/demo-video.mp4`)
  — terlalu besar buat commit biasa tanpa LFS.
- Kontrak OpsRegistry: `artifacts/OpsRegistry.json` (alamat & tx on-chain tetap
  bisa diverifikasi via scanner-testnet-v3.portaldot.dev).

## Bukti on-chain yang tersisa (jangan hapus)

| Artefak | Lokasi |
|---|---|
| OpsRegistry contract | lihat artifacts/OpsRegistry.json |
| Deployment evidence | data/deployment-evidence.json |
| Testnet evidence log | data/testnet-evidence.md |
| Snapshot API final | data/snapshot-final/*.json |
