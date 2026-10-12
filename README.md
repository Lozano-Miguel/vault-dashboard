# vault-dashboard

![vault-dashboard](docs/img/dashboard.png)

A read-only dashboard for a small home server, styled as a Windows 2000 / *Serial
Experiments Lain* desktop. The wallpaper is a pixel-art ophanim with one eye per service
you watch. Healthy services keep their eyes open. A service that goes down closes its eye
and weeps. The wheels spin faster with CPU load and glow from cold white through amber
to red as the machine heats up.

Built for **vault**, an old mini-PC in a hot attic, but nothing in it is specific to vault.

## On screen

- **The ophanim:** one eye per service; the centre eye is the server itself. It follows your cursor.
- **THERMAL.SYS:** CPU temperature, outside temperature (Open-Meteo) and the gap between them, plus thermal throttling.
- **SYSTEM.EXE:** CPU, memory, disk, Wi-Fi signal, traffic and uptime.
- **WIRED.LNK:** the network as a tree (host → docker → network → containers → public sites) with response times. A dead container darkens the sites behind it.
- **root@vault: ~** a neofetch-style panel, with Lain drawn as pixel art from braille text.
- **TOP.EXE:** the busiest processes, Task Manager style.
- **MEMORY.DAT:** the last 24 hours: a temperature curve and a strip per service showing when it was down.
- **The ticker:** today's records, uptime this week, the last outage, and a few lines from the Wired.

It fills 16:9 screens edge to edge. Type `lain` for the easter egg.

- **Watches, never touches:** GET-only API, read-only mounts, no Docker socket.
- **Tiny:** Python standard library only, no runtime dependencies. Plain JS frontend, no build step.
- **Remembers:** samples every 5 minutes into SQLite and keeps 6 months.

## Run

```bash
cp .env.example .env              # set WIFI_IFACE, optionally LATITUDE/LONGITUDE
cp vault.example.json vault.json  # list your services
docker build -t vault-dashboard .
docker run -d --name vault-dashboard --env-file .env -e HOST_SYS=/host/sys \
  -v /proc:/host/proc:ro -v /sys:/host/sys:ro -v /etc/os-release:/host/os-release:ro \
  -v "$PWD/data:/data" -v "$PWD/vault.json:/config/vault.json:ro" \
  --network <your-docker-network> -p 8080:8080 vault-dashboard
```

The container has to share a Docker network with the services it checks by name.
Docker hides the CPU throttle counters under a container's own `/sys`, which is why the host's
`/sys` is mounted read-only at `/host/sys`.
Create `data/` yourself first, owned by UID 1000.

## Configure

`vault.json` lists the services. Each one has an `id` and a `check`, which is one of
`http://…`, `https://…` or `tcp://host:port`. Add `parent` to mark a public site that is
served by one of the containers. Everything else comes from environment variables; see
`.env.example`.

An HTTP service counts as up while it answers with any status below 500. A service is
marked down after 2 failed checks in a row.

## Develop

```bash
python3 -m unittest discover -s tests -t .   # backend
npm install && npx playwright test           # frontend (dev only)
```

`design/` holds the original Claude Design handoff.

MIT licensed.
