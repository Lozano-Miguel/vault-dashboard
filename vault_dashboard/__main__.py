import logging
import os
import signal
import sys
import threading

from .config import ConfigError, load_config
from .sampler import Sampler
from .server import make_server
from .store import Store


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        cfg = load_config()
    except ConfigError as e:
        print(f"config error: {e}", file=sys.stderr)
        return 2
    os.makedirs(cfg.data_dir, exist_ok=True)
    store = Store(os.path.join(cfg.data_dir, "vault.db"))
    sampler = Sampler(cfg, store)
    sampler.start()
    stop = threading.Event()
    sampler.run(stop)
    server = make_server(cfg, sampler, store)

    def shutdown(signum, frame):
        stop.set()
        threading.Thread(target=server.shutdown, daemon=True).start()  # shutdown() blocks; can't call it here

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    logging.getLogger("vault").info("watching %d services, listening on :%d", len(cfg.services), cfg.port)
    server.serve_forever()
    server.server_close()
    store.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
