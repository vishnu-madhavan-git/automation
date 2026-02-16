import argparse
import time
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    parser = argparse.ArgumentParser(description="Simple heartbeat agent")
    parser.add_argument("--interval", type=float, default=5.0, help="Heartbeat interval in seconds")
    parser.add_argument("--max-beats", type=int, default=None, help="Stop after N beats")
    parser.add_argument("--log-file", type=str, default=None, help="Optional file to append output")
    args = parser.parse_args()

    beat = 0
    while True:
        beat += 1
        line = f"[{now_iso()}] hello-agent heartbeat #{beat}"
        print(line, flush=True)

        if args.log_file:
            with open(args.log_file, "a", encoding="utf-8") as handle:
                handle.write(f"{line}\n")

        if args.max_beats is not None and beat >= args.max_beats:
            break

        time.sleep(args.interval)


if __name__ == "__main__":
    main()