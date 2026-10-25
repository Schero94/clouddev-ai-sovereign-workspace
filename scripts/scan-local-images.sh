#!/bin/sh
set -eu

services="clouddev-router clouddev-ide clouddev-git clouddev-postgres"
build_services="clouddev-router clouddev-ide clouddev-git"
status=0
clouddev_trivy_tmp_dir=${CLOUDDEV_TRIVY_TMP_DIR:-}

if ! command -v trivy >/dev/null 2>&1; then
  printf '%s\n' 'Trivy is required. Install it with the official package manager for this host.' >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js is required to read image references from the Compose configuration.' >&2
  exit 2
fi

# Build from the current checkout without starting, stopping, or replacing any
# running containers. Build sequentially to keep peak memory predictable.
for service in $build_services; do
  printf 'Building Compose candidate for %s\n' "$service"
  docker compose build --pull "$service"
done

# The database is a registry image pinned by digest in Compose. Pull that exact
# candidate instead of inspecting an older container that may still be running.
docker compose pull clouddev-postgres

if [ -n "$clouddev_trivy_tmp_dir" ]; then
  mkdir -p "$clouddev_trivy_tmp_dir"
fi

for service in $services; do
  image_reference=$(docker compose config --format json | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const serviceName = process.argv[1];
    const config = JSON.parse(input);
    const service = config.services?.[serviceName];
    const image = service?.image
      ?? (service?.build && typeof config.name === "string" ? `${config.name}-${serviceName}` : null);
    if (typeof image !== "string" || image.trim() === "") {
      process.stderr.write("Compose service is missing an image reference.\\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(image);
  } catch {
    process.stderr.write("Could not read the Compose image reference.\\n");
    process.exitCode = 1;
  }
});
' "$service")
  if [ -z "$image_reference" ]; then
    printf 'No configured image reference was found for Compose service %s.\n' "$service" >&2
    status=1
    continue
  fi

  image_id=$(docker image inspect --format '{{.Id}}' "$image_reference")
  if [ -z "$image_id" ]; then
    printf 'The configured Compose image for %s could not be resolved locally.\n' "$service" >&2
    status=1
    continue
  fi

  printf '\nScanning Compose service %s (%s; %s)\n' "$service" "$image_reference" "$image_id"
  if [ -n "$clouddev_trivy_tmp_dir" ]; then
    if ! TMPDIR="$clouddev_trivy_tmp_dir" trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 "$image_id"; then
      status=1
    fi
  elif ! trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 "$image_id"; then
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  printf '%s\n' 'No HIGH or CRITICAL vulnerabilities were found in the configured Compose candidate images.'
fi

exit "$status"
