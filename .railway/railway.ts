import {
  defineRailway,
  postgres,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

const EU_WEST = "europe-west4-drams3a";
const ONE_REPLICA = { [EU_WEST]: 1 };
export default defineRailway(() => {
  const postgresService = postgres("clouddev-postgres", { region: EU_WEST });

  const workspaceData = volume("clouddev-workspace-data", {
    region: EU_WEST,
    sizeMB: 5120,
  });
  const forgejoData = volume("clouddev-forgejo-data", {
    region: EU_WEST,
    sizeMB: 5120,
  });
  const routerData = volume("clouddev-router-data", {
    region: EU_WEST,
    sizeMB: 1024,
  });

  const router = service("clouddev-router", {
    build: { builder: "DOCKERFILE", dockerfilePath: "services/omniroute/Dockerfile" },
    replicas: ONE_REPLICA,
    volumeMounts: { "/app/data": routerData },
    healthcheck: "/omniroute/healthz",
    healthcheckTimeout: 120,
    deploy: {
      sleepApplication: false,
      restartPolicyType: "ALWAYS",
    },
    env: {
      DATA_DIR: "/app/data",
      PORT: "20128",
      DASHBOARD_PORT: "20128",
      API_PORT: "20131",
      API_HOST: "127.0.0.1",
      OMNIROUTE_BASE_PATH: "/omniroute",
      NEXT_PUBLIC_OMNIROUTE_BASE_PATH: "/omniroute",
      INITIAL_PASSWORD: preserve(),
      JWT_SECRET: preserve(),
      API_KEY_SECRET: preserve(),
      STORAGE_ENCRYPTION_KEY: preserve(),
      STORAGE_ENCRYPTION_KEY_VERSION: "v1",
      MACHINE_ID_SALT: preserve(),
      OMNIROUTE_WS_BRIDGE_SECRET: preserve(),
      AUTH_COOKIE_SECURE: "true",
      REQUIRE_API_KEY: "true",
      APP_LOG_LEVEL: "warn",
      APP_LOG_TO_FILE: "false",
      APP_LOG_RETENTION_DAYS: "1",
      CALL_LOG_RETENTION_DAYS: "1",
      ENABLE_REQUEST_LOGS: "false",
      CALL_LOG_PIPELINE_CAPTURE_STREAM_CHUNKS: "false",
      PROXY_LOG_INCLUDE_IPS: "false",
      PROXY_LOG_FIRST_CHUNK_TIMING: "false",
      ARENA_ELO_SYNC_ENABLED: "false",
      MODELS_DEV_SYNC_ENABLED: "false",
    },
  });

  const forgejo = service("clouddev-git", {
    rootDirectory: "services/forgejo",
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    replicas: ONE_REPLICA,
    volumeMounts: { "/var/lib/gitea": forgejoData },
    tcpProxies: ["2222"],
    healthcheck: "/api/healthz",
    healthcheckTimeout: 180,
    deploy: {
      sleepApplication: false,
      restartPolicyType: "ALWAYS",
    },
    env: {
      FORGEJO__database__DB_TYPE: "postgres",
      FORGEJO__database__HOST: postgresService.env.PGHOST,
      FORGEJO_POSTGRES_ADMIN_HOST: postgresService.env.PGHOST,
      FORGEJO_POSTGRES_ADMIN_PORT: postgresService.env.PGPORT,
      FORGEJO_POSTGRES_ADMIN_DATABASE: postgresService.env.PGDATABASE,
      FORGEJO_POSTGRES_ADMIN_USER: postgresService.env.PGUSER,
      FORGEJO_POSTGRES_ADMIN_PASSWORD: postgresService.env.PGPASSWORD,
      FORGEJO_POSTGRES_ROLE: "clouddev_forgejo",
      FORGEJO_POSTGRES_DATABASE: "forgejo",
      FORGEJO_POSTGRES_PASSWORD: preserve(),
      FORGEJO_ADMIN_USERNAME: "owner",
      FORGEJO_ADMIN_EMAIL: "owner@localhost.invalid",
      FORGEJO_ADMIN_PASSWORD: preserve(),
      FORGEJO__service__DISABLE_REGISTRATION: "true",
      FORGEJO__service__REQUIRE_SIGNIN_VIEW: "true",
      FORGEJO__repository__DEFAULT_PRIVATE: "private",
      FORGEJO__server__DISABLE_SSH: "false",
      FORGEJO__server__START_SSH_SERVER: "true",
      FORGEJO__server__SSH_LISTEN_PORT: "2222",
    },
  });

  const ide = service("clouddev-ide", {
    build: { builder: "DOCKERFILE", dockerfilePath: "services/ide/Dockerfile" },
    replicas: ONE_REPLICA,
    volumeMounts: { "/workspace": workspaceData },
    tcpProxies: ["2222"],
    healthcheck: "/healthz",
    healthcheckTimeout: 180,
    deploy: {
      sleepApplication: false,
      restartPolicyType: "ALWAYS",
    },
    env: {
      CODE_SERVER_PASSWORD: preserve(),
      CLOUDDEV_WORKSPACE_AUTH_SECRET: preserve(),
      SSH_AUTHORIZED_KEYS: preserve(),
      CLOUDDEV_OMNIROUTE_BASE_URL: "http://127.0.0.1:20129",
      CLOUDDEV_OMNIROUTE_HOST: router.env.RAILWAY_PRIVATE_DOMAIN,
      CLOUDDEV_OMNIROUTE_PORT: "20128",
      CLOUDDEV_OMNIROUTE_PROXY_PORT: "20129",
      CLOUDDEV_FORGEJO_HOST: forgejo.env.RAILWAY_PRIVATE_DOMAIN,
      CLOUDDEV_FORGEJO_PORT: "3000",
      GIT_PUBLIC_URL: forgejo.env.RAILWAY_PUBLIC_DOMAIN,
      GIT_SSH_PROXY_HOST: forgejo.env.RAILWAY_TCP_PROXY_DOMAIN,
      GIT_SSH_PROXY_PORT: forgejo.env.RAILWAY_TCP_PROXY_PORT,
    },
  });

  return project("clouddev-ai-sovereign-workspace", {
    resources: [
      ide,
      forgejo,
      postgresService,
      router,
      workspaceData,
      forgejoData,
      routerData,
    ],
  });
});
